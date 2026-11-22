/**
 * Block segmentation, and the text units inside a block (HMD-0006) — a port of
 * `tools/hmd/src/hypermarkdown/blocks.py`, rule for rule.
 *
 * An address counts blocks, sentences, words and lines, so this side and the
 * canonical one must cut a card at exactly the same places or an ordinal means
 * two things. The rules are line-based and mechanical, and every character
 * class here is ASCII on purpose: the host language's idea of a digit or of
 * whitespace is never consulted.
 *
 * Offsets are UTF-16 code units, like every other span in this package.
 */

import { FENCE_RE, fencedRegions } from "./scan.js";

export type BlockKind =
  | "Para"
  | "Table"
  | "List"
  | "Code"
  | "Blockquote"
  | "Callout"
  | "Math"
  | "Diagram"
  | "Embed"
  | "Html";

/** The kinds whose content is prose, and so has sentences and words. */
export const PROSE: ReadonlySet<BlockKind> = new Set(["Para", "List", "Blockquote", "Callout"]);

/** The fence info strings that make a diagram cell (HMD-0030). */
export const DIAGRAM_INFOS: ReadonlySet<string> = new Set(["d2#show", "mermaid#show"]);

/**
 * Whitespace, pinned as CommonMark defines Unicode whitespace: the Zs category
 * plus tab, line feed, form feed and carriage return.
 */
export const WHITESPACE: ReadonlySet<string> = new Set([
  "\t", "\n", "\x0c", "\r", "\x20", "\xa0", "\u1680",
  "\u2000", "\u2001", "\u2002", "\u2003", "\u2004", "\u2005",
  "\u2006", "\u2007", "\u2008", "\u2009", "\u200a",
  "\u202f", "\u205f", "\u3000",
]);

const TERMINATORS: ReadonlySet<string> = new Set([".", "!", "?"]);

const ATX_RE = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const BREAK_RE = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const QUOTE_RE = /^ {0,3}>/;
const CALLOUT_QUOTE_RE = /^ {0,3}>[ \t]*\[![^\] \t]+\]/;
const ADMONITION_RE = /^(?:!!!|\?\?\?\+?)[ \t]/;
const MATH_RE = /^ {0,3}\$\$/;
const HTML_RE = /^ {0,3}<[A-Za-z/!?]/;
const BULLET_RE = /^ {0,3}([-*+])(?:[ \t]|$)/;
const ORDERED_RE = /^ {0,3}([0-9]{1,9})([.)])(?:[ \t]|$)/;
const DELIMITER_ROW_RE = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const EMBED_LINE_RE = /^[ \t]*!\[\[[^[\]\n]*\]\][ \t]*$/;
const ANCHOR_TAIL_RE = /[ \t]+\^[A-Za-z0-9][A-Za-z0-9_-]{0,63}[ \t]*$/;

// Line prefixes that are structure, not words. Sticky, so each is tried at an
// offset exactly as Python's `pattern.match(line, offset)` is.
const QUOTE_PREFIX_RE = /[ \t]*(?:>[ \t]?)+/y;
const LIST_PREFIX_RE = /[ \t]*(?:[-*+]|[0-9]{1,9}[.)])(?=[ \t]|$)/y;
const CALLOUT_PREFIX_RE = /[ \t]*\[![^\] \t]+\][+-]?/y;
const ADMONITION_PREFIX_RE = /(?:!!!|\?\?\?\+?)[ \t]+[^ \t]+/y;

export interface Block {
  kind: BlockKind;
  /** From the first character of the first line to the end of the last line. */
  start: number;
  end: number;
  /** A fenced or display-math block's body lines, delimiters excluded. */
  bodyStart: number;
  bodyEnd: number;
}

export interface Range {
  start: number;
  end: number;
}

/** The lines that begin inside [start, end), each without its line ending. */
export function lines(text: string, start: number, end: number): Range[] {
  const out: Range[] = [];
  let cursor = start;
  while (cursor < end) {
    let newline = text.indexOf("\n", cursor);
    if (newline >= end) newline = -1;
    const stop = newline === -1 ? end : newline;
    const lineEnd = stop > cursor && text[stop - 1] === "\r" ? stop - 1 : stop;
    out.push({ start: cursor, end: lineEnd });
    if (newline === -1) break;
    cursor = newline + 1;
  }
  return out;
}

function stripSpaceTab(value: string): string {
  return value.replace(/^[ \t]+|[ \t]+$/g, "");
}

function isBlank(text: string, line: Range): boolean {
  return stripSpaceTab(text.slice(line.start, line.end)) === "";
}

function fenceStarts(text: string, bodyOffset: number): Map<number, number> {
  const blanked = text.slice(0, bodyOffset).replace(/[^\r\n]/g, " ") + text.slice(bodyOffset);
  const out = new Map<number, number>();
  for (const [start, end] of fencedRegions(blanked)) out.set(start, end);
  return out;
}

function listType(line: string): string | null {
  const bullet = BULLET_RE.exec(line);
  if (bullet && !BREAK_RE.test(line)) return `bullet${bullet[1]}`;
  const ordered = ORDERED_RE.exec(line);
  if (ordered) return `ordered${ordered[2]}`;
  return null;
}

function interruptsParagraph(line: string, fence: boolean): boolean {
  if (fence || ATX_RE.test(line) || BREAK_RE.test(line) || QUOTE_RE.test(line)) return true;
  if (MATH_RE.test(line) || ADMONITION_RE.test(line)) return true;
  const bullet = BULLET_RE.exec(line);
  if (bullet && stripSpaceTab(line.slice(bullet[0].length)) !== "") return true;
  const ordered = ORDERED_RE.exec(line);
  return Boolean(
    ordered && ordered[1] === "1" && stripSpaceTab(line.slice(ordered[0].length)) !== "",
  );
}

/**
 * Cut [start, end) of a card into blocks, in document order. `bodyOffset` is
 * where the frontmatter ends; the region is expected to begin at a line start.
 */
export function segment(text: string, start: number, end: number, bodyOffset = 0): Block[] {
  const fences = fenceStarts(text, bodyOffset);
  const all = lines(text, start, end);
  const blocks: Block[] = [];
  const n = all.length;
  let i = 0;

  const lineText = (k: number): string => text.slice(all[k]!.start, all[k]!.end);
  const through = (offset: number): number => {
    let k = i;
    while (k < n && all[k]!.start < offset) k += 1;
    return k;
  };
  const emit = (kind: BlockKind, first: number, last: number, body?: [number, number]): void => {
    const s = all[first]!.start;
    const e = all[last]!.end;
    const [bs, be] = body ?? [s, e];
    blocks.push({ kind, start: s, end: e, bodyStart: bs, bodyEnd: be });
  };

  while (i < n) {
    const line = all[i]!;
    const content = lineText(i);

    if (isBlank(text, line) || ATX_RE.test(content) || BREAK_RE.test(content)) {
      i += 1;
      continue;
    }

    const fenceEnd = fences.get(line.start);
    if (fenceEnd !== undefined) {
      const j = through(Math.min(fenceEnd, end));
      const last = j - 1;
      const info = stripSpaceTab(FENCE_RE.exec(content)![3]!);
      const word = info.split(/[ \t]/, 1)[0] ?? "";
      const kind: BlockKind = DIAGRAM_INFOS.has(word) ? "Diagram" : "Code";
      const closes = last > i && FENCE_RE.test(lineText(last));
      const bodyLast = closes ? last - 1 : last;
      const body: [number, number] =
        bodyLast > i ? [all[i + 1]!.start, all[bodyLast]!.end] : [all[i]!.end, all[i]!.end];
      emit(kind, i, last, body);
      i = j;
      continue;
    }

    if (MATH_RE.test(content)) {
      if (content.replace(/^ +/, "").slice(2).includes("$$")) {
        emit("Math", i, i);
        i += 1;
        continue;
      }
      let j = i + 1;
      while (j < n && !lineText(j).includes("$$")) j += 1;
      const closed = j < n;
      const last = closed ? j : n - 1;
      const bodyLast = closed ? last - 1 : last;
      const body: [number, number] =
        bodyLast > i ? [all[i + 1]!.start, all[bodyLast]!.end] : [all[i]!.end, all[i]!.end];
      emit("Math", i, last, body);
      i = last + 1;
      continue;
    }

    if (ADMONITION_RE.test(content)) {
      let j = i + 1;
      let last = i;
      while (j < n) {
        const following = lineText(j);
        if (isBlank(text, all[j]!)) {
          j += 1;
          continue;
        }
        if (following.startsWith("    ") || following.startsWith("\t")) {
          last = j;
          j += 1;
          continue;
        }
        break;
      }
      emit("Callout", i, last);
      i = last + 1;
      continue;
    }

    if (QUOTE_RE.test(content)) {
      const kind: BlockKind = CALLOUT_QUOTE_RE.test(content) ? "Callout" : "Blockquote";
      let j = i + 1;
      while (j < n && !isBlank(text, all[j]!)) j += 1;
      emit(kind, i, j - 1);
      i = j;
      continue;
    }

    const kindOfList = listType(content);
    if (kindOfList !== null) {
      let j = i + 1;
      let last = i;
      while (j < n) {
        const innerFence = fences.get(all[j]!.start);
        if (innerFence !== undefined) {
          const k = through(Math.min(innerFence, end));
          if (!(lineText(j).startsWith(" ") || lineText(j).startsWith("\t"))) break;
          last = k - 1;
          j = k;
          continue;
        }
        const following = lineText(j);
        if (isBlank(text, all[j]!)) {
          j += 1;
          continue;
        }
        const gap = last < j - 1;
        const marker = listType(following);
        if (marker !== null) {
          if (marker !== kindOfList) break;
          last = j;
          j += 1;
          continue;
        }
        if (following.startsWith("  ") || following.startsWith("\t")) {
          last = j;
          j += 1;
          continue;
        }
        if (gap || interruptsParagraph(following, false)) break;
        last = j;
        j += 1;
      }
      emit("List", i, last);
      i = last + 1;
      continue;
    }

    if (HTML_RE.test(content)) {
      let j = i + 1;
      while (j < n && !isBlank(text, all[j]!)) j += 1;
      emit("Html", i, j - 1);
      i = j;
      continue;
    }

    if (
      content.includes("|") &&
      i + 1 < n &&
      DELIMITER_ROW_RE.test(lineText(i + 1)) &&
      (content + lineText(i + 1)).includes("|")
    ) {
      let j = i + 2;
      while (j < n && !isBlank(text, all[j]!)) j += 1;
      emit("Table", i, j - 1);
      i = j;
      continue;
    }

    let j = i + 1;
    while (j < n) {
      if (isBlank(text, all[j]!)) break;
      if (interruptsParagraph(lineText(j), fences.has(all[j]!.start))) break;
      j += 1;
    }
    const kind: BlockKind =
      j === i + 1 && EMBED_LINE_RE.test(content.replace(ANCHOR_TAIL_RE, "")) ? "Embed" : "Para";
    emit(kind, i, j - 1);
    i = j;
  }

  return blocks;
}

// -- text units ------------------------------------------------------------

function prefixes(kind: BlockKind): RegExp[] {
  const out: RegExp[] = [];
  if (kind === "Blockquote" || kind === "Callout") {
    out.push(ADMONITION_PREFIX_RE, QUOTE_PREFIX_RE, CALLOUT_PREFIX_RE);
  }
  if (kind === "List" || kind === "Blockquote" || kind === "Callout") out.push(LIST_PREFIX_RE);
  return out;
}

/**
 * The words of a prose block: maximal runs of non-whitespace, with structure
 * — quote and list markers, callout markers, and anchors in `skip` — left out.
 */
export function words(text: string, block: Block, skip: readonly Range[] = []): Range[] {
  const out: Range[] = [];
  for (const line of lines(text, block.start, block.end)) {
    const raw = text.slice(line.start, line.end);
    let offset = 0;
    for (const prefix of prefixes(block.kind)) {
      prefix.lastIndex = offset;
      const m = prefix.exec(raw);
      if (m && m.index === offset && offset + m[0].length > offset) offset += m[0].length;
    }
    let cursor = line.start + offset;
    const stop = line.end;
    while (cursor < stop) {
      while (cursor < stop && WHITESPACE.has(text[cursor]!)) cursor += 1;
      if (cursor >= stop) break;
      const begin = cursor;
      while (cursor < stop && !WHITESPACE.has(text[cursor]!)) cursor += 1;
      if (!skip.some((s) => s.start <= begin && begin < s.end)) out.push({ start: begin, end: cursor });
    }
  }
  return out;
}

/** Group words into sentences: a sentence ends at a word ending in `.!?`. */
export function sentences(text: string, units: readonly Range[]): Range[][] {
  const out: Range[][] = [];
  let current: Range[] = [];
  for (const word of units) {
    current.push(word);
    if (TERMINATORS.has(text[word.end - 1]!)) {
      out.push(current);
      current = [];
    }
  }
  if (current.length > 0) out.push(current);
  return out;
}
