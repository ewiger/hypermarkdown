/**
 * Core data model (HMD-0001 §1, HMD-0020 §7).
 *
 * A direct port of `tools/hmd/src/hypermarkdown/model.py`. Every construct carries an
 * exact source span, because diagnostics, scroll sync, and click-through all
 * read from the same positions.
 */

import type { Address } from "./address.js";

export const ERROR = "error";
export const WARNING = "warning";

export type Severity = typeof ERROR | typeof WARNING;

/** A range in a source file, with a 1-indexed line and column. */
export interface Span {
  /** 0-indexed offset in UTF-16 code units. */
  start: number;
  end: number;
  line: number;
  column: number;
}

export interface Heading {
  level: number;
  text: string;
  slug: string;
  span: Span;
}

/** A trailing `^block-id` marker (HMD-0001 §2). */
export interface Anchor {
  blockId: string;
  span: Span;
}

/** `address` is a fragment of more than one step (HMD-0006). */
export type FragmentKind = "heading" | "block" | "address";

/** A `[[wikilink]]` or, when `isEmbed`, a `![[embed]]`. */
export interface Link {
  pageRef: string;
  fragment: string | null;
  fragmentKind: FragmentKind | null;
  display: string | null;
  isEmbed: boolean;
  raw: string;
  span: Span;
  /**
   * The parsed fragment (HMD-0006): set for every fragment that parses, a
   * one-step heading or block fragment included. Null for a malformed address,
   * which is reported as HMD019 and otherwise left unchecked.
   */
  address?: Address | null;
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
  if (ap !== bp) return ap < bp ? -1 : 1;
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

export function headingSlugs(doc: ParsedDocument): Set<string> {
  return new Set(doc.headings.map((h) => h.slug));
}

export function blockIds(doc: ParsedDocument): Set<string> {
  return new Set(doc.anchors.map((a) => a.blockId));
}
