/**
 * The document IR (HMD-0020 §7).
 *
 * Ordinary GFM content is an opaque HTML island; every HyperMarkDown
 * construct survives as a typed node. That split is the whole design: the
 * renderer needs no markdown knowledge, and no consumer can lose an embed
 * boundary by treating it as text.
 */

import type { Span } from "./model.js";

/** Bumped whenever the shape below changes. A consumer seeing an unknown
 * version refuses to render rather than guessing — a stale webview after an
 * extension update is the ordinary case, not an exotic one.
 *
 * 2 — `DiagramBlock` joins the union (HMD-0022 §4).
 * 3 — `CellBlock` joins the union (HMD-0026). */
export const IR_VERSION = 3;

export type ResolutionState = "resolved" | "unresolved" | "ambiguous" | "escapes";

export interface FragmentRef {
  kind: "heading" | "block";
  value: string;
  slug: string | null;
}

export interface TargetRef {
  raw: string;
  form: "absolute" | "relative" | "bare";
  page: string;
  fragment: FragmentRef | null;
  display: string | null;
}

export interface ResolutionRef {
  state: ResolutionState;
  path: string | null;
  candidates: readonly string[];
}

export interface HtmlBlock {
  kind: "html";
  key: string;
  html: string;
  span: Span;
}

export interface EmbedBlock {
  kind: "embed";
  key: string;
  target: TargetRef;
  resolution: ResolutionRef;
  /** The expanded child, or null when the embed does not resolve. */
  document: DocumentIR | null;
  /** Why the child is null, when it is. */
  failure: string | null;
  depth: number;
  span: Span;
}

/**
 * A diagram fence (HMD-0022).
 *
 * Not an `HtmlBlock`: rendering it needs a subprocess, which the core cannot
 * run and which may not be installed, and neither fact survives being flattened
 * into an HTML string.
 */
export interface DiagramBlock {
  kind: "diagram";
  key: string;
  /** The fence info string's first word, lowercased. */
  language: string;
  /** The fence body, verbatim — carried whether or not it rendered. */
  source: string;
  /**
   * The rendered SVG as a `data:` URI, attached by a consumer that can run the
   * renderer. The core runs no processes and performs no I/O.
   */
  dataUri: string | null;
  /** Why there is no diagram: a missing engine, or a failed render. */
  failure: string | null;
  span: Span;
}

/**
 * An HQL cell (HMD-0026): code the `hql` binary runs, and the output a previous
 * run saved in the card.
 *
 * Not an `HtmlBlock`, for the reason a diagram is not: the output is produced
 * by a process the core cannot run, can be stale, and is drawn with the code
 * hidden behind a toggle — none of which survives flattening into HTML.
 */
export interface CellBlock {
  kind: "cell";
  key: string;
  /** Position among the cells of the card it was written in, from 0. */
  index: number;
  /** `hql#eval` or `hql#query`. */
  language: string;
  id: string | null;
  /** Runs, and keeps no output: a cell that exists to be read by others. */
  hidden: boolean;
  /** The fence body, verbatim. */
  source: string;
  /** The cell's hash as HQL computes it from the card as it stands. */
  hash: string;
  output: CellOutputIR | null;
  span: Span;
}

export interface CellOutputIR {
  status: "ok" | "error" | "skipped" | null;
  /** The hash the output was written from. */
  hash: string | null;
  /** Whether that hash is the cell's hash now: the output came from this code. */
  current: boolean;
  /** The saved Markdown, rendered like the rest of the card. */
  blocks: readonly Block[];
}

export type Block = HtmlBlock | EmbedBlock | DiagramBlock | CellBlock;

export interface HeadingRef {
  level: number;
  text: string;
  slug: string;
  line: number;
}

export interface DocumentIR {
  irVersion: number;
  /** Root-relative, POSIX separators. */
  path: string;
  /** Namespace segments, root first. */
  breadcrumb: readonly string[];
  frontmatter: Record<string, unknown>;
  headings: readonly HeadingRef[];
  anchors: readonly string[];
  blocks: readonly Block[];
}

export interface BacklinkEntry {
  path: string;
  line: number;
  kind: "link" | "embed";
  snippet: string;
}
