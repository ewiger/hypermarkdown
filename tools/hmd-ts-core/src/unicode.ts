/**
 * Text primitives the specification states in Unicode terms: NFC, full case
 * folding, the heading key, and whitespace as the canonical implementation
 * reads it.
 *
 * JavaScript's own notions differ from Python's in small ways that change
 * answers. `toLowerCase` is not case folding, `trim` strips U+FEFF and keeps
 * U+001C–U+001F and U+0085, and `\s` disagrees on the same characters. Every
 * place a heading's text or key is computed goes through this module instead,
 * so the two implementations agree on the edges as well as the middle.
 */

import { CASE_FOLDING_TABLE } from "./casefold.js";

/**
 * The characters Python's `str.isspace` accepts, as a regex class body. Also
 * what Python's `\s`, `str.split()`, and `str.strip()` mean.
 */
export const PY_SPACE =
  "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";

const SPACE_RE = new RegExp(`^[${PY_SPACE}]$`);
const LEADING_RE = new RegExp(`^[${PY_SPACE}]+`);
const TRAILING_RE = new RegExp(`[${PY_SPACE}]+$`);
const RUN_RE = new RegExp(`[${PY_SPACE}]+`);

/** Python's `ch.isspace()` for one character. */
export function isSpace(ch: string): boolean {
  return SPACE_RE.test(ch);
}

/** Python's `value.strip()`. */
export function strip(value: string): string {
  return value.replace(LEADING_RE, "").replace(TRAILING_RE, "");
}

/** Python's `value.rstrip()`. */
export function rstrip(value: string): string {
  return value.replace(TRAILING_RE, "");
}

/** Python's `value.split()`: on runs of whitespace, no empty fields. */
export function splitWords(value: string): string[] {
  return value.split(RUN_RE).filter((part) => part !== "");
}

/** `value` in Unicode NFC, the form every name is compared in. */
export function nfc(value: string): string {
  return value.normalize("NFC");
}

let folding: Map<number, string> | null = null;

function foldingTable(): Map<number, string> {
  if (folding !== null) return folding;
  folding = new Map();
  for (const entry of CASE_FOLDING_TABLE.split(";")) {
    if (entry === "") continue;
    const [code, folded] = entry.split(":") as [string, string];
    folding.set(
      Number.parseInt(code, 16),
      String.fromCodePoint(...folded.split(" ").map((each) => Number.parseInt(each, 16))),
    );
  }
  return folding;
}

/**
 * Unicode full case folding: `CaseFolding.txt` statuses C and F.
 *
 * `Straße` folds to `strasse`, `ẞ` to `ss`, and final sigma to `σ` — none of
 * which `toLowerCase` does. The table is generated from Python's
 * `str.casefold`, so it is the canonical implementation's folding exactly.
 */
export function caseFold(value: string): string {
  const table = foldingTable();
  let out = "";
  for (const ch of value) {
    out += table.get(ch.codePointAt(0)!) ?? ch;
  }
  return out;
}

const LETTER_MARK_NUMBER_RE = /^[\p{L}\p{M}\p{N}]$/u;

/**
 * The key a heading fragment and a heading are compared by.
 *
 * NFC, then full case folding, then every character that is not a letter, a
 * mark, or a number (general categories L, M, N) becomes a space, then runs of
 * spaces collapse and both ends are trimmed. Letters and digits of every
 * script survive, and so do accents: `Café` and `Cafe` differ.
 */
export function headingKey(text: string): string {
  let kept = "";
  for (const ch of caseFold(nfc(text))) {
    kept += LETTER_MARK_NUMBER_RE.test(ch) ? ch : " ";
  }
  return kept.split(" ").filter((part) => part !== "").join(" ");
}

const LETTER_OR_NUMBER_RE = /^[\p{L}\p{N}]$/u;

/** Python's `ch.isalnum()` for one character. */
export function isAlnum(ch: string): boolean {
  return LETTER_OR_NUMBER_RE.test(ch);
}

/** The code point that ends just before `index`, as a string ("" at 0). */
export function charBefore(text: string, index: number): string {
  if (index <= 0) return "";
  const low = text.charCodeAt(index - 1);
  if (index >= 2 && low >= 0xdc00 && low <= 0xdfff) {
    const high = text.charCodeAt(index - 2);
    if (high >= 0xd800 && high <= 0xdbff) return text.slice(index - 2, index);
  }
  return text.slice(index - 1, index);
}

/** The code point that starts at `index`, as a string ("" at the end). */
export function charAt(text: string, index: number): string {
  if (index >= text.length) return "";
  return String.fromCodePoint(text.codePointAt(index)!);
}

/** How many code points `text[start:end]` holds. */
export function codePoints(text: string, start = 0, end = text.length): number {
  let count = 0;
  for (let i = start; i < end; i += 1) {
    const unit = text.charCodeAt(i);
    // A high surrogate followed by a low one is a single code point.
    if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < end) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i += 1;
    }
    count += 1;
  }
  return count;
}

/** How many UTF-8 bytes `text[start:end]` encodes to. */
export function utf8Length(text: string, start = 0, end = text.length): number {
  let bytes = 0;
  for (let i = start; i < end; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < end) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * The UTF-16 offset of a 1-indexed code-point column in `line`.
 *
 * Spans count columns in code points; slicing a JavaScript string needs code
 * units. The two differ by one per astral character before the column.
 */
export function columnOffset(line: string, column: number): number {
  let offset = 0;
  for (let seen = 1; seen < column && offset < line.length; seen += 1) {
    const unit = line.charCodeAt(offset);
    offset += unit >= 0xd800 && unit <= 0xdbff && offset + 1 < line.length ? 2 : 1;
  }
  return offset;
}
