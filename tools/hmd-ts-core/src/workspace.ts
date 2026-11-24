/**
 * The workspace and the four-phase resolver — a port of
 * `tools/hmd/src/hypermarkdown/resolve.py`.
 *
 * Resolution order is named import, then spine, then imported search paths,
 * then autodiscovery. Precedence follows explicitness: a named import may
 * shadow a local card because that is what it is for, while an imported search
 * path may not — so adding `import *` can only resolve links that were
 * previously red, and can never change what an already-working link means.
 */

import { MARKER_DIR } from "./config.js";
import { cardText, decodeCard } from "./encoding.js";
import type { WorkspaceHost } from "./host.js";
import type { ImportStmt, ParsedDocument } from "./model.js";
import { dotSegmentOutsideRelative, parse } from "./parse.js";
import {
  CARD_SUFFIXES,
  INDEX_STEM,
  SUFFIX,
  cardSuffix,
  compareCodePoints,
  dirnameRel,
  isUnder,
  joinRel,
  normalizeParts,
  pageParts,
  split,
} from "./paths.js";
import { nfc } from "./unicode.js";

export { INDEX_STEM, SUFFIX };

export type Outcome = "resolved" | "unresolved" | "ambiguous" | "escapes";

/**
 * What `Workspace.bind` returns for a path that leaves the namespace: outside
 * the root, inside a nested vault, or through a symbolic link that leads out of
 * the root. It is HMD003, never an ordinary missing card.
 */
export const ESCAPES: unique symbol = Symbol("escapes");
export type Escapes = typeof ESCAPES;

export interface Resolution {
  outcome: Outcome;
  path: string | null;
  candidates: readonly string[];
  /** Which phase produced a resolved result, for diagnostics and tests. */
  phase: number | null;
  /** Origins that also held the name but lost on declaration order (HMD016). */
  shadowed: readonly string[];
  /**
   * Imported search paths, after the one that resolved, through which the
   * reference leaves the namespace. Each is HMD003 on its own; none changes
   * the result.
   */
  escaped: readonly string[];
}

function resolution(partial: Partial<Resolution> & { outcome: Outcome }): Resolution {
  return {
    path: null,
    candidates: [],
    phase: null,
    shadowed: [],
    escaped: [],
    ...partial,
  };
}

export interface ImportTable {
  bindings: Map<string, string>;
  searchPaths: string[];
  /** (rule, message, statement) problems found while building the table; the
   * statement says where each is reported. */
  problems: Array<readonly [string, string, ImportStmt]>;
}

export interface WorkspaceConfig {
  autodiscovery: boolean;
  mode: "both" | "recursive";
  /** Where the root came from, for `hmd info`-style reporting. */
  source: string | null;
}

export const DEFAULT_CONFIG: WorkspaceConfig = {
  autodiscovery: true,
  mode: "both",
  source: null,
};

/** Every card under the namespace root, plus resolution over them. */
export class Workspace {
  readonly documents = new Map<string, ParsedDocument>();
  private readonly pageList: string[] = [];
  /** Built on demand from `pageList`; see `ensureIndex`. */
  private readonly byParts = new Map<string, string[]>();
  /** Shadowed card -> the card of the same name that shadows it (HMD018). */
  private readonly shadowed = new Map<string, string>();
  private indexed = false;
  private readonly directories = new Set<string>([""]);
  /**
   * A card's path in NFC -> its path as stored. A reference and a name on disk
   * are compared in NFC, because the same name can be stored in either form
   * and must resolve the same way everywhere.
   */
  private readonly byNfc = new Map<string, string>();
  /** The same, for every directory below the root (import origins). */
  private readonly directoriesByNfc = new Map<string, string>([["", ""]]);
  /** Files with a card extension that are not UTF-8 -> why (HMD019). */
  private readonly undecodableFiles = new Map<string, string>();
  /** Roots of the vaults nested below this one; their cards are not ours. */
  private readonly nestedRoots = new Set<string>();
  /**
   * Symbolic links below the root that lead out of it, in NFC, as the host
   * reported them. Nothing through one is part of the namespace.
   */
  private readonly escapingLinks = new Set<string>();
  private readonly importTables = new Map<string, ImportTable>();
  private readonly resolveCache = new Map<string, Resolution>();

  constructor(readonly config: WorkspaceConfig = DEFAULT_CONFIG) {}

  // -- loading ---------------------------------------------------------

  /** Walk the namespace root and parse every card under it. */
  static async load(
    host: WorkspaceHost,
    config: WorkspaceConfig = DEFAULT_CONFIG,
  ): Promise<Workspace> {
    const workspace = new Workspace(config);
    const paths: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      const entries = await host.listDirectory(dir);
      // A directory below the root that carries its own marker is another
      // vault: none of it belongs to this one. The root's own marker does not
      // count, since every vault has one.
      if (dir !== "" && entries.some((e) => e.isDirectory && e.name === MARKER_DIR)) {
        workspace.nestedRoots.add(dir);
        return;
      }
      workspace.noteDirectory(dir);
      // Sorted before use: depending on host iteration order would make
      // resolution vary by platform, which is determinism's first casualty.
      entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const rel = joinRel(dir, entry.name);
        if (entry.leavesRoot === true) {
          workspace.escapingLinks.add(nfc(rel));
          continue;
        }
        if (entry.isDirectory) await walk(rel);
        else if (cardSuffix(entry.name) !== null) paths.push(rel);
      }
    };

    await walk("");
    paths.sort();

    for (const rel of paths) {
      const read = await readCard(host, rel);
      if (!read.ok) {
        // Not a card: not parsed, not a target, not a page.
        workspace.undecodableFiles.set(rel, read.message);
        continue;
      }
      // Two names on disk that are one name in NFC: only the first, in sorted
      // order, is the card at that name.
      if (workspace.byNfc.has(nfc(rel))) continue;
      workspace.addDocument(rel, parse(rel, read.text));
    }

    return workspace;
  }

  private noteDirectory(dir: string): void {
    this.directories.add(dir);
    if (!this.directoriesByNfc.has(nfc(dir))) this.directoriesByNfc.set(nfc(dir), dir);
  }

  /**
   * Whether `rel` is a nested vault's root or lies beneath one.
   *
   * Hosts that feed cards incrementally (a file watcher, an open editor) ask
   * this before parsing, so a card of the inner vault never reaches the outer.
   */
  inNestedVault(rel: string): boolean {
    for (const nested of this.nestedRoots) {
      if (rel === nested || rel.startsWith(`${nested}/`)) return true;
    }
    return false;
  }

  /**
   * Add or replace one card. Used by `load` and by incremental updates.
   *
   * A card inside a nested vault is ignored: it belongs to that vault.
   */
  addDocument(rel: string, document: ParsedDocument): void {
    if (this.inNestedVault(rel)) return;
    // Another file already holds this name in NFC; it stays the card.
    const holder = this.byNfc.get(nfc(rel));
    if (holder !== undefined && holder !== rel) return;
    this.undecodableFiles.delete(rel);
    const isNew = !this.documents.has(rel);
    this.documents.set(rel, document);
    if (isNew) {
      this.byNfc.set(nfc(rel), rel);
      this.pageList.push(rel);
      this.pageList.sort();
      let dir = dirnameRel(rel);
      for (;;) {
        this.noteDirectory(dir);
        if (dir === "") break;
        dir = dirnameRel(dir);
      }
    }
    this.invalidate();
  }

  /**
   * Record that `rel` has a card extension and is not UTF-8 (HMD019), for
   * hosts that feed files incrementally. It stops being a card if it was one.
   */
  addUndecodable(rel: string, message: string): void {
    if (this.inNestedVault(rel)) return;
    this.removeDocument(rel);
    this.undecodableFiles.set(rel, message);
  }

  removeDocument(rel: string): void {
    this.undecodableFiles.delete(rel);
    if (!this.documents.delete(rel)) return;
    if (this.byNfc.get(nfc(rel)) === rel) this.byNfc.delete(nfc(rel));
    const at = this.pageList.indexOf(rel);
    if (at !== -1) this.pageList.splice(at, 1);
    this.invalidate();
  }

  /** Files with a card extension that are not UTF-8, and why, sorted by path. */
  undecodable(): Array<readonly [string, string]> {
    return [...this.undecodableFiles.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  }

  /** The card at `rel` as stored, comparing names in NFC; null when none is. */
  card(rel: string): string | null {
    return this.byNfc.get(nfc(rel)) ?? null;
  }

  /** The directory at `rel` as stored, comparing names in NFC; null when none is. */
  directory(rel: string): string | null {
    return this.directoriesByNfc.get(nfc(rel)) ?? null;
  }

  /** Drop every memoised answer. Cheap, and the alternative is stale links. */
  invalidate(): void {
    this.importTables.clear();
    this.resolveCache.clear();
    this.indexed = false;
  }

  /**
   * Rebuild the shadow map and the sweep index from the page list.
   *
   * Files of one directory whose names differ only in their card extension
   * claim one name; the earliest extension is the card at it, and every other
   * is shadowed. A shadowed card is indexed too: a reference that writes its
   * extension reaches it in the sweep, and one that writes none skips it.
   */
  private ensureIndex(): void {
    if (this.indexed) return;
    this.byParts.clear();
    this.shadowed.clear();
    const claims = new Map<string, string[]>();
    for (const page of this.pageList) push(claims, nfc(pageParts(page).join("/")), page);
    for (const claimants of claims.values()) {
      const ranked = [...claimants].sort((a, b) => rank(a) - rank(b));
      for (const loser of ranked.slice(1)) this.shadowed.set(loser, ranked[0]!);
    }
    for (const page of this.pageList) this.indexParts(page);
    this.indexed = true;
  }

  /** The card that shadows `rel`, or null when nothing does. */
  shadowedBy(rel: string): string | null {
    this.ensureIndex();
    return this.shadowed.get(rel) ?? null;
  }

  private indexParts(rel: string): void {
    const parts = pageParts(rel).map(nfc);
    push(this.byParts, parts.join("/"), rel);
    // A folder note is also addressable by its directory's name, so a bare
    // name means the same thing in phase 1 and phase 3.
    if (parts.length > 1 && parts[parts.length - 1] === INDEX_STEM) {
      push(this.byParts, parts.slice(0, -1).join("/"), rel);
    }
  }

  pages(): string[] {
    return [...this.pageList];
  }

  hasDirectory(rel: string): boolean {
    return this.directory(rel) !== null;
  }

  // -- binding ---------------------------------------------------------

  /**
   * Look `parts` up in one directory, honouring folder notes: the
   * specification's *Resolving a reference within a directory*.
   *
   * The path is normalised first, and one that leaves the namespace is
   * `ESCAPES`. The card extensions are tried in priority order, then the folder
   * note with the same extensions in the same order. A target naming a
   * directory resolves to that directory's folder note. When both `foo.hmd` and
   * `foo/index.hmd` exist the file wins; the collision is reported separately
   * as HMD012. A `suffix` the reference wrote binds only that extension, and
   * `directoryOnly` — `[[./]]` and `[[../]]` — binds only the folder note.
   * Names compare in NFC, and the card returned is the path as stored.
   */
  bind(
    directory: string,
    parts: readonly string[],
    suffix: string | null = null,
    directoryOnly = false,
  ): string | null | Escapes {
    if (parts.length === 0 && !directoryOnly) return null;
    const normalized = normalizeParts([...split(directory), ...parts]);
    if (normalized.escapes || this.violates(normalized.parts)) return ESCAPES;
    const base = normalized.parts;
    const suffixes = suffix === null ? CARD_SUFFIXES : [suffix];

    const candidates: string[] = [];
    if (!directoryOnly && base.length > 0) {
      const last = base[base.length - 1]!;
      for (const each of suffixes) candidates.push(joinRel("", ...base.slice(0, -1), `${last}${each}`));
    }
    for (const each of suffixes) candidates.push(joinRel("", ...base, `${INDEX_STEM}${each}`));

    for (const candidate of candidates) {
      if (this.escapingLinks.has(nfc(candidate))) return ESCAPES;
      const card = this.card(candidate);
      if (card !== null) return card;
    }
    return null;
  }

  /**
   * Whether normalised root-relative `parts` break the namespace's boundaries:
   * inside a nested vault, or reached through a symbolic link out of the root.
   */
  private violates(parts: readonly string[]): boolean {
    if (this.inNestedVault(parts.join("/"))) return true;
    if (this.escapingLinks.size === 0) return false;
    for (let i = 1; i <= parts.length; i++) {
      if (this.escapingLinks.has(nfc(parts.slice(0, i).join("/")))) return true;
    }
    return false;
  }

  // -- imports ---------------------------------------------------------

  importTable(source: string): ImportTable {
    let table = this.importTables.get(source);
    if (table === undefined) {
      table = this.buildImportTable(source);
      this.importTables.set(source, table);
    }
    return table;
  }

  private buildImportTable(source: string): ImportTable {
    const table: ImportTable = { bindings: new Map(), searchPaths: [], problems: [] };
    const document = this.documents.get(source);
    if (document === undefined) return table;

    for (const stmt of document.card.imports) {
      const named = this.importDir(source, stmt);
      if (named === null) {
        table.problems.push([
          "HMD003",
          `import ref '${stmt.ref}' resolves outside the namespace root`,
          stmt,
        ]);
        continue;
      }
      // Looked up in NFC, then used as stored.
      const directory = this.directory(named);
      if (directory === null) {
        table.problems.push(["HMD015", `import ref '${stmt.ref}' does not exist`, stmt]);
        continue;
      }

      if (stmt.wildcard) {
        table.searchPaths.push(directory);
        continue;
      }

      for (const [name, local] of stmt.bindings) {
        const target = this.bind(directory, [name]);
        if (typeof target !== "string") {
          table.problems.push([
            "HMD015",
            `cannot import '${name}' from '${stmt.ref}': no such page`,
            stmt,
          ]);
          continue;
        }
        const existing = table.bindings.get(local);
        // Two bindings of one name are an error even when they reach one card:
        // the name is declared twice. The first binding stands.
        if (existing !== undefined) {
          table.problems.push([
            "HMD015",
            `'${local}' is bound twice by imports (${existing} and ${target})`,
            stmt,
          ]);
          continue;
        }
        table.bindings.set(local, target);
      }
    }

    return table;
  }

  private importDir(source: string, stmt: ImportStmt): string | null {
    const base = stmt.ref.startsWith("/")
      ? split(stmt.ref)
      : [...split(dirnameRel(source)), ...stmt.ref.split("/")];
    const { parts, escapes } = normalizeParts(base);
    return escapes ? null : parts.join("/");
  }

  // -- effective feature toggles ---------------------------------------

  /**
   * Card `use`, then the nearest ancestor `index.hmd`, then config.
   *
   * Frontmatter always beats configuration, because the card is the most local
   * place an author can say what they mean.
   */
  autodiscoveryEnabled(source: string): boolean {
    const document = this.documents.get(source);
    if (document !== undefined && "autodiscovery" in document.card.use) {
      return document.card.use["autodiscovery"]!;
    }

    let directory = dirnameRel(source);
    for (;;) {
      const note = joinRel(directory, `${INDEX_STEM}${SUFFIX}`);
      if (note !== source) {
        const noteDoc = this.documents.get(note);
        if (noteDoc !== undefined && "autodiscovery" in noteDoc.card.use) {
          return noteDoc.card.use["autodiscovery"]!;
        }
      }
      if (directory === "") break;
      directory = dirnameRel(directory);
    }

    return this.config.autodiscovery;
  }

  // -- the algorithm ---------------------------------------------------

  resolve(source: string, pageRef: string): Resolution {
    const key = `${source} ${pageRef}`;
    const cached = this.resolveCache.get(key);
    if (cached !== undefined) return cached;
    const result = this.resolveUncached(source, pageRef);
    this.resolveCache.set(key, result);
    return result;
  }

  private resolveUncached(source: string, written: string): Resolution {
    const pageRef = nfc(written);
    const suffix = cardSuffix(pageRef);
    const stem = suffix === null ? pageRef : pageRef.slice(0, -suffix.length);

    // Malformed (HMD010): never a link, so never resolved.
    if (dotSegmentOutsideRelative(stem)) return resolution({ outcome: "unresolved" });

    if (stem.startsWith("/")) return bound(this.bind("", split(stem), suffix));

    if (stem.startsWith("./") || stem.startsWith("../")) {
      const { parts, escapes } = normalizeParts([
        ...split(dirnameRel(source)),
        ...stem.split("/"),
      ]);
      if (escapes || this.violates(parts)) return resolution({ outcome: "escapes" });
      const last = stem.replace(/\/+$/, "").split("/").pop();
      if (parts.length === 0 || last === "." || last === "..") {
        // `[[./]]`, `[[../]]`, or a last component of `.` or `..`: the
        // directory itself, so its folder note.
        return bound(this.bind(parts.join("/"), [], suffix, true));
      }
      return bound(this.bind(parts.slice(0, -1).join("/"), [parts[parts.length - 1]!], suffix));
    }

    const parts = split(stem);
    if (parts.length === 0) return resolution({ outcome: "unresolved" });

    const table = this.importTable(source);

    // Phase 0 — named imports. A binding names a page, not a namespace, so it
    // applies to single-segment targets only, and not to a reference that
    // writes an extension the bound card does not have.
    if (parts.length === 1) {
      const named = table.bindings.get(parts[0]!);
      if (named !== undefined && (suffix === null || cardSuffix(named) === suffix)) {
        return resolution({ outcome: "resolved", path: named, phase: 0 });
      }
    }

    // Phase 1 — spine walk, non-recursive, nearest first.
    for (const directory of this.spine(source)) {
      const target = this.bind(directory, parts, suffix);
      if (target === ESCAPES) return resolution({ outcome: "escapes" });
      if (target !== null) {
        return resolution({ outcome: "resolved", path: target, phase: 1 });
      }
    }

    // Phase 2 — imported search paths, in declaration order. Every one is
    // probed: the first card wins, and each other distinct card is shadowed
    // (HMD016). One card reached twice is not a collision.
    // A path that leaves the namespace before anything matched is the
    // outcome; after a match it is reported on its own and changes nothing.
    const found: string[] = [];
    const escaped: string[] = [];
    for (const directory of table.searchPaths) {
      const target = this.bind(directory, parts, suffix);
      if (target === ESCAPES) {
        if (found.length === 0) return resolution({ outcome: "escapes" });
        escaped.push(directory);
        continue;
      }
      if (target !== null && !found.includes(target)) found.push(target);
    }
    if (found.length > 0) {
      return resolution({
        outcome: "resolved",
        path: found[0]!,
        phase: 2,
        shadowed: found.slice(1),
        escaped,
      });
    }

    if (!this.autodiscoveryEnabled(source)) return resolution({ outcome: "unresolved" });

    // Phase 3 — autodiscovery, at most once.
    const matches = this.sweep(source, parts, suffix);
    if (matches.length === 1) {
      return resolution({ outcome: "resolved", path: matches[0]!, phase: 3 });
    }
    if (matches.length > 1) {
      return resolution({ outcome: "ambiguous", candidates: matches });
    }
    return resolution({ outcome: "unresolved" });
  }

  /** The source's own directory outward to the root, inclusive. */
  private spine(source: string): string[] {
    const out: string[] = [];
    let directory = dirnameRel(source);
    for (;;) {
      out.push(directory);
      if (directory === "") break;
      directory = dirnameRel(directory);
    }
    return out;
  }

  /**
   * Whether a folder note, matched by its directory's name, gives way: a card
   * beside the directory claims the same name and is selected in every phase
   * (HMD012), while the note stays reachable by its `index` path. Only a card
   * the reference could bind counts: one with the written extension, or any
   * card that is not shadowed.
   */
  private noteYieldsToCard(page: string, keyParts: readonly string[], ext: string | null): boolean {
    const parts = pageParts(page).map(nfc);
    if (parts.length < 2 || parts[parts.length - 1] !== INDEX_STEM) return false;
    if (keyParts.join("/") !== parts.slice(0, -1).join("/")) return false;
    const directory = dirnameRel(page);
    for (const each of ext === null ? CARD_SUFFIXES : [ext]) {
      const card = this.card(`${directory}${each}`);
      if (card !== null && (ext !== null || !this.shadowed.has(card))) return true;
    }
    return false;
  }

  private sweep(source: string, parts: readonly string[], ext: string | null): string[] {
    this.ensureIndex();
    const scope = this.config.mode === "recursive" ? dirnameRel(source) : "";
    const suffix = parts.join("/");
    const matches = new Set<string>();

    for (const [key, pages] of this.byParts) {
      const keyParts = key === "" ? [] : key.split("/");
      if (keyParts.length < parts.length) continue;
      if (keyParts.slice(keyParts.length - parts.length).join("/") !== suffix) continue;
      for (const page of pages) {
        if (ext !== null ? cardSuffix(page) !== ext : this.shadowed.has(page)) continue;
        if (this.noteYieldsToCard(page, keyParts, ext)) continue;
        if (scope === "" || isUnder(scope, page)) matches.add(page);
      }
    }

    // Sorted by root-relative POSIX path in code-point order, so diagnostics
    // are byte-identical across platforms, runs, and implementations.
    return [...matches].sort(compareCodePoints);
  }
}

/** The resolution of a path reference from what `bind` returned. */
function bound(target: string | null | Escapes): Resolution {
  if (target === ESCAPES) return resolution({ outcome: "escapes" });
  if (target === null) return resolution({ outcome: "unresolved" });
  return resolution({ outcome: "resolved", path: target });
}

/** The priority of a card's extension: lower wins a shared name. */
function rank(rel: string): number {
  const suffix = cardSuffix(rel);
  return suffix === null ? CARD_SUFFIXES.length : CARD_SUFFIXES.indexOf(suffix);
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else if (!list.includes(value)) list.push(value);
}

/** A card's text from the host, or why the file is not a card (HMD019). */
async function readCard(
  host: WorkspaceHost,
  rel: string,
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  if (host.readBytes !== undefined) return decodeCard(await host.readBytes(rel));
  return { ok: true, text: cardText(await host.readFile(rel)) };
}
