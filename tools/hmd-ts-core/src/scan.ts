/**
 * Masking scanner — a port of `tools/hmd/src/hypermarkdown/scan.py`.
 *
 * The scanner does not parse CommonMark. It masks the regions where markup must
 * not be interpreted, then extracts constructs from what is left. Masking
 * replaces characters with spaces and preserves line breaks, so every offset,
 * line, and column in the masked text still refers to the original source.
 *
 * A line ends at `\n`, at `\r\n`, or at a lone `\r`, as in CommonMark. The
 * masked text spells all three as one `\n` — a `\r\n` becomes a space and a
 * `\n`, a lone `\r` becomes a `\n` — so its length is unchanged and every
 * line-oriented pattern below needs to know only one line ending. None of the
 * patterns uses the `m` flag or `.`: JavaScript would then also break lines at
 * U+2028 and U+2029, which the language does not.
 *
 * Offsets inside this module are UTF-16 indices into the text. `PositionIndex`
 * turns them into the spans the specification asks for: UTF-8 byte offsets,
 * and a column that counts code points.
 *
 * HMD-0020 gives markdown-it the rendering job. It does not get this one:
 * conformance with the canonical implementation is measured here, and the two
 * scanners disagree on exactly the case the language legislates — an indented
 * block is a callout body, not code.
 */

import { PY_SPACE, codePoints, splitWords, strip, utf8Length } from "./unicode.js";

const FENCE_RE = /^([ \t]*)(`{3,}|~{3,})([\s\S]*)$/;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const CODE_SPAN_RE = /(`+)([\s\S]+?)\1/g;

const ATX_HEADING_RE = /(?<=^|\n)[ \t]{0,3}(#{1,6})[ \t]+([^\n]*?)[ \t]*(?=\n|$)/g;
const ANCHOR_RE = /[ \t]+\^([A-Za-z0-9][A-Za-z0-9_-]{0,63})[ \t]*(?=\n|$)/g;
/** A wikilink target may not contain "[", "]" or a line break. */
const LINK_RE = /(!?)\[\[([^[\]\n]*)\]\]/g;
const OPEN_RE = /!?\[\[/g;

/** One line ending, in each of the three forms CommonMark recognises. */
const EOL_RE = /\r\n|\r|\n/g;
/** One line with its ending. The last line of a file may have none. */
const LINE_RE = /[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g;

export type Region = readonly [number, number];

/**
 * `text` as lines, each with its ending, split only where CommonMark is: at
 * `\n`, `\r\n`, and a lone `\r`.
 */
export function splitLines(text: string): string[] {
  return text.match(LINE_RE) ?? [];
}

/** A line without its ending. */
export function stripEol(line: string): string {
  return line.replace(/[\r\n]+$/, "");
}

/** Yield [start, end) for each fenced code block, closed or not. */
function fencedRegions(text: string): Region[] {
  const regions: Region[] = [];
  let openFence: string | null = null;
  let openStart = 0;
  let offset = 0;

  for (const line of splitLines(text)) {
    const m = FENCE_RE.exec(stripEol(line));
    if (openFence === null) {
      if (m && !strip(m[3]!).startsWith(m[2]![0]!)) {
        openFence = m[2]!;
        openStart = offset;
      }
    } else if (
      // A closer is the same character, at least as long, with no info string.
      m &&
      m[2]![0] === openFence[0] &&
      m[2]!.length >= openFence.length &&
      strip(m[3]!) === ""
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
      if (chars[i] !== "\n" && chars[i] !== "\r") chars[i] = " ";
    }
  }
  return chars.join("");
}

function maskedRegions(text: string): Region[] {
  const regions: Region[] = [...fencedRegions(text)];
  let blanked = blank(text, regions);

  // Comments and code spans are found in text that already has fences removed,
  // so a "<!--" inside a code block cannot open a comment.
  for (const m of blanked.matchAll(HTML_COMMENT_RE)) {
    regions.push([m.index!, m.index! + m[0].length]);
  }
  blanked = blank(blanked, regions);

  for (const m of blanked.matchAll(CODE_SPAN_RE)) {
    // A code span cannot span a blank line, whichever line ending it uses.
    if (m[0].replace(/\r\n?/g, "\n").includes("\n\n")) continue;
    regions.push([m.index!, m.index! + m[0].length]);
  }
  return regions;
}

/**
 * Return `text` with uninterpreted regions blanked out, offsets preserved, and
 * every line ending spelled `\n`.
 *
 * Masked: fenced code blocks, HTML comments, and inline code spans.
 *
 * Indented code blocks are deliberately NOT masked. Under `admonition` and
 * `footnotes` a four-space indent marks a callout body or a footnote
 * continuation rather than code; masking it would silently drop real links
 * from ordinary prose.
 */
export function mask(text: string): string {
  return oneLineEnding(blank(text, maskedRegions(text)));
}

/** Spell every line ending as `\n` without changing the length of `text`. */
export function oneLineEnding(text: string): string {
  if (!text.includes("\r")) return text;
  return text.replace(/\r\n/g, " \n").replace(/\r/g, "\n");
}

/** The index of the first character of every line. */
export function lineStarts(text: string): number[] {
  const starts = [0];
  for (const m of text.matchAll(EOL_RE)) starts.push(m.index! + m[0].length);
  return starts;
}

/**
 * Index -> position lookup, built once per parse.
 *
 * A line and a column start at 1, and the column counts Unicode code points,
 * so it is the same number in every implementation whatever its string type.
 * `byte` gives the UTF-8 byte offset a span records.
 *
 * A linear scan per construct is O(n·m) on a document with many links, which
 * is exactly the shape of the documents this format encourages.
 */
export class PositionIndex {
  private readonly starts: number[];
  private readonly ascii: boolean;
  private byteStarts: number[] | null = null;

  constructor(private readonly text: string) {
    this.starts = lineStarts(text);
    this.ascii = /^[\x00-\x7f]*$/.test(text);
  }

  private lineIndex(offset: number): number {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** 1-indexed line and code-point column for a UTF-16 index. */
  at(offset: number): { line: number; column: number } {
    const lo = this.lineIndex(offset);
    const start = this.starts[lo]!;
    const column = this.ascii ? offset - start : codePoints(this.text, start, offset);
    return { line: lo + 1, column: column + 1 };
  }

  /** The UTF-8 byte offset of the character at a UTF-16 index. */
  byte(offset: number): number {
    if (this.ascii) return offset;
    if (this.byteStarts === null) {
      const out: number[] = [];
      let total = 0;
      for (let i = 0; i < this.starts.length; i += 1) {
        out.push(total);
        const end = this.starts[i + 1] ?? this.text.length;
        total += utf8Length(this.text, this.starts[i]!, end);
      }
      this.byteStarts = out;
    }
    const line = this.lineIndex(offset);
    return this.byteStarts[line]! + utf8Length(this.text, this.starts[line]!, offset);
  }

  /** Start index of a 1-indexed line. */
  offsetOfLine(line: number): number {
    return this.starts[Math.min(Math.max(line, 1), this.starts.length) - 1]!;
  }

  get lineCount(): number {
    return this.starts.length;
  }
}

/** 1-indexed line and column for an index. Prefer `PositionIndex` in loops. */
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

/**
 * Every heading in masked text, in order: an ATX heading (`# Setup`), and a
 * setext heading, a paragraph over a line of `=` (level 1) or `-` (level 2).
 * A setext heading's span runs from its first content line to the end of its
 * underline, so its content is everything before the span's last line break.
 */
export function findHeadings(masked: string): RawHeading[] {
  const out: RawHeading[] = [];
  for (const m of masked.matchAll(ATX_HEADING_RE)) {
    let text = m[2]!;
    // Drop a closing hash run, then any trailing block anchor.
    text = text.replace(CLOSING_HASHES_RE, "");
    text = text.replace(TRAILING_ANCHOR_RE, "");
    // The span ends at the last character of the heading, not at trailing
    // blanks — one of which may be the `\r` of a `\r\n`.
    const end = m.index! + m[0].replace(/[ \t]+$/, "").length;
    out.push({ level: m[1]!.length, text: strip(text), start: m.index!, end });
  }
  out.push(...setextHeadings(masked));
  out.sort((a, b) => a.start - b.start);
  return out;
}

const SETEXT_UNDERLINE_RE = /^ {0,3}(=+|-+)[ \t]*$/;
const ATX_START_RE = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const THEMATIC_BREAK_RE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const BLOCKQUOTE_RE = /^ {0,3}>/;
const LIST_ITEM_RE = /^ {0,3}(?:[-+*]|\p{Nd}{1,9}[.)])(?:[ \t]|$)/u;
/**
 * The HTML blocks that open on a tag name (CommonMark's kinds 1 and 6), plus
 * `<!`, `<?`, and a line that is nothing but one tag (kind 7). Inline HTML at
 * the start of an ordinary paragraph line is none of these.
 */
const HTML_BLOCK_TAGS: ReadonlySet<string> = new Set(
  `address article aside base basefont blockquote body caption center col
  colgroup dd details dialog dir div dl dt fieldset figcaption figure footer
  form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li
  link main menu menuitem nav noframes ol optgroup option p param search
  section summary table tbody td tfoot th thead title tr track ul pre script
  style textarea`.split(/\s+/),
);
const HTML_OPEN_RE = new RegExp(`^ {0,3}<(/?)([A-Za-z][A-Za-z0-9-]*)(?=[${PY_SPACE}/>]|$)`);
const HTML_ONLY_TAG_RE = new RegExp(
  `^ {0,3}</?[A-Za-z][A-Za-z0-9-]*(?:[${PY_SPACE}][^<>]*)?/?>[ \\t]*$`,
);

/**
 * Every setext heading in masked text.
 *
 * A line-oriented reading of CommonMark's paragraph rule, on masked text. A
 * paragraph starts at a line no other block claims, runs until a blank line
 * or a line that interrupts it, and becomes a heading when its next line is an
 * underline. Masked lines are blank here, so a fence, an HTML comment block,
 * and the frontmatter all end a paragraph, and no line inside one is ever part
 * of a heading. A `---` after a blank line is a thematic break, because no
 * paragraph is open to underline.
 *
 * Lines that open a block quote, a list item, or an HTML block start a
 * container this scanner does not descend into: everything up to the next
 * blank line belongs to it, so a `---` there is not an underline.
 */
function setextHeadings(masked: string): RawHeading[] {
  const out: RawHeading[] = [];
  let paragraph: number | null = null; // offset where the open paragraph starts
  let container = false;
  let offset = 0;
  let lastEnd = 0; // end of the previous line, without its line ending
  for (const line of masked.split("\n")) {
    const start = offset;
    offset = start + line.length + 1;
    const content = line.replace(/[ \t]+$/, "");
    if (strip(content) === "") {
      paragraph = null;
      container = false;
      continue;
    }
    if (container) continue;
    const underline = SETEXT_UNDERLINE_RE.exec(content);
    if (paragraph !== null && underline) {
      const level = underline[1]![0] === "=" ? 1 : 2;
      const text = masked
        .slice(paragraph, lastEnd)
        .split("\n")
        .map((part) => strip(part))
        .join(" ");
      out.push({ level, text: strip(text), start: paragraph, end: start + content.length });
      paragraph = null;
      continue;
    }
    if (ATX_START_RE.test(content) || THEMATIC_BREAK_RE.test(content)) {
      paragraph = null;
      continue;
    }
    if (opensContainer(content, paragraph !== null)) {
      paragraph = null;
      container = true;
      continue;
    }
    if (paragraph === null) {
      if (indent(content) >= 4) {
        // An indented code block, which cannot be a heading. It is not
        // masked, but it is not a paragraph either.
        container = true;
        continue;
      }
      paragraph = start;
    }
    lastEnd = start + content.length;
  }
  return out;
}

function indent(line: string): number {
  let width = 0;
  for (const ch of line) {
    if (ch === " ") width += 1;
    else if (ch === "\t") width += 4 - (width % 4);
    else break;
  }
  return width;
}

/**
 * Whether `line` opens a block this scanner does not descend into.
 *
 * `interrupting` is whether a paragraph is open. CommonMark lets fewer blocks
 * interrupt a paragraph than start after a blank line: an empty list item, an
 * ordered item not numbered 1, and a line holding one bare tag do not, and are
 * then that paragraph's continuation text.
 */
function opensContainer(line: string, interrupting: boolean): boolean {
  if (BLOCKQUOTE_RE.test(line)) return true;
  const item = LIST_ITEM_RE.exec(line);
  if (item !== null) {
    if (!interrupting) return true;
    const marker = splitWords(strip(line))[0]!;
    if (strip(line.slice(item[0].length)) === "") return false;
    return !/^\p{Nd}/u.test(marker) || marker.slice(0, -1) === "1";
  }
  const tag = HTML_OPEN_RE.exec(line);
  if (tag === null) {
    const rest = line.replace(/^ +/, "");
    return !interrupting && (rest.startsWith("<!") || rest.startsWith("<?"));
  }
  if (HTML_BLOCK_TAGS.has(tag[2]!.toLowerCase())) return true;
  return !interrupting && HTML_ONLY_TAG_RE.test(line);
}

export interface RawAnchor {
  blockId: string;
  start: number;
  end: number;
}

/** Every trailing `^id`; the span covers the marker up to the end of the id. */
export function findAnchors(masked: string): RawAnchor[] {
  const out: RawAnchor[] = [];
  for (const m of masked.matchAll(ANCHOR_RE)) {
    const end = m.index! + m[0].indexOf("^") + 1 + m[1]!.length;
    out.push({ blockId: m[1]!, start: m.index!, end });
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
  for (const m of masked.matchAll(LINK_RE)) {
    closed.add(m.index! + (m[1] === "!" ? 1 : 0));
  }

  const out: number[] = [];
  for (const m of masked.matchAll(OPEN_RE)) {
    const start = m.index! + (m[0].startsWith("!") ? 1 : 0);
    if (!closed.has(start)) out.push(m.index!);
  }
  return out;
}
