/**
 * Masking scanner (HMD-0001 §1, §2) — a port of `tools/hmd/src/hypermarkdown/scan.py`.
 *
 * The scanner does not parse CommonMark. It masks the regions where markup must
 * not be interpreted, then extracts constructs from what is left. Masking
 * replaces characters with spaces and preserves newlines, so every offset,
 * line, and column in the masked text still refers to the original source.
 *
 * HMD-0020 §3 gives markdown-it the rendering job. It does not get this one:
 * conformance with the canonical implementation is measured here, and the two
 * scanners disagree on exactly the case HMD-0001 §1 legislates — an indented
 * block is a callout body, not code.
 */

export const FENCE_RE = /^([ \t]*)(`{3,}|~{3,})(.*)$/;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const CODE_SPAN_RE = /(`+)([\s\S]+?)\1/g;

const ATX_HEADING_RE = /^[ \t]{0,3}(#{1,6})[ \t]+(.*?)[ \t]*$/gm;
const ANCHOR_RE = /[ \t]+\^([A-Za-z0-9][A-Za-z0-9_-]{0,63})[ \t]*$/gm;
/** A wikilink target may not contain "[", "]" or a newline (HMD-0001 §2). */
const LINK_RE = /(!?)\[\[([^[\]\n]*)\]\]/g;
const OPEN_RE = /!?\[\[/g;

export type Region = readonly [number, number];

/** Split `text` into lines, keeping the line terminators. */
function linesWithEnds(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      out.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

function stripEol(line: string): string {
  return line.replace(/\r?\n$/, "");
}

/** Yield [start, end) for each fenced code block, closed or not. */
export function fencedRegions(text: string): Region[] {
  const regions: Region[] = [];
  let openFence: string | null = null;
  let openStart = 0;
  let offset = 0;

  for (const line of linesWithEnds(text)) {
    const stripped = stripEol(line);
    const m = FENCE_RE.exec(stripped);
    if (openFence === null) {
      if (m && !m[3]!.trim().startsWith(m[2]![0]!)) {
        openFence = m[2]!;
        openStart = offset;
      }
    } else if (
      m &&
      m[2]![0] === openFence[0] &&
      m[2]!.length >= openFence.length &&
      m[3]!.trim() === ""
    ) {
      regions.push([openStart, offset + line.length]);
      openFence = null;
    }
    offset += line.length;
  }

  // An unterminated fence runs to end of file.
  if (openFence !== null) regions.push([openStart, text.length]);
  return regions;
}

function blank(text: string, regions: readonly Region[]): string {
  // split("") keeps UTF-16 code units, so offsets stay aligned with the
  // indices RegExp reports. Array.from would split by code point and shift
  // every offset after the first astral character.
  const chars = text.split("");
  for (const [start, end] of regions) {
    for (let i = start; i < end && i < chars.length; i += 1) {
      if (chars[i] !== "\n") chars[i] = " ";
    }
  }
  return chars.join("");
}

function maskedRegions(text: string): Region[] {
  const regions: Region[] = [...fencedRegions(text)];
  let blanked = blank(text, regions);

  // Comments and code spans are found in text that already has fences removed,
  // so a "<!--" inside a code block cannot open a comment.
  HTML_COMMENT_RE.lastIndex = 0;
  for (const m of blanked.matchAll(HTML_COMMENT_RE)) {
    regions.push([m.index!, m.index! + m[0].length]);
  }
  blanked = blank(blanked, regions);

  CODE_SPAN_RE.lastIndex = 0;
  for (const m of blanked.matchAll(CODE_SPAN_RE)) {
    if (m[0].includes("\n\n")) continue; // a code span cannot span a blank line
    regions.push([m.index!, m.index! + m[0].length]);
  }
  return regions;
}

/**
 * Return `text` with uninterpreted regions blanked out, offsets preserved.
 *
 * Masked: fenced code blocks, HTML comments, and inline code spans.
 *
 * Indented code blocks are deliberately NOT masked. Under `admonition` and
 * `footnotes` a four-space indent marks a callout body or a footnote
 * continuation rather than code; masking it would silently drop real links
 * from ordinary prose.
 */
export function mask(text: string): string {
  return blank(text, maskedRegions(text));
}

/** An index from 0-indexed line number to that line's start offset. */
export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

/**
 * Offset -> position lookup, built once per parse.
 *
 * A linear scan per construct is O(n·m) on a document with many links, which
 * is exactly the shape of the documents this format encourages.
 */
export class PositionIndex {
  private readonly starts: number[];

  constructor(text: string) {
    this.starts = lineStarts(text);
  }

  /** 1-indexed line and column for an offset. */
  at(offset: number): { line: number; column: number } {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - this.starts[lo]! + 1 };
  }

  /** Start offset of a 1-indexed line. */
  offsetOfLine(line: number): number {
    return this.starts[Math.min(Math.max(line, 1), this.starts.length) - 1]!;
  }

  get lineCount(): number {
    return this.starts.length;
  }
}

/** 1-indexed line and column for an offset. Prefer `PositionIndex` in loops. */
export function lineCol(text: string, offset: number): { line: number; column: number } {
  return new PositionIndex(text).at(offset);
}

export interface RawHeading {
  level: number;
  text: string;
  start: number;
  end: number;
}

const CLOSING_HASHES_RE = /[ \t]+#+[ \t]*$/;
const TRAILING_ANCHOR_RE = /[ \t]+\^[A-Za-z0-9][A-Za-z0-9_-]{0,63}[ \t]*$/;

export function findHeadings(masked: string): RawHeading[] {
  const out: RawHeading[] = [];
  ATX_HEADING_RE.lastIndex = 0;
  for (const m of masked.matchAll(ATX_HEADING_RE)) {
    let text = m[2]!;
    // Drop a closing hash run, then any trailing block anchor.
    text = text.replace(CLOSING_HASHES_RE, "");
    text = text.replace(TRAILING_ANCHOR_RE, "");
    out.push({
      level: m[1]!.length,
      text: text.trim(),
      start: m.index!,
      end: m.index! + m[0].length,
    });
  }
  return out;
}

export interface RawAnchor {
  blockId: string;
  start: number;
  end: number;
}

export function findAnchors(masked: string): RawAnchor[] {
  const out: RawAnchor[] = [];
  ANCHOR_RE.lastIndex = 0;
  for (const m of masked.matchAll(ANCHOR_RE)) {
    out.push({ blockId: m[1]!, start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

export interface RawLink {
  isEmbed: boolean;
  inner: string;
  start: number;
  end: number;
}

export function findLinks(masked: string): RawLink[] {
  const out: RawLink[] = [];
  LINK_RE.lastIndex = 0;
  for (const m of masked.matchAll(LINK_RE)) {
    out.push({
      isEmbed: m[1] === "!",
      inner: m[2]!,
      start: m.index!,
      end: m.index! + m[0].length,
    });
  }
  return out;
}

/** Offsets of every `[[` that does not open a complete link. */
export function findUnterminated(masked: string): number[] {
  const closed = new Set<number>();
  LINK_RE.lastIndex = 0;
  for (const m of masked.matchAll(LINK_RE)) {
    closed.add(m.index! + (m[1] === "!" ? 1 : 0));
  }

  const out: number[] = [];
  OPEN_RE.lastIndex = 0;
  for (const m of masked.matchAll(OPEN_RE)) {
    const start = m.index! + (m[0].startsWith("!") ? 1 : 0);
    if (!closed.has(start)) out.push(m.index!);
  }
  return out;
}
