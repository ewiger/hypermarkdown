/**
 * The rule set (HMD-0001 §8) — a port of `tools/hmd/src/hypermarkdown/lint/rules.py`.
 *
 * Rule IDs are stable and are never renumbered. This implementation MUST NOT
 * allocate new ones: rule ID allocation belongs to the canonical
 * implementation (HMD-0020 §9).
 */

import {
  ERROR,
  WARNING,
  compareDiagnostics,
  type Diagnostic,
  type Link,
  type ParsedDocument,
  type Severity,
} from "./model.js";
import { resolveAddress, shadowedHeadings, SHORT_UNITS, plural } from "./address.js";
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
  // HMD-0006: addresses inside a card.
  HMD019: ERROR,
  HMD020: ERROR,
  HMD021: WARNING,
  HMD022: WARNING,
  HMD023: WARNING,
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
  const diagnostics: Diagnostic[] = [];

  for (const path of targets) {
    const document = workspace.documents.get(path);
    if (document === undefined) continue;
    // HMD-0029: a Markdown card is not checked; no diagnostic comes from its body.
    if (document.kind === "markdown") continue;
    diagnostics.push(...document.diagnostics); // HMD009, HMD010, HMD013, HMD014, HMD019
    diagnostics.push(...duplicateAnchors(document));
    diagnostics.push(...duplicateSlugs(document));
    diagnostics.push(...shadowed(document));
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

/** HMD011 — two headings sharing a base slug are addressed by `_1` suffixes. */
function duplicateSlugs(document: ParsedDocument): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const heading of document.headings) {
    const cut = heading.slug.lastIndexOf("_");
    if (cut <= 0) continue;
    const suffix = heading.slug.slice(cut + 1);
    if (suffix === "" || !/^[0-9]+$/.test(suffix)) continue;
    out.push(
      at(
        "HMD011",
        document.path,
        heading.span.line,
        heading.span.column,
        `heading slug collides with an earlier heading; addressable as '#${heading.slug}'`,
      ),
    );
  }
  return out;
}

/** HMD022 — a heading whose slug a short-form step reads as a unit. */
function shadowed(document: ParsedDocument): Diagnostic[] {
  return shadowedHeadings(document).map((heading) =>
    at(
      "HMD022",
      document.path,
      heading.span.line,
      heading.span.column,
      `'#${heading.slug}' counts ${plural(SHORT_UNITS[heading.slug[0]!]!)} ` +
        `rather than naming this heading; anchor the heading to link to it`,
    ),
  );
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

/** HMD004, HMD005, HMD020, HMD021, HMD023 — the address must land in the page. */
function fragmentRules(
  workspace: Workspace,
  document: ParsedDocument,
  link: Link,
  target: string,
): Diagnostic[] {
  if (link.fragment === null || !link.address) return [];
  const resolved = workspace.documents.get(target);
  if (resolved === undefined) return [];
  const { span } = link;
  const result = resolveAddress(resolved, link.address, target);
  const out: Diagnostic[] = [];
  if (result.failure !== null) {
    out.push(at(result.failure[0], document.path, span.line, span.column, result.failure[1]));
  }
  for (const [rule, message] of result.warnings) {
    out.push(at(rule, document.path, span.line, span.column, message));
  }
  return out;
}

// -- cross-document rules ------------------------------------------------

/** HMD012 — `foo.hmd` beside `foo/index.hmd`, of any card extensions. */
function folderNoteCollisions(workspace: Workspace, targets: readonly string[]): Diagnostic[] {
  const wanted = new Set(targets);
  const out: Diagnostic[] = [];
  for (const page of workspace.pages()) {
    if (workspace.shadowedBy(page) !== null) continue;
    const stem = pageParts(page).join("/");
    const note = CARD_SUFFIXES.map((suffix) => `${stem}/${INDEX_STEM}${suffix}`).find((each) =>
      workspace.documents.has(each),
    );
    if (note === undefined) continue;
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
