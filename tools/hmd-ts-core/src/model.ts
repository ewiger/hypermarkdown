/**
 * Core data model (HMD-0001 §1, HMD-0020 §7).
 *
 * A direct port of `tools/hmd/src/hypermarkdown/model.py`. Every construct carries an
 * exact source span, because diagnostics, scroll sync, and click-through all
 * read from the same positions.
 */

import { compareCodePoints } from "./paths.js";
import { headingKey } from "./unicode.js";

export const ERROR = "error";
export const WARNING = "warning";

export type Severity = typeof ERROR | typeof WARNING;

/**
 * Where a construct sits in its card.
 *
 * `start` and `end` count UTF-8 bytes from byte 0 of the card, which is the
 * first byte after a byte-order mark if the file has one. `line` and `column`
 * start at 1, and `column` counts Unicode code points, so it is the same
 * number in every implementation whatever its string type.
 *
 * `index` and `indexEnd` are the same range as UTF-16 indices into the decoded
 * text, which is what slicing `ParsedDocument.text` needs. They are this
 * implementation's, not the language's. Spans that do not come from the
 * scanner (an IR block's) leave both at 0.
 */
export interface Span {
  start: number;
  end: number;
  line: number;
  column: number;
  index?: number;
  indexEnd?: number;
}

/**
 * An ATX or setext heading.
 *
 * `text` is what a reader sees, inline markup removed; `key` is what a heading
 * fragment is matched against. Neither is an HTML `id` — that is a renderer's
 * to choose.
 */
export interface Heading {
  level: number;
  text: string;
  key: string;
  span: Span;
}

/** A trailing `^block-id` marker. */
export interface Anchor {
  blockId: string;
  span: Span;
}

export type FragmentKind = "heading" | "block";

/** A `[[wikilink]]` or, when `isEmbed`, a `![[embed]]`. */
export interface Link {
  pageRef: string;
  fragment: string | null;
  fragmentKind: FragmentKind | null;
  display: string | null;
  isEmbed: boolean;
  raw: string;
  span: Span;
}

/** The link as written, minus any display text — for diagnostics. */
export function linkTarget(link: Link): string {
  if (link.fragment === null) return link.pageRef;
  const marker = link.fragmentKind === "block" ? "#^" : "#";
  return `${link.pageRef}${marker}${link.fragment}`;
}

/** One parsed `from <ref> import <names>` statement (HMD-0001 §5.3). */
export interface ImportStmt {
  ref: string;
  wildcard: boolean;
  bindings: ReadonlyArray<readonly [string, string]>;
  raw: string;
}

/** The reserved frontmatter keys: `tags`, `use`, `import`. */
export interface CardConfig {
  tags: readonly string[];
  /** Feature name -> enabled. Absent means "inherit". */
  use: Readonly<Record<string, boolean>>;
  imports: readonly ImportStmt[];
}

export function emptyCardConfig(): CardConfig {
  return { tags: [], use: {}, imports: [] };
}

export interface Diagnostic {
  rule: string;
  severity: Severity;
  /** Root-relative, POSIX separators. */
  path: string;
  line: number;
  column: number;
  message: string;
  candidates?: readonly string[];
}

export function diagnosticSortKey(d: Diagnostic): [string, number, number, string] {
  return [d.path, d.line, d.column, d.rule];
}

export function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  const [ap, al, ac, ar] = diagnosticSortKey(a);
  const [bp, bl, bc, br] = diagnosticSortKey(b);
  if (ap !== bp) return compareCodePoints(ap, bp);
  if (al !== bl) return al - bl;
  if (ac !== bc) return ac - bc;
  if (ar !== br) return ar < br ? -1 : 1;
  return 0;
}

/**
 * What a card is written in (HMD-0029): a `.hmd` file is scanned and checked; a
 * `.md` or `.markdown` file is addressable and has headings, and its body is
 * CommonMark.
 */
export type CardKind = "hmd" | "markdown";

/** One parsed card. */
export interface ParsedDocument {
  /** Root-relative path, POSIX separators. */
  path: string;
  /** Absent means `hmd`. */
  kind?: CardKind;
  text: string;
  frontmatter: Record<string, unknown>;
  card: CardConfig;
  headings: readonly Heading[];
  anchors: readonly Anchor[];
  links: readonly Link[];
  /** Diagnostics found at parse time (HMD009, HMD010, HMD013, HMD014). */
  diagnostics: readonly Diagnostic[];
}

export function isMarkdownCard(doc: ParsedDocument): boolean {
  return doc.kind === "markdown";
}

/**
 * The first heading, in document order, whose key is the fragment's.
 *
 * A heading whose key is empty is never matched: it has no text to be reached
 * by, only an anchor. A later heading with the same key is reachable only by a
 * block anchor on its line (HMD011).
 */
export function findHeading(doc: ParsedDocument, fragment: string): Heading | null {
  const wanted = headingKey(fragment);
  if (wanted === "") return null;
  return doc.headings.find((h) => h.key === wanted) ?? null;
}

export function blockIds(doc: ParsedDocument): Set<string> {
  return new Set(doc.anchors.map((a) => a.blockId));
}
