/**
 * The workspace and the four-phase resolver (HMD-0001 §5) — a port of
 * `tools/hmd/src/hypermarkdown/resolve.py`.
 *
 * Resolution order is named import, then spine, then imported search paths,
 * then autodiscovery. Precedence follows explicitness: a named import may
 * shadow a local card because that is what it is for, while an imported search
 * path may not — so adding `import *` can only resolve links that were
 * previously red, and can never change what an already-working link means.
 */

import { MARKER_DIR } from "./config.js";
import type { WorkspaceHost } from "./host.js";
import type { ImportStmt, ParsedDocument } from "./model.js";
import { parse } from "./parse.js";
import {
  INDEX_STEM,
  SUFFIX,
  dirnameRel,
  isUnder,
  joinRel,
  normalizeParts,
  pageParts,
  split,
  withHmdSuffix,
} from "./paths.js";

export { INDEX_STEM, SUFFIX };

export type Outcome = "resolved" | "unresolved" | "ambiguous" | "escapes";

export interface Resolution {
  outcome: Outcome;
  path: string | null;
  candidates: readonly string[];
  /** Which phase produced a resolved result, for diagnostics and tests. */
  phase: number | null;
  /** Origins that also held the name but lost on declaration order (HMD016). */
  shadowed: readonly string[];
}

function resolution(partial: Partial<Resolution> & { outcome: Outcome }): Resolution {
  return {
    path: null,
    candidates: [],
    phase: null,
    shadowed: [],
    ...partial,
  };
}

export interface ImportTable {
  bindings: Map<string, string>;
  searchPaths: string[];
  /** (rule, message) problems found while building the table. */
  problems: Array<readonly [string, string]>;
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

/** Every `.hmd` file under the namespace root, plus resolution over them. */
export class Workspace {
  readonly documents = new Map<string, ParsedDocument>();
  private readonly pageList: string[] = [];
  private readonly byParts = new Map<string, string[]>();
  private readonly directories = new Set<string>([""]);
  /** Roots of the vaults nested below this one; their cards are not ours. */
  private readonly nestedRoots = new Set<string>();
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
      workspace.directories.add(dir);
      // Sorted before use: depending on host iteration order would make
      // resolution vary by platform, which is determinism's first casualty.
      entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const rel = joinRel(dir, entry.name);
        if (entry.isDirectory) await walk(rel);
        else if (entry.name.endsWith(SUFFIX)) paths.push(rel);
      }
    };

    await walk("");
    paths.sort();

    for (const rel of paths) {
      workspace.addDocument(rel, parse(rel, await host.readFile(rel)));
    }

    return workspace;
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
    const isNew = !this.documents.has(rel);
    this.documents.set(rel, document);
    if (isNew) {
      this.pageList.push(rel);
      this.pageList.sort();
      this.indexParts(rel);
      let dir = dirnameRel(rel);
      for (;;) {
        this.directories.add(dir);
        if (dir === "") break;
        dir = dirnameRel(dir);
      }
    }
    this.invalidate();
  }

  removeDocument(rel: string): void {
    if (!this.documents.delete(rel)) return;
    const at = this.pageList.indexOf(rel);
    if (at !== -1) this.pageList.splice(at, 1);
    this.byParts.clear();
    for (const page of this.pageList) this.indexParts(page);
    this.invalidate();
  }

  /** Drop every memoised answer. Cheap, and the alternative is stale links. */
  invalidate(): void {
    this.importTables.clear();
    this.resolveCache.clear();
  }

  private indexParts(rel: string): void {
    const parts = pageParts(rel);
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
    return this.directories.has(rel);
  }

  // -- §5.1 binding ----------------------------------------------------

  /**
   * Bind `parts` in one directory, honouring folder notes.
   *
   * A target naming a directory resolves to that directory's `index.hmd`,
   * which is what makes a folder note the namespace's landing page. When both
   * `foo.hmd` and `foo/index.hmd` exist the file wins; the collision is
   * reported separately as HMD012.
   */
  bind(directory: string, parts: readonly string[]): string | null {
    if (parts.length === 0) return null;
    const head = parts.slice(0, -1);
    const last = parts[parts.length - 1]!;

    const candidate = joinRel(directory, ...head, withHmdSuffix(last));
    if (this.documents.has(candidate)) return candidate;

    const folderNote = joinRel(directory, ...parts, `${INDEX_STEM}${SUFFIX}`);
    if (this.documents.has(folderNote)) return folderNote;

    return null;
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
      const directory = this.importDir(source, stmt);
      if (directory === null) {
        table.problems.push([
          "HMD003",
          `import ref '${stmt.ref}' resolves outside the namespace root`,
        ]);
        continue;
      }
      if (!this.directories.has(directory)) {
        table.problems.push(["HMD015", `import ref '${stmt.ref}' does not exist`]);
        continue;
      }

      if (stmt.wildcard) {
        table.searchPaths.push(directory);
        continue;
      }

      for (const [name, local] of stmt.bindings) {
        const target = this.bind(directory, [name]);
        if (target === null) {
          table.problems.push([
            "HMD015",
            `cannot import '${name}' from '${stmt.ref}': no such page`,
          ]);
          continue;
        }
        const existing = table.bindings.get(local);
        if (existing !== undefined && existing !== target) {
          table.problems.push([
            "HMD015",
            `'${local}' is bound twice by imports (${existing} and ${target})`,
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

  // -- §5.3 effective feature toggles ----------------------------------

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

  // -- §5.2 the algorithm ----------------------------------------------

  resolve(source: string, pageRef: string): Resolution {
    const key = `${source} ${pageRef}`;
    const cached = this.resolveCache.get(key);
    if (cached !== undefined) return cached;
    const result = this.resolveUncached(source, pageRef);
    this.resolveCache.set(key, result);
    return result;
  }

  private resolveUncached(source: string, pageRef: string): Resolution {
    const stem = pageRef.endsWith(SUFFIX) ? pageRef.slice(0, -SUFFIX.length) : pageRef;

    if (stem.startsWith("/")) {
      const target = this.bind("", split(stem));
      return target
        ? resolution({ outcome: "resolved", path: target })
        : resolution({ outcome: "unresolved" });
    }

    if (stem.startsWith("./") || stem.startsWith("../")) {
      const { parts, escapes } = normalizeParts([
        ...split(dirnameRel(source)),
        ...stem.split("/"),
      ]);
      if (escapes) return resolution({ outcome: "escapes" });
      if (parts.length === 0) return resolution({ outcome: "unresolved" });
      const dir = parts.slice(0, -1).join("/");
      const target = this.bind(dir, [parts[parts.length - 1]!]);
      return target
        ? resolution({ outcome: "resolved", path: target })
        : resolution({ outcome: "unresolved" });
    }

    const parts = split(stem);
    if (parts.length === 0) return resolution({ outcome: "unresolved" });

    const table = this.importTable(source);

    // Phase 0 — named imports. A binding names a page, not a namespace, so it
    // applies to single-segment targets only.
    if (parts.length === 1) {
      const bound = table.bindings.get(parts[0]!);
      if (bound !== undefined) {
        return resolution({ outcome: "resolved", path: bound, phase: 0 });
      }
    }

    // Phase 1 — spine walk, non-recursive, nearest first.
    for (const directory of this.spine(source)) {
      const target = this.bind(directory, parts);
      if (target !== null) {
        return resolution({ outcome: "resolved", path: target, phase: 1 });
      }
    }

    // Phase 2 — imported search paths, in declaration order.
    const hits = table.searchPaths.filter((d) => this.bind(d, parts) !== null);
    if (hits.length > 0) {
      const winner = this.bind(hits[0]!, parts)!;
      const shadowed = hits.slice(1).map((d) => this.bind(d, parts)!);
      return resolution({ outcome: "resolved", path: winner, phase: 2, shadowed });
    }

    if (!this.autodiscoveryEnabled(source)) return resolution({ outcome: "unresolved" });

    // Phase 3 — autodiscovery, at most once.
    const matches = this.sweep(source, parts);
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

  private sweep(source: string, parts: readonly string[]): string[] {
    const scope = this.config.mode === "recursive" ? dirnameRel(source) : "";
    const suffix = parts.join("/");
    const matches = new Set<string>();

    for (const [key, pages] of this.byParts) {
      const keyParts = key === "" ? [] : key.split("/");
      if (keyParts.length < parts.length) continue;
      if (keyParts.slice(keyParts.length - parts.length).join("/") !== suffix) continue;
      for (const page of pages) {
        if (scope === "" || isUnder(scope, page)) matches.add(page);
      }
    }

    // Sorted by root-relative POSIX path, so diagnostics are byte-identical
    // across platforms and runs (P1).
    return [...matches].sort();
  }
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else if (!list.includes(value)) list.push(value);
}
