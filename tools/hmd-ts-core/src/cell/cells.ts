/**
 * HQL cells in a card (HMD-0026).
 *
 * A fence whose info string opens `hql#eval` or `hql#query` is a cell: code
 * the `hql` binary runs against the vault. An `hql#eval` cell has its last
 * output saved in the card between two HTML comment markers; an `hql#query`
 * cell is `hql#eval hidden` — it runs so that other cells can read its value,
 * and keeps no output. A bare `hql` fence is a listing — HQL shown as code,
 * never run.
 *
 * Everything here mirrors `hql render` (HQL-0009) closely enough that the two
 * agree on which fences are cells, in which order, and what each one's hash is.
 * That agreement is what lets a preview call an output current or stale
 * without running anything, and what lets the extension write one output back
 * without rewriting the rest of the card. The rules are HQL's, line-based and
 * deliberately not CommonMark's: an unindented line opening with three
 * backticks opens a fence, and the next such line closes it.
 *
 * Pure and synchronous, like the rest of the core: no process, no I/O.
 */

import { sha256 } from "../diagram/sha256.js";

/** Fence kinds that run. */
export const CELL_KINDS: ReadonlySet<string> = new Set(["hql#eval", "hql#query"]);
/** The cell kind that is always hidden: `hql#query` is `hql#eval hidden`. */
export const QUERY_KIND = "hql#query";
/** The fence kind that is shown as code and never runs. */
export const LISTING_KIND = "hql";

/** How the line that opens a saved output begins. */
export const OUTPUT_OPEN = "<!-- hql:output";
/** The line that closes it. */
export const OUTPUT_CLOSE = "<!-- /hql:output -->";

export type CellStatus = "ok" | "error" | "skipped";

/** A saved output, as a previous run left it in the card. */
export interface CellOutput {
  /** The `id=` the opening marker records, if any. */
  id: string | null;
  /** The `hash=` it records: the hash of the code the output came from. */
  hash: string | null;
  status: CellStatus | null;
  /** The Markdown between the markers. */
  body: string;
  /** 0-based line of the opening marker. */
  openLine: number;
  /** 0-based line of the closing marker, or the last line when it is missing. */
  closeLine: number;
}

export interface Cell {
  /** Position among the document's cells, from 0. */
  index: number;
  /** `hql#eval` or `hql#query`. */
  kind: string;
  /** The whole info string, as written. */
  info: string;
  id: string | null;
  hidden: boolean;
  /** The fence body. */
  source: string;
  /** 0-based line of the opening fence. */
  openLine: number;
  /** 0-based line of the closing fence, or the last line when it is unclosed. */
  closeLine: number;
  /** The output saved after this cell, or null. */
  output: CellOutput | null;
  /** Indices of the cells this one reads. */
  reads: number[];
  /** The cell's hash, as HQL computes it. */
  hash: string;
}

export interface CellScan {
  cells: Cell[];
  /** Outputs no cell owns — after a listing, or below a cell of another id. */
  orphans: CellOutput[];
}

/** One physical line: its text without the line ending, and where it starts. */
interface Line {
  text: string;
  start: number;
  /** Offset just past the line ending, or the end of the text. */
  end: number;
}

/**
 * The lines of a text, as Rust's `str::lines` sees them: a trailing newline
 * does not open an empty last line, and a `\r` before a newline is not part
 * of the line.
 */
function linesOf(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  while (start < text.length) {
    const nl = text.indexOf("\n", start);
    const end = nl === -1 ? text.length : nl + 1;
    let body = text.slice(start, nl === -1 ? text.length : nl);
    if (body.endsWith("\r")) body = body.slice(0, -1);
    lines.push({ text: body, start, end });
    start = end;
  }
  return lines;
}

/** The info string of a fence line, or null when the line is not one. */
function fenceInfo(line: string): string | null {
  const trimmed = line.replace(/\s+$/u, "");
  return trimmed.startsWith("```") ? trimmed.slice(3) : null;
}

/** The first word of an info string. */
export function cellKind(info: string): string {
  return info.trim().split(/\s+/u)[0] ?? "";
}

function isOutputOpen(line: string): boolean {
  return line.replace(/^\s+/u, "").startsWith(OUTPUT_OPEN);
}

function outputEnd(lines: readonly Line[], open: number): number {
  for (let i = open; i < lines.length; i += 1) {
    if (lines[i]!.text.trim() === OUTPUT_CLOSE) return i;
  }
  return lines.length - 1;
}

function markerWord(marker: string, key: string): string | null {
  for (const word of marker.split(/\s+/u)) {
    if (word.startsWith(`${key}=`)) return word.slice(key.length + 1);
  }
  return null;
}

function readOutput(lines: readonly Line[], open: number): CellOutput {
  const close = outputEnd(lines, open);
  const marker = lines[open]!.text;
  const status = markerWord(marker, "status");
  const closed = lines[close]!.text.trim() === OUTPUT_CLOSE;
  return {
    id: markerWord(marker, "id"),
    hash: markerWord(marker, "hash"),
    status: status === "ok" || status === "error" || status === "skipped" ? status : null,
    body: lines
      .slice(open + 1, closed ? close : close + 1)
      .map((l) => l.text)
      .join("\n"),
    openLine: open,
    closeLine: close,
  };
}

const IDENT_RE = /^[a-z_][a-z0-9_]*$/u;

function attributes(info: string): { id: string | null; hidden: boolean } {
  let id: string | null = null;
  let hidden = cellKind(info) === QUERY_KIND;
  for (const word of info.trim().split(/\s+/u).slice(1)) {
    if (word === "hidden") hidden = true;
    else if (word.startsWith("id=") && IDENT_RE.test(word.slice(3))) id = word.slice(3);
  }
  return { id, hidden };
}

/**
 * Every cell in a document, in document order, with its saved output, what it
 * reads, and its hash.
 */
export function scanCells(text: string): CellScan {
  const lines = linesOf(text);
  const cells: Cell[] = [];
  const orphans: CellOutput[] = [];

  let index = 0;
  while (index < lines.length) {
    if (isOutputOpen(lines[index]!.text)) {
      const output = readOutput(lines, index);
      orphans.push(output);
      index = output.closeLine + 1;
      continue;
    }
    const info = fenceInfo(lines[index]!.text);
    if (info === null) {
      index += 1;
      continue;
    }
    let close = index + 1;
    while (close < lines.length && fenceInfo(lines[close]!.text) === null) close += 1;
    const last = Math.min(close, lines.length - 1);
    const kind = cellKind(info);
    if (!CELL_KINDS.has(kind)) {
      index = close + 1;
      continue;
    }

    const { id, hidden } = attributes(info);
    const source = lines
      .slice(index + 1, Math.min(close, lines.length))
      .map((l) => l.text)
      .join("\n");
    const cell: Cell = {
      index: cells.length,
      kind,
      info,
      id,
      hidden,
      source,
      openLine: index,
      closeLine: last,
      output: null,
      reads: [],
      hash: "",
    };
    index = close + 1;

    // An output belongs to the cell above it when only blank lines stand
    // between them, and when it does not name another cell.
    let next = index;
    while (next < lines.length && lines[next]!.text.trim() === "") next += 1;
    if (next < lines.length && isOutputOpen(lines[next]!.text)) {
      const output = readOutput(lines, next);
      if (output.id !== null && output.id !== cell.id) orphans.push(output);
      else cell.output = output;
      index = output.closeLine + 1;
    }
    cells.push(cell);
  }

  const ids = new Map<string, number>();
  for (const cell of cells) if (cell.id !== null && !ids.has(cell.id)) ids.set(cell.id, cell.index);
  for (const cell of cells) cell.reads = cellReads(cell.source, ids, cell.index);
  const hashes = cellHashes(cells);
  cells.forEach((cell, i) => (cell.hash = hashes[i]!));
  return { cells, orphans };
}

/**
 * The document as HQL has to see it for this format's fence rules to hold.
 *
 * Two of them differ from `hql render`'s. A bare `hql` fence is a listing, so
 * its kind becomes `txt` and it is neither checked, nor evaluated, nor a name
 * other cells can read. An `hql#query` cell is hidden, so its fence gains the
 * `hidden` attribute and HQL keeps no output for it — which keeps a card the
 * editor wrote one that HQL would not change. Neither rewrite touches a cell's
 * source, so every hash is the one the card itself gives.
 */
export function maskForHql(text: string): string {
  let out = "";
  let inFence = false;
  for (const line of linesOf(text)) {
    const raw = text.slice(line.start, line.end);
    const info = fenceInfo(line.text);
    if (info === null) {
      out += raw;
      continue;
    }
    if (inFence) {
      inFence = false;
      out += raw;
      continue;
    }
    inFence = true;
    const kind = cellKind(info);
    if (kind === LISTING_KIND) {
      out += raw.replace(/^(```\s*)hql/u, "$1txt");
    } else if (kind === QUERY_KIND && !info.trim().split(/\s+/u).includes("hidden")) {
      const ending = raw.slice(line.text.length);
      out += `${line.text.replace(/\s+$/u, "")} hidden${ending}`;
    } else {
      out += raw;
    }
  }
  return out;
}

// -- what a cell reads ---------------------------------------------------

type Tok = "ident" | "dot" | "equals" | "newline" | "other";

interface Token {
  tok: Tok;
  text: string;
  /** Whether a `-` after this token is subtraction rather than a sign. */
  operand: boolean;
}

const KEYWORDS = new Set(["and", "or", "not", "match", "given", "otherwise"]);
const BOOLEANS = new Set(["true", "false"]);
const SIMPLE = new Set(["+", "*", "/", "%", "|", ",", ":", "(", "{", ">", "<", "?"]);
const CLOSERS = new Set([")", "]", "}"]);
const WHITESPACE_RE = /^\p{White_Space}$/u;
const ALPHA_RE = /^[\p{Alphabetic}_]$/u;
const WORD_RE = /^[\p{Alphabetic}\p{N}_]$/u;
const ALNUM_RE = /^[\p{Alphabetic}\p{N}]$/u;
const DIGIT_RE = /^[0-9]$/u;

/**
 * HQL's tokens, coarsely: names, dots, `=`, line ends, and everything else.
 * Null when the source does not lex, which is when HQL finds no reads either.
 */
function tokens(source: string): Token[] | null {
  const chars = Array.from(source);
  const out: Token[] = [];
  let i = 0;
  const at = (k: number): string => chars[k] ?? "";
  const push = (tok: Tok, text: string, operand: boolean): void => {
    out.push({ tok, text, operand });
  };

  for (;;) {
    // Trivia: `//` comments, and whitespace other than a line end.
    for (;;) {
      if (at(i) === "/" && at(i + 1) === "/") {
        while (i < chars.length && at(i) !== "\n") i += 1;
      } else if (i < chars.length && at(i) !== "\n" && WHITESPACE_RE.test(at(i))) {
        i += 1;
      } else {
        break;
      }
    }
    if (i >= chars.length) return out;
    const c = at(i);
    const two = c + at(i + 1);

    if (c === "\n") {
      push("newline", c, false);
      i += 1;
    } else if (["<=", ">=", "==", "!=", "=>", "->"].includes(two)) {
      push("other", two, false);
      i += 2;
    } else if (c === ".") {
      push("dot", c, false);
      i += 1;
    } else if (CLOSERS.has(c)) {
      push("other", c, true);
      i += 1;
    } else if (SIMPLE.has(c)) {
      push("other", c, false);
      i += 1;
    } else if (c === "=") {
      push("equals", c, false);
      i += 1;
    } else if (two === "[[") {
      let end = i + 2;
      while (end < chars.length && !(at(end) === "]" && at(end + 1) === "]")) end += 1;
      if (end >= chars.length || chars.slice(i + 2, end).join("").trim() === "") return null;
      push("other", "[[]]", true);
      i = end + 2;
    } else if (c === "[") {
      push("other", c, false);
      i += 1;
    } else if (c === '"') {
      i += 1;
      for (;;) {
        const s = at(i);
        if (s === "" || s === "\n") return null;
        i += 1;
        if (s === '"') break;
        if (s === "\\") {
          if (!["n", "t", "\\", '"'].includes(at(i))) return null;
          i += 1;
        }
      }
      push("other", '"', true);
    } else if (
      DIGIT_RE.test(c) ||
      (c === "-" && out[out.length - 1]?.operand !== true && DIGIT_RE.test(at(i + 1)))
    ) {
      if (c === "-") i += 1;
      while (DIGIT_RE.test(at(i))) i += 1;
      if (at(i) === "." && DIGIT_RE.test(at(i + 1))) {
        i += 1;
        while (DIGIT_RE.test(at(i))) i += 1;
      }
      // A trailing point, or an exponent, is not part of the literal grammar.
      if (at(i) === "." || ALNUM_RE.test(at(i))) return null;
      push("other", "0", true);
    } else if (c === "-") {
      push("other", c, false);
      i += 1;
    } else if (ALPHA_RE.test(c)) {
      let word = "";
      while (i < chars.length && WORD_RE.test(at(i))) {
        word += at(i);
        i += 1;
      }
      if (KEYWORDS.has(word)) push("other", word, false);
      else if (BOOLEANS.has(word)) push("other", word, true);
      else push("ident", word, true);
    } else {
      return null;
    }
  }
}

/**
 * The other cells a cell reads: every name it uses that is another cell's id,
 * and that it does not bind itself at the start of a line. Lexical, as HQL's
 * own rule is, so the two agree on the hash.
 */
export function cellReads(source: string, ids: ReadonlyMap<string, number>, own: number): number[] {
  const toks = tokens(source);
  if (toks === null) return [];
  const bound = new Set<string>();
  const used = new Set<string>();
  toks.forEach((t, at) => {
    if (t.tok !== "ident") return;
    const before = toks[at - 1];
    const after = toks[at + 1];
    if (before?.tok === "dot") return;
    if (after?.tok === "equals") {
      if (before === undefined || before.tok === "newline") bound.add(t.text);
      return;
    }
    used.add(t.text);
  });
  const reads: number[] = [];
  for (const name of [...used].sort()) {
    if (bound.has(name)) continue;
    const index = ids.get(name);
    if (index !== undefined && index !== own) reads.push(index);
  }
  return reads.sort((a, b) => a - b);
}

// -- hashes --------------------------------------------------------------

/** Trailing whitespace off each line, trailing blank lines off the end. */
export function normalizedSource(source: string): string {
  const lines = source.split("\n").map((l) => l.replace(/\s+$/u, ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

/**
 * Each cell's hash: its code and the hashes of the cells it reads, so that
 * editing a cell makes every output downstream of it stale.
 *
 * ```text
 * hash = hex(sha256("hql-cell\0" || normalized(source) || "\0" ||
 *            join("\0", sorted(id "=" hash(dep) for dep in reads))))[0..12]
 * ```
 */
function cellHashes(cells: readonly Cell[]): string[] {
  const known: Array<string | null> = cells.map(() => null);
  const hash = (index: number, depth: number): string => {
    const cached = known[index];
    if (cached !== null && cached !== undefined) return cached;
    const cell = cells[index]!;
    // A cycle is HQL's to report; its hash stops at the source.
    const reads =
      depth > cells.length
        ? []
        : cell.reads
            .map((read) => {
              const id = cells[read]!.id;
              return id === null ? null : `${id}=${hash(read, depth + 1)}`;
            })
            .filter((r): r is string => r !== null);
    reads.sort();
    const short = sha256(`hql-cell\0${normalizedSource(cell.source)}\0${reads.join("\0")}`).slice(0, 12);
    known[index] = short;
    return short;
  };
  return cells.map((_, index) => hash(index, 0));
}

/** True when the cell has an output and it came from the code as it stands. */
export function isCurrent(cell: Cell): boolean {
  return cell.output !== null && cell.output.hash === cell.hash;
}

// -- writing an output back ----------------------------------------------

export interface CellResult {
  status: CellStatus;
  hash: string;
  markdown: string;
}

export interface TextEdit {
  /** UTF-16 offsets into the text the cells were scanned from. */
  start: number;
  end: number;
  text: string;
}

/** The output block for one result, exactly as `hql render --emit after` writes it. */
export function outputBlock(cell: Cell, result: CellResult): string {
  const id = cell.id === null ? "" : ` id=${cell.id}`;
  const body = result.markdown === "" ? [] : result.markdown.split("\n").map((l) => l.replace(/\r$/u, ""));
  return [`${OUTPUT_OPEN}${id} hash=${result.hash} status=${result.status} -->`, ...body, OUTPUT_CLOSE].join("\n");
}

/**
 * The edit that writes one cell's result into the document, replacing any
 * output saved after it.
 *
 * The output goes on the line after the closing fence, with nothing between —
 * the layout `hql render` itself writes — so rendering the document with HQL
 * afterwards changes nothing. A hidden cell that ran keeps no output, which is
 * also what HQL does.
 */
export function outputEdit(text: string, cell: Cell, result: CellResult): TextEdit {
  const lines = linesOf(text);
  const fenceEnd = lines[cell.closeLine]!.end;
  const end = cell.output === null ? fenceEnd : lines[cell.output.closeLine]!.end;
  if (cell.hidden && result.status === "ok") return { start: fenceEnd, end, text: "" };

  // A closing fence on an unterminated last line has no newline to write after.
  const lead = text.slice(0, fenceEnd).endsWith("\n") ? "" : "\n";
  const trail =
    cell.output === null
      ? fenceEnd < text.length || text.endsWith("\n")
        ? "\n"
        : ""
      : text.slice(fenceEnd, end).endsWith("\n")
        ? "\n"
        : "";
  return { start: fenceEnd, end, text: `${lead}${outputBlock(cell, result)}${trail}` };
}
