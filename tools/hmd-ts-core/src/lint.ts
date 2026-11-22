/**
 * The rule set: the specification's Diagnostics table — a port of
 * `tools/hmd/src/hypermarkdown/lint/rules.py`.
 *
 * Rule IDs are stable and are never renumbered. This implementation MUST NOT
 * allocate new ones: rule ID allocation belongs to the canonical
 * implementation (HMD-0020).
 */

import {
  ERROR,
  WARNING,
  blockIds,
  compareDiagnostics,
  findHeading,
  type Diagnostic,
  type Link,
  type ParsedDocument,
  type Severity,
} from "./model.js";
import { CARD_SUFFIXES, INDEX_STEM, pageParts } from "./paths.js";
import type { Workspace } from "./workspace.js";

/**
 * Maximum embed expansion depth. Deep enough for legitimate composition,
 * shallow enough to bound work on adversarial input (HMD-0001 §6).
 *
 * One exported constant, shared with the expander and with any future template
 * engine, rather than a literal repeated at each call site.
 */
export const MAX_EMBED_DEPTH = 16;

export const SEVERITY: Readonly<Record<string, Severity>> = {
  HMD001: WARNING,
  HMD002: ERROR,
  HMD003: ERROR,
  HMD004: ERROR,
  HMD005: ERROR,
  HMD006: ERROR,
  HMD007: ERROR,
  HMD008: ERROR,
  HMD009: ERROR,
  HMD010: ERROR,
  HMD011: WARNING,
  HMD012: ERROR,
  HMD013: ERROR,
  HMD014: ERROR,
  HMD015: ERROR,
  HMD016: WARNING,
  HMD018: WARNING,
  HMD019: ERROR,
};

function at(
  rule: string,
  path: string,
  line: number,
  column: number,
  message: string,
  candidates?: readonly string[],
): Diagnostic {
  const diagnostic: Diagnostic = {
    rule,
    severity: SEVERITY[rule] ?? ERROR,
    path,
    line,
    column,
    message,
  };
  return candidates && candidates.length > 0 ? { ...diagnostic, candidates } : diagnostic;
}

/** Lint `paths`, or the whole namespace tree. */
export function check(workspace: Workspace, paths?: readonly string[]): Diagnostic[] {
  const targets = paths ?? workspace.pages();
  const diagnostics: Diagnostic[] = undecodable(workspace, paths);

  for (const path of targets) {
    const document = workspace.documents.get(path);
    if (document === undefined) continue;
    // HMD-0029: a Markdown card is not checked; no diagnostic comes from its body.
    if (document.kind === "markdown") continue;
    diagnostics.push(...document.diagnostics); // HMD009, HMD010, HMD013, HMD014
    diagnostics.push(...duplicateAnchors(document));
    diagnostics.push(...duplicateHeadings(document));
    diagnostics.push(...importProblems(workspace, document));
    diagnostics.push(...linkRules(workspace, document));
  }

  diagnostics.push(...folderNoteCollisions(workspace, targets));
  diagnostics.push(...shadowedCards(workspace, targets));
  diagnostics.push(...embedCycles(workspace, targets));

  diagnostics.sort(compareDiagnostics);
  return diagnostics;
}

// -- per-document rules --------------------------------------------------

/**
 * HMD019 — a file with a card extension that is not UTF-8 is not a card.
 *
 * Reported for every such file when the whole tree is linted, and for the ones
 * named when `paths` is given: naming the file is how its HMD019 is asked for.
 */
function undecodable(workspace: Workspace, paths?: readonly string[]): Diagnostic[] {
  const selected = paths === undefined ? null : new Set(paths);
  const out: Diagnostic[] = [];
  for (const [path, message] of workspace.undecodable()) {
    if (selected === null || selected.has(path)) out.push(at("HMD019", path, 1, 1, message));
  }
  return out;
}

/** HMD006 — a block id must be unique within its page. */
function duplicateAnchors(document: ParsedDocument): Diagnostic[] {
  const out: Diagnostic[] = [];
  const seen = new Map<string, number>();
  for (const anchor of document.anchors) {
    const first = seen.get(anchor.blockId);
    if (first !== undefined) {
      out.push(
        at(
          "HMD006",
          document.path,
          anchor.span.line,
          anchor.span.column,
          `duplicate block anchor '^${anchor.blockId}' (first defined on line ${first})`,
        ),
      );
    } else {
      seen.set(anchor.blockId, anchor.span.line);
    }
  }
  return out;
}

/**
 * HMD011 — a heading has the same key as an earlier one in the card.
 *
 * A fragment reaches the first of them, so every later one is unreachable by
 * its text. A later heading that carries a block anchor is reachable by it:
 * the author has applied the remedy, and nothing is reported. A heading whose
 * key is empty is unreachable by text anyway, and two of them collide over
 * nothing.
 */
function duplicateHeadings(document: ParsedDocument): Diagnostic[] {
  const out: Diagnostic[] = [];
  const anchored = new Set(document.anchors.map((anchor) => anchor.span.line));
  const first = new Map<string, number>();
  for (const heading of document.headings) {
    if (heading.key === "") continue;
    const line = first.get(heading.key);
    if (line === undefined) {
      first.set(heading.key, heading.span.line);
      continue;
    }
    if (anchored.has(heading.span.line)) continue;
    out.push(
      at(
        "HMD011",
        document.path,
        heading.span.line,
        heading.span.column,
        `heading '${heading.text}' has the same key as the heading on line ${line}, ` +
          "which a fragment reaches instead; anchor this one with a block id to link to it",
      ),
    );
  }
  return out;
}

/** HMD003 and HMD015 raised while building the import table. */
function importProblems(workspace: Workspace, document: ParsedDocument): Diagnostic[] {
  return workspace
    .importTable(document.path)
    .problems.map(([rule, message]) => at(rule, document.path, 1, 1, message));
}

/** HMD001..HMD005 — resolution and fragment checks. */
function linkRules(workspace: Workspace, document: ParsedDocument): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const link of document.links) {
    const { span } = link;
    const result = workspace.resolve(document.path, link.pageRef);

    if (result.outcome === "escapes") {
      out.push(
        at(
          "HMD003",
          document.path,
          span.line,
          span.column,
          `${link.raw} resolves outside the namespace root`,
        ),
      );
      continue;
    }

    if (result.outcome === "ambiguous") {
      out.push(
        at(
          "HMD002",
          document.path,
          span.line,
          span.column,
          `${link.raw} matches ${result.candidates.length} pages; qualify it ` +
            `(candidates: ${result.candidates.join(", ")})`,
          result.candidates,
        ),
      );
      continue;
    }

    if (result.outcome === "unresolved") {
      out.push(
        at("HMD001", document.path, span.line, span.column, `${link.raw} does not resolve to a page`),
      );
      continue;
    }

    out.push(...fragmentRules(workspace, document, link, result.path!));

    if (result.shadowed.length > 0) {
      out.push(
        at(
          "HMD016",
          document.path,
          span.line,
          span.column,
          `${link.raw} also matched ${result.shadowed.join(", ")}; the earlier import won`,
          result.shadowed,
        ),
      );
    }
  }
  return out;
}

/** HMD004 and HMD005 — the fragment must exist in the resolved page. */
function fragmentRules(
  workspace: Workspace,
  document: ParsedDocument,
  link: Link,
  target: string,
): Diagnostic[] {
  if (link.fragment === null) return [];
  const resolved = workspace.documents.get(target);
  if (resolved === undefined) return [];
  const { span } = link;

  if (link.fragmentKind === "block") {
    if (!blockIds(resolved).has(link.fragment)) {
      return [
        at(
          "HMD005",
          document.path,
          span.line,
          span.column,
          `${target} has no block '^${link.fragment}'`,
        ),
      ];
    }
    return [];
  }

  if (findHeading(resolved, link.fragment) === null) {
    return [
      at(
        "HMD004",
        document.path,
        span.line,
        span.column,
        `${target} has no heading '#${link.fragment}'`,
      ),
    ];
  }
  return [];
}

// -- cross-document rules ------------------------------------------------

/** HMD012 — `foo.hmd` beside `foo/index.hmd`, of any card extensions. */
function folderNoteCollisions(workspace: Workspace, targets: readonly string[]): Diagnostic[] {
  const wanted = new Set(targets);
  const out: Diagnostic[] = [];
  for (const page of workspace.pages()) {
    if (workspace.shadowedBy(page) !== null) continue;
    const stem = pageParts(page).join("/");
    // Looked up the way binding looks, so names compare in NFC.
    const note = CARD_SUFFIXES.map((suffix) => workspace.card(`${stem}/${INDEX_STEM}${suffix}`)).find(
      (each) => each !== null,
    );
    if (note === undefined || note === null) continue;
    if (!wanted.has(page) && !wanted.has(note)) continue;
    out.push(
      at("HMD012", page, 1, 1, `${page} and ${note} both claim the name '${stem}'; the file wins`),
    );
  }
  return out;
}

/** HMD018 — a card shadows a card of the same name with a later extension. */
function shadowedCards(workspace: Workspace, targets: readonly string[]): Diagnostic[] {
  const wanted = new Set(targets);
  const out: Diagnostic[] = [];
  for (const page of workspace.pages()) {
    const winner = workspace.shadowedBy(page);
    if (winner === null) continue;
    if (!wanted.has(page) && !wanted.has(winner)) continue;
    let parts = pageParts(page);
    // A folder note is named by its directory.
    if (parts.length > 1 && parts[parts.length - 1] === INDEX_STEM) parts = parts.slice(0, -1);
    out.push(
      at(
        "HMD018",
        page,
        1,
        1,
        `${winner} shadows ${page}; [[${parts.join("/")}]] means ${winner}`,
      ),
    );
  }
  return out;
}

/** HMD007 and HMD008 — cycle detection and the depth bound. */
function embedCycles(workspace: Workspace, targets: readonly string[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  const reported = new Set<string>();

  for (const start of targets) {
    if (!workspace.documents.has(start)) continue;
    walk(workspace, start, null, [], reported, out);
  }
  return out;
}

function walk(
  workspace: Workspace,
  path: string,
  fragment: string | null,
  stack: Array<[string, string | null]>,
  reported: Set<string>,
  out: Diagnostic[],
): void {
  const key = `${path} ${fragment ?? ""}`;
  const onStack = stack.findIndex(([p, f]) => p === path && f === fragment);

  if (onStack !== -1) {
    if (!reported.has(key)) {
      reported.add(key);
      const chain = stack
        .slice(onStack)
        .map(([p]) => p)
        .join(" -> ");
      out.push(at("HMD007", path, 1, 1, `embed cycle: ${chain} -> ${path}`));
    }
    return;
  }

  if (stack.length >= MAX_EMBED_DEPTH) {
    if (!reported.has(key)) {
      reported.add(key);
      out.push(at("HMD008", path, 1, 1, `embed depth exceeds the limit of ${MAX_EMBED_DEPTH}`));
    }
    return;
  }

  const document = workspace.documents.get(path);
  if (document === undefined) return;

  stack.push([path, fragment]);
  for (const link of document.links) {
    if (!link.isEmbed) continue;
    const result = workspace.resolve(path, link.pageRef);
    if (result.outcome !== "resolved" || result.path === null) continue;
    walk(workspace, result.path, link.fragment, stack, reported, out);
  }
  stack.pop();
}

/** Count errors and warnings, honouring `--strict`. */
export function summarize(
  diagnostics: readonly Diagnostic[],
  strict = false,
): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const d of diagnostics) {
    if (d.severity === ERROR || strict) errors += 1;
    else warnings += 1;
  }
  return { errors, warnings };
}
