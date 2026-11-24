/**
 * Source text -> `ParsedDocument`: the lexical model, the grammar, heading
 * anchors — a port of `tools/hmd/src/hypermarkdown/parse.py`.
 *
 * Parsing never throws on partial input (HMD-0020). A buffer caught
 * mid-keystroke is the ordinary input here, not an error case: an unclosed
 * `[[` is text, a malformed link becomes a diagnostic, and the rest of the
 * card parses normally.
 */

import MarkdownIt from "markdown-it";

import { parseCardConfig, parseYaml, splitFrontmatter } from "./frontmatter.js";
import {
  ERROR,
  emptyCardConfig,
  type Anchor,
  type CardConfig,
  type Diagnostic,
  type FragmentKind,
  type Heading,
  type Link,
  type ParsedDocument,
  type Span,
} from "./model.js";
import { cardSuffix } from "./paths.js";
import * as scan from "./scan.js";
import {
  PY_SPACE,
  charAt,
  charBefore,
  headingKey,
  isAlnum,
  isSpace,
  rstrip,
  splitWords,
  strip,
} from "./unicode.js";

export const SUFFIX = ".hmd";

/** Characters that may not appear literally in a link target. */
export const RESERVED_CHARS: ReadonlySet<string> = new Set(["[", "]", "|", "#", "^", ":", "\n"]);

const BLOCK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const ANCHOR_SUFFIX_RE = /[ \t]+\^[A-Za-z0-9][A-Za-z0-9_-]{0,63}[ \t]*$/;
const CLOSING_HASHES_RE = /(?:^|[ \t]+)#+[ \t]*$/;
const ATX_CONTENT_RE = /^[ \t]{0,3}#{1,6}(?:[ \t]+([\s\S]*?))?[ \t]*$/;

/**
 * Inline markup, in the order a reader's eye removes it. A code span is first
 * so that nothing inside it is read as markup, and a wikilink comes before an
 * ordinary link because it is spelled with more brackets. The same pattern as
 * the canonical implementation's, with Python's `\s` and `.` spelled out.
 */
const INLINE_RE = new RegExp(
  [
    "(?<ticks>`+)(?<code>[\\s\\S]+?)\\k<ticks>",
    "\\\\(?<escaped>[!-/:-@\\[-`{-~])",
    "!?\\[\\[(?<wikilink>[^\\[\\]\\n]*)\\]\\]",
    "(?<comment><!--[\\s\\S]*?-->)",
    `<(?<autolink>[A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>${PY_SPACE}]*)>`,
    "<(?<email>[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+)>",
    `(?<tag></?[A-Za-z][A-Za-z0-9-]*(?:[${PY_SPACE}][^<>]*)?/?>)`,
    "!\\[(?<alt>[^\\]]*)\\]\\([^)]*\\)",
    "\\[(?<label>[^\\]]*)\\](?:\\([^)]*\\)|\\[[^\\]]*\\])",
    "(?<entity>&(?:#[0-9]{1,7}|#[xX][0-9A-Fa-f]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});)",
    "(?<delimiter>\\*+|_+|~~)",
  ].join("|"),
  "g",
);

/**
 * Heading content as a reader sees it: inline markup removed.
 *
 * `The *fast* path` reads `The fast path`, a code span reads as its code, a
 * link as its text, a wikilink as its display or its page reference, and raw
 * HTML tags and comments vanish. Whitespace, line breaks included, collapses
 * to single spaces. This is a reading of CommonMark's inlines and not a full
 * parser: an emphasis delimiter is dropped wherever it touches a word, except
 * an `_` inside one, which CommonMark does not treat as emphasis.
 */
export function visibleText(source: string): string {
  const replaced = source.replace(INLINE_RE, (...args: unknown[]) => {
    const groups = args[args.length - 1] as Record<string, string | undefined>;
    const offset = args[args.length - 3] as number;
    const whole = args[0] as string;
    if (groups["ticks"] !== undefined) {
      let code = groups["code"]!.replace(/\r\n|\r|\n/g, " ");
      if (code.startsWith(" ") && code.endsWith(" ") && strip(code) !== "") {
        code = code.slice(1, -1);
      }
      return code;
    }
    if (groups["escaped"] !== undefined) return groups["escaped"];
    if (groups["wikilink"] !== undefined) {
      const inner = groups["wikilink"];
      const bar = inner.indexOf("|");
      if (bar !== -1) return inner.slice(bar + 1);
      const hash = inner.indexOf("#");
      return strip(hash === -1 ? inner : inner.slice(0, hash));
    }
    if (groups["comment"] !== undefined || groups["tag"] !== undefined) return "";
    if (groups["autolink"] !== undefined) return groups["autolink"];
    if (groups["email"] !== undefined) return groups["email"];
    if (groups["alt"] !== undefined) return visibleText(groups["alt"]);
    if (groups["label"] !== undefined) return visibleText(groups["label"]);
    if (groups["entity"] !== undefined) return unescapeEntity(groups["entity"]);
    return delimiter(source, offset, whole);
  });
  return splitWords(replaced).join(" ");
}

/** An emphasis delimiter run is dropped; a run that is plain text is kept. */
function delimiter(source: string, offset: number, run: string): string {
  const before = offset > 0 ? charBefore(source, offset) : " ";
  const end = offset + run.length;
  const after = end < source.length ? charAt(source, end) : " ";
  if (isSpace(before) && isSpace(after)) return run; // `2 * 3` flanks nothing, so it is text
  if (run[0] === "_" && isAlnum(before) && isAlnum(after)) return run; // `snake_case`
  return "";
}

/** Numeric references CommonMark and Python's `html.unescape` remap. */
const REMAPPED_CHARREFS: ReadonlyMap<number, string> = new Map([
  [0x00, "\ufffd"], [0x0d, "\r"], [0x80, "\u20ac"], [0x81, "\x81"], [0x82, "\u201a"],
  [0x83, "\u0192"], [0x84, "\u201e"], [0x85, "\u2026"], [0x86, "\u2020"], [0x87, "\u2021"],
  [0x88, "\u02c6"], [0x89, "\u2030"], [0x8a, "\u0160"], [0x8b, "\u2039"], [0x8c, "\u0152"],
  [0x8d, "\x8d"], [0x8e, "\u017d"], [0x8f, "\x8f"], [0x90, "\x90"], [0x91, "\u2018"],
  [0x92, "\u2019"], [0x93, "\u201c"], [0x94, "\u201d"], [0x95, "\u2022"], [0x96, "\u2013"],
  [0x97, "\u2014"], [0x98, "\u02dc"], [0x99, "\u2122"], [0x9a, "\u0161"], [0x9b, "\u203a"],
  [0x9c, "\u0153"], [0x9d, "\x9d"], [0x9e, "\u017e"], [0x9f, "\u0178"],
]);

/** Code points a numeric reference may not produce, which then produces nothing. */
function droppedCodePoint(code: number): boolean {
  return (
    (code >= 0x1 && code <= 0x8) ||
    code === 0xb ||
    (code >= 0xe && code <= 0x1f) ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0xfdd0 && code <= 0xfdef) ||
    (code & 0xfffe) === 0xfffe
  );
}

let markdown: MarkdownIt | null = null;

/** One `&...;` reference, decoded the way Python's `html.unescape` does. */
function unescapeEntity(entity: string): string {
  if (entity[1] === "#") {
    const hex = entity[2] === "x" || entity[2] === "X";
    const code = Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
    const remapped = REMAPPED_CHARREFS.get(code);
    if (remapped !== undefined) return remapped;
    if ((code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff) return "\ufffd";
    if (droppedCodePoint(code)) return "";
    return String.fromCodePoint(code);
  }
  // A named reference: the HTML5 table markdown-it already carries.
  markdown ??= new MarkdownIt();
  return markdown.utils.unescapeAll(entity);
}

/**
 * The text of one heading as written: its markers, closing run, and anchor
 * gone. `raw` is the heading's whole source; one that spans more than one line
 * is a setext heading, and its underline is its last line.
 */
export function headingContent(raw: string): string {
  const lastBreak = Math.max(raw.lastIndexOf("\n"), raw.lastIndexOf("\r"));
  if (lastBreak !== -1) {
    return strip(rstrip(raw.slice(0, lastBreak)).replace(ANCHOR_SUFFIX_RE, ""));
  }
  const m = ATX_CONTENT_RE.exec(raw);
  let content = m ? (m[1] ?? "") : raw;
  content = rstrip(content).replace(ANCHOR_SUFFIX_RE, "");
  return strip(content.replace(CLOSING_HASHES_RE, ""));
}

/**
 * Parse one card. `rel` is the root-relative path used in diagnostics; one
 * ending in `.md` or `.markdown` is a Markdown card, read by `parseMarkdown`.
 */
export function parse(rel: string, text: string): ParsedDocument {
  const suffix = cardSuffix(rel);
  if (suffix !== null && suffix !== SUFFIX) return parseMarkdown(rel, text);
  const diagnostics: Diagnostic[] = [];
  const { raw, bodyOffset } = splitFrontmatter(text);

  let frontmatter: Record<string, unknown> = {};
  let card: CardConfig = emptyCardConfig();

  if (raw !== null) {
    try {
      frontmatter = parseYaml(raw);
      const parsed = parseCardConfig(frontmatter);
      card = parsed.card;
      for (const [rule, message] of parsed.problems) {
        diagnostics.push({ rule, severity: ERROR, path: rel, line: 1, column: 1, message });
      }
    } catch (exc) {
      diagnostics.push({
        rule: "HMD009",
        severity: ERROR,
        path: rel,
        line: 1,
        column: 1,
        message: exc instanceof Error ? exc.message : String(exc),
      });
    }
  }

  // Mask the body only; frontmatter is YAML, not markdown. The frontmatter
  // becomes blanks of the same length with its line breaks kept, so the first
  // body line does not read as indented.
  const masked = maskedText(text, bodyOffset);
  const index = new scan.PositionIndex(text);

  const headings = collectHeadings(text, masked, index);
  const anchors = collectAnchors(text, masked, index);
  const { links, diagnostics: linkDiagnostics } = collectLinks(text, masked, index, rel);
  diagnostics.push(...linkDiagnostics);

  return { path: rel, text, frontmatter, card, headings, anchors, links, diagnostics };
}

/**
 * Read one Markdown card (HMD-0029): frontmatter and headings, nothing else.
 *
 * The body is CommonMark and is not scanned, so it yields no link, embed or
 * block anchor. A frontmatter block is exposed as data and none of its keys is
 * interpreted; one that does not parse as a mapping is body text, and is not
 * reported.
 */
export function parseMarkdown(rel: string, text: string): ParsedDocument {
  const { raw } = splitFrontmatter(text);
  let { bodyOffset } = splitFrontmatter(text);
  let frontmatter: Record<string, unknown> = {};
  if (raw !== null) {
    try {
      frontmatter = parseYaml(raw);
    } catch {
      bodyOffset = 0;
    }
  }
  const masked = maskedText(text, bodyOffset);
  const index = new scan.PositionIndex(text);
  return {
    path: rel,
    kind: "markdown",
    text,
    frontmatter,
    card: emptyCardConfig(),
    headings: collectHeadings(text, masked, index),
    anchors: [],
    links: [],
    diagnostics: [],
  };
}

/** The text as the extractors read it: frontmatter blanked, body masked. */
function maskedText(text: string, bodyOffset: number): string {
  return scan.oneLineEnding(blank(text.slice(0, bodyOffset)) + scan.mask(text.slice(bodyOffset)));
}

/** `text` as blanks of the same length, its line breaks kept. */
function blank(text: string): string {
  return text.replace(/[^\r\n]/g, " ");
}

function spanAt(index: scan.PositionIndex, start: number, end: number): Span {
  const { line, column } = index.at(start);
  return { start: index.byte(start), end: index.byte(end), line, column, index: start, indexEnd: end };
}

function collectHeadings(
  text: string,
  masked: string,
  index: scan.PositionIndex,
): Heading[] {
  const out: Heading[] = [];
  for (const raw of scan.findHeadings(masked)) {
    // Read the ORIGINAL text: masking blanks inline code, and a heading such
    // as "## The `hmd` CLI" reads "The hmd CLI", not "The  CLI".
    const shown = visibleText(headingContent(text.slice(raw.start, raw.end)));
    out.push({
      level: raw.level,
      text: shown,
      key: headingKey(shown),
      span: spanAt(index, raw.start, raw.end),
    });
  }
  return out;
}

function collectAnchors(text: string, masked: string, index: scan.PositionIndex): Anchor[] {
  return scan
    .findAnchors(masked)
    .map((raw) => ({ blockId: raw.blockId, span: spanAt(index, raw.start, raw.end) }));
}

function collectLinks(
  text: string,
  masked: string,
  index: scan.PositionIndex,
  rel: string,
): { links: Link[]; diagnostics: Diagnostic[] } {
  const links: Link[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const found of scan.findLinks(masked)) {
    const span = spanAt(index, found.start, found.end);
    const raw = text.slice(found.start, found.end);
    let target: ParsedTarget;
    try {
      target = parseTarget(found.inner);
    } catch (exc) {
      diagnostics.push({
        rule: "HMD010",
        severity: ERROR,
        path: rel,
        line: span.line,
        column: span.column,
        message: `${exc instanceof Error ? exc.message : String(exc)} in ${raw}`,
      });
      continue;
    }
    links.push({ ...target, isEmbed: found.isEmbed, raw, span });
  }

  // A `[[` that begins no link candidate is ordinary text, not HMD010.
  return { links, diagnostics };
}

interface ParsedTarget {
  pageRef: string;
  fragment: string | null;
  fragmentKind: FragmentKind | null;
  display: string | null;
}

/**
 * Split a link body into its parts, throwing for anything malformed (HMD010).
 */
export function parseTarget(inner: string): ParsedTarget {
  if (inner.trim() === "") throw new Error("empty link target");

  // Display text comes last and may itself contain '|', so split once only.
  let rest = inner;
  let display: string | null = null;
  const bar = rest.indexOf("|");
  if (bar !== -1) {
    display = rest.slice(bar + 1);
    rest = rest.slice(0, bar);
    if (display.trim() === "") throw new Error("empty display text");
  }

  let fragment: string | null = null;
  let fragmentKind: FragmentKind | null = null;
  const hash = rest.indexOf("#");
  if (hash !== -1) {
    fragment = rest.slice(hash + 1);
    rest = rest.slice(0, hash);
    if (fragment.startsWith("^")) {
      fragmentKind = "block";
      fragment = fragment.slice(1);
      if (!BLOCK_ID_RE.test(fragment)) {
        throw new Error(`invalid block id '${fragment}'`);
      }
    } else {
      fragmentKind = "heading";
      if (fragment.trim() === "") throw new Error("empty heading fragment");
    }
  }

  const pageRef = rest.trim();
  if (pageRef === "") {
    // Covers `[[#tag]]`: a tag is never a link target, because '#' is
    // reserved for fragments.
    throw new Error("link target has no page reference");
  }

  const bad = [...new Set([...pageRef].filter((c) => RESERVED_CHARS.has(c)))].sort();
  if (bad.length > 0) {
    throw new Error(`reserved character '${bad.join("")}' in target`);
  }

  return { pageRef, fragment, fragmentKind, display };
}
