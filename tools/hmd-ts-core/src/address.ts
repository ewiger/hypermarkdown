/**
 * In-card addresses (HMD-0006) — a port of
 * `tools/hmd/src/hypermarkdown/address.py`, message for message.
 *
 * An address is parsed without the card it points into: every rule about which
 * step may follow which is static, so a malformed address is reported where it
 * is written (HMD019). Resolution then walks the steps against the resolved
 * card, each inside the scope the one before it selected, and ends on a span
 * of the card's source. Spans here are UTF-16 offsets, as everywhere else in
 * this package; the corpus compares UTF-8 byte offsets.
 */

import * as B from "./blocks.js";
import { sha256 } from "./diagram/sha256.js";
import { splitFrontmatter } from "./frontmatter.js";
import type { ParsedDocument } from "./model.js";
import { slugify } from "./slug.js";

export type StepKind = "heading" | "anchor" | "counted";

export type Unit = B.BlockKind | "Block" | "Sentence" | "Word" | "Line";

/** Long unit -> short letter, or null for a unit spelled out only. */
export const LONG_UNITS: Readonly<Record<Unit, string | null>> = {
  Para: "p",
  Table: "t",
  List: null,
  Code: "c",
  Blockquote: null,
  Callout: null,
  Math: "m",
  Diagram: "d",
  Embed: "e",
  Html: null,
  Block: "b",
  Sentence: "s",
  Word: "w",
  Line: "l",
};

export const SHORT_UNITS: Readonly<Record<string, Unit>> = Object.fromEntries(
  Object.entries(LONG_UNITS)
    .filter(([, short]) => short !== null)
    .map(([long, short]) => [short!, long as Unit]),
);

const TEXT_OR_LINE: ReadonlySet<string> = new Set(["Sentence", "Word", "Line"]);

function isBlockUnit(unit: string): boolean {
  return unit in LONG_UNITS && !TEXT_OR_LINE.has(unit);
}

/** Ordinals above this are refused before anything is counted. */
export const MAX_ORDINAL = 1_000_000;
/** Steps above this are refused. */
export const MAX_STEPS = 32;

const INTEGRITY_RE = /@sha256-([^/]*)$/;
const DIGEST_RE = /^[0-9a-f]{16}$/;
const BLOCK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const COUNTED_RE = /^([A-Za-z]+)([0-9]+)(?:-([A-Za-z]+)([0-9]+))?$/;
/** A heading whose slug has this shape is shadowed by a short-form step. */
export const SHADOW_RE = new RegExp(
  `^[${Object.keys(SHORT_UNITS).sort().join("")}][0-9]+(?:-[a-z]+[0-9]+)?$`,
);

export interface Step {
  kind: StepKind;
  /** As written. */
  text: string;
  /** heading: the heading text. anchor: the block id. counted: the long unit. */
  value: string;
  first: number;
  last: number;
  isRange: boolean;
}

export interface Address {
  raw: string;
  steps: readonly Step[];
  digest: string | null;
}

/** A malformed address (HMD019). */
export class AddressSyntaxError extends Error {}

/** Python's `repr` of a string, for messages that must match byte for byte. */
function repr(value: string): string {
  const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return quote === "'" ? `'${escaped.replace(/'/g, "\\'")}'` : `"${escaped}"`;
}

function unitOf(word: string): [Unit, "long" | "short"] | null {
  if (Object.prototype.hasOwnProperty.call(LONG_UNITS, word)) return [word as Unit, "long"];
  if (Object.prototype.hasOwnProperty.call(SHORT_UNITS, word)) return [SHORT_UNITS[word]!, "short"];
  return null;
}

function counted(text: string): Step | null {
  const m = COUNTED_RE.exec(text);
  if (!m) return null;
  const firstUnit = unitOf(m[1]!);
  const secondUnit = m[3] !== undefined ? unitOf(m[3]) : null;
  if (firstUnit === null && secondUnit === null) return null;
  if (m[3] !== undefined) {
    if (firstUnit === null || secondUnit === null || firstUnit[0] !== secondUnit[0]) {
      throw new AddressSyntaxError(`a range must use one unit on both ends, not ${repr(text)}`);
    }
    if (firstUnit[1] !== secondUnit[1]) {
      throw new AddressSyntaxError(`a range must spell both ends the same way, not ${repr(text)}`);
    }
  }
  const numbers = [m[2]!, ...(m[4] !== undefined ? [m[4]] : [])];
  for (const number of numbers) {
    if (/^0+$/.test(number)) {
      throw new AddressSyntaxError(`ordinals count from 1, so ${repr(text)} names nothing`);
    }
    if (number.startsWith("0")) {
      throw new AddressSyntaxError(`an ordinal has no leading zeros: ${repr(text)}`);
    }
    if (number.length > 7 || Number.parseInt(number, 10) > MAX_ORDINAL) {
      throw new AddressSyntaxError(`ordinal ${number} is above the limit of ${MAX_ORDINAL}`);
    }
  }
  const first = Number.parseInt(numbers[0]!, 10);
  const last = Number.parseInt(numbers[numbers.length - 1]!, 10);
  if (last < first) throw new AddressSyntaxError(`range ${repr(text)} ends before it starts`);
  return { kind: "counted", text, value: firstUnit![0], first, last, isRange: m[3] !== undefined };
}

/**
 * Whether a fragment is more than the one-step heading or block form. One-step
 * fragments keep the kinds and the HMD010 checks they always had.
 */
export function isMultiStep(fragment: string): boolean {
  if (fragment.includes("/") || INTEGRITY_RE.test(fragment)) return true;
  try {
    return counted(fragment) !== null;
  } catch (exc) {
    if (exc instanceof AddressSyntaxError) return true;
    throw exc;
  }
}

function blankStep(part: string): boolean {
  return part.replace(/^[ \t]+|[ \t]+$/g, "") === "";
}

/** Parse the text after `#`, throwing AddressSyntaxError (HMD019). */
export function parseAddress(fragment: string): Address {
  let body = fragment;
  let digest: string | null = null;
  const m = INTEGRITY_RE.exec(body);
  if (m) {
    digest = m[1]!;
    if (!DIGEST_RE.test(digest)) {
      throw new AddressSyntaxError(
        "an integrity digest is '@sha256-' and sixteen lowercase hex digits",
      );
    }
    body = body.slice(0, m.index);
  }

  const parts = body.split("/");
  if (parts.length > MAX_STEPS) {
    throw new AddressSyntaxError(`an address has at most ${MAX_STEPS} steps`);
  }

  const steps: Step[] = [];
  for (const part of parts) {
    if (blankStep(part)) {
      throw new AddressSyntaxError(parts.length > 1 ? "an address has an empty step" : "empty fragment");
    }
    if (part.startsWith("^")) {
      const blockId = part.slice(1);
      if (!BLOCK_ID_RE.test(blockId)) throw new AddressSyntaxError(`invalid block id ${repr(blockId)}`);
      steps.push({ kind: "anchor", text: part, value: blockId, first: 0, last: 0, isRange: false });
      continue;
    }
    const step = counted(part);
    if (step !== null) {
      steps.push(step);
      continue;
    }
    steps.push({ kind: "heading", text: part, value: part, first: 0, last: 0, isRange: false });
  }

  checkPlacement(steps);
  return { raw: fragment, steps, digest };
}

function selectsBlock(step: Step): boolean {
  return step.kind === "anchor" || (step.kind === "counted" && isBlockUnit(step.value));
}

function checkPlacement(steps: readonly Step[]): void {
  let previous: Step | null = null;
  steps.forEach((step, index) => {
    const last = index === steps.length - 1;
    if (step.isRange && !last) {
      throw new AddressSyntaxError(
        `a range selects content, so ${repr(step.text)} must be the last step`,
      );
    }
    const after = previous === null ? "" : ` cannot follow ${repr(previous.text)}`;
    if (step.kind === "heading" || step.kind === "anchor") {
      if (previous !== null && previous.kind !== "heading") {
        throw new AddressSyntaxError(
          `${repr(step.text)}${after}: a named step follows only a heading`,
        );
      }
    } else if (isBlockUnit(step.value)) {
      if (previous !== null && previous.kind !== "heading") {
        throw new AddressSyntaxError(
          `${repr(step.text)}${after}: blocks are counted in a card or a section`,
        );
      }
    } else if (step.value === "Line") {
      if (previous !== null && !selectsBlock(previous)) {
        throw new AddressSyntaxError(
          `${repr(step.text)}${after}: lines are counted in the card or in one block`,
        );
      }
      if (!last) {
        throw new AddressSyntaxError(`a line step must be the last step, not ${repr(step.text)}`);
      }
    } else if (step.value === "Sentence") {
      if (previous === null || !selectsBlock(previous)) {
        throw new AddressSyntaxError(
          `${repr(step.text)} must follow a block: sentences are counted in one block`,
        );
      }
    } else if (step.value === "Word") {
      if (previous === null || !(selectsBlock(previous) || previous.value === "Sentence")) {
        throw new AddressSyntaxError(
          `${repr(step.text)} must follow a block or a sentence: words are counted in one of those`,
        );
      }
    }
    previous = step;
  });
}

// -- resolution ------------------------------------------------------------

export interface Resolution {
  start: number;
  end: number;
  /** [rule, message] when the address selects nothing — HMD004, HMD005, HMD020. */
  failure: readonly [string, string] | null;
  /** [rule, message] that do not stop resolution — HMD021, HMD023. */
  warnings: Array<readonly [string, string]>;
  /** The assigned slug of the deepest heading the address passed through. */
  headingSlug: string | null;
}

/** SHA-256 of the text as UTF-8, first sixteen hex digits. */
export function digestOf(text: string): string {
  return sha256(text).slice(0, 16);
}

interface Scope {
  kind: "card" | "section" | "block" | "sentence";
  start: number;
  end: number;
  label: string;
  headingIndex: number | null;
  block: B.Block | null;
  words: B.Range[] | null;
}

function scope(kind: Scope["kind"], start: number, end: number, label: string, extra: Partial<Scope> = {}): Scope {
  return { kind, start, end, label, headingIndex: null, block: null, words: null, ...extra };
}

export function bodyOffset(document: ParsedDocument): number {
  const { raw, bodyOffset: offset } = splitFrontmatter(document.text);
  if (document.kind === "markdown" && raw !== null && Object.keys(document.frontmatter).length === 0) {
    return 0;
  }
  return offset;
}

const PLURAL: Readonly<Record<Unit, string>> = {
  Para: "paragraphs",
  Table: "tables",
  List: "lists",
  Code: "code blocks",
  Blockquote: "blockquotes",
  Callout: "callouts",
  Math: "math blocks",
  Diagram: "diagrams",
  Embed: "embeds",
  Html: "HTML blocks",
  Block: "blocks",
  Sentence: "sentences",
  Word: "words",
  Line: "lines",
};

export function plural(unit: string): string {
  return PLURAL[unit as Unit];
}

function article(kind: string): string {
  const known: Record<string, string> = {
    Table: "a table",
    Code: "a code block",
    Math: "a math block",
    Diagram: "a diagram",
    Embed: "an embed",
    Html: "an HTML block",
  };
  return known[kind] ?? `a ${kind.toLowerCase()}`;
}

function pick<T>(units: readonly T[], step: Step, label: string, noun: string): [T, T] | string {
  const count = units.length;
  if (step.last > count) {
    const have =
      count === 0 ? `no ${noun}` : count === 1 ? `1 ${noun.slice(0, -1)}` : `${count} ${noun}`;
    return `${label} has ${have}; ${step.text} is past the end`;
  }
  return [units[step.first - 1]!, units[step.last - 1]!];
}

export function resolveAddress(
  document: ParsedDocument,
  address: Address,
  cardName = "the card",
): Resolution {
  const text = document.text;
  const offset = bodyOffset(document);
  let current = scope("card", offset, text.length, cardName);
  const result: Resolution = { start: 0, end: 0, failure: null, warnings: [], headingSlug: null };
  const fail = (rule: string, message: string): Resolution => {
    result.failure = [rule, message];
    return result;
  };

  let finished = false;
  for (let index = 0; index < address.steps.length && !finished; index += 1) {
    const step = address.steps[index]!;

    if (step.kind === "heading") {
      const found = findHeading(document, step.value, current, index === 0);
      if (found === null) {
        const where = index > 0 ? ` in ${current.label}` : "";
        return fail("HMD004", `${cardName} has no heading '#${slugify(step.value)}'${where}`);
      }
      const [headingIndex, start, end] = found;
      const slug = document.headings[headingIndex]!.slug;
      result.headingSlug = slug;
      current = scope("section", start, end, `'#${slug}'`, { headingIndex });
      continue;
    }

    if (step.kind === "anchor") {
      const region = anchorRegion(document, step.value, offset);
      if (region === null) return fail("HMD005", `${cardName} has no block '^${step.value}'`);
      if (current.kind === "section" && !(current.start <= region[0] && region[0] < current.end)) {
        result.warnings.push([
          "HMD021",
          `block '^${step.value}' is not in ${current.label}; the address was written ` +
            `against an earlier version of ${cardName}`,
        ]);
      }
      const segmented = B.segment(text, region[0], region[1], offset);
      let block: B.Block = {
        kind: "Para",
        start: region[0],
        end: region[1],
        bodyStart: region[0],
        bodyEnd: region[1],
      };
      if (segmented.length === 1) {
        const one = segmented[0]!;
        block = {
          kind: one.kind,
          start: one.start,
          end: Math.min(one.end, region[1]),
          bodyStart: one.bodyStart,
          bodyEnd: Math.min(one.bodyEnd, region[1]),
        };
      }
      current = scope("block", region[0], region[1], `'^${step.value}'`, { block });
      continue;
    }

    const unit = step.value;
    if (isBlockUnit(unit)) {
      const candidates = B.segment(text, current.start, current.end, offset).filter(
        (b) => unit === "Block" || b.kind === unit,
      );
      const picked = pick(candidates, step, current.label, plural(unit));
      if (typeof picked === "string") return fail("HMD020", picked);
      const [first, last] = picked;
      if (step.isRange) {
        result.start = first.start;
        result.end = last.end;
        finished = true;
        break;
      }
      const block = stripAnchor(document, first);
      current = scope("block", block.start, block.end, `${step.text} of ${current.label}`, { block });
      continue;
    }

    if (unit === "Line") {
      let units: B.Range[];
      let label: string;
      if (current.kind === "card") {
        units = B.lines(text, 0, text.length);
        label = cardName;
      } else {
        const block = current.block!;
        units = block.bodyEnd > block.bodyStart ? B.lines(text, block.bodyStart, block.bodyEnd) : [];
        label = current.label;
      }
      const picked = pick(units, step, label, "lines");
      if (typeof picked === "string") return fail("HMD020", picked);
      result.start = picked[0].start;
      result.end = picked[1].end;
      finished = true;
      break;
    }

    // Sentence or Word.
    let words: B.Range[];
    if (current.kind === "block") {
      const block = current.block!;
      if (!B.PROSE.has(block.kind)) {
        return fail(
          "HMD020",
          `${current.label} is ${article(block.kind)}, which has no ${plural(unit)}; address its lines`,
        );
      }
      const skip = document.anchors.map((a) => ({ start: a.span.start, end: a.span.end }));
      words = B.words(text, block, skip);
    } else {
      words = current.words ?? [];
    }

    if (unit === "Sentence") {
      const groups = B.sentences(text, words);
      const picked = pick(groups, step, current.label, "sentences");
      if (typeof picked === "string") return fail("HMD020", picked);
      const [first, last] = picked;
      if (step.isRange) {
        result.start = first[0]!.start;
        result.end = last[last.length - 1]!.end;
        finished = true;
        break;
      }
      current = scope("sentence", first[0]!.start, first[first.length - 1]!.end, `${step.text} of ${current.label}`, {
        words: first,
      });
      continue;
    }

    const picked = pick(words, step, current.label, "words");
    if (typeof picked === "string") return fail("HMD020", picked);
    result.start = picked[0].start;
    result.end = picked[1].end;
    finished = true;
  }

  if (!finished) {
    result.start = current.start;
    result.end = current.end;
  }

  if (address.digest !== null) {
    const actual = digestOf(text.slice(result.start, result.end));
    if (actual !== address.digest) {
      result.warnings.push([
        "HMD023",
        `the quoted text has changed: it now hashes to sha256-${actual}, ` +
          `not sha256-${address.digest}`,
      ]);
    }
  }
  return result;
}

/**
 * [index, start, end] of the heading a heading step names, inside `within`.
 * The first step matches an assigned slug; a later one matches the unsuffixed
 * slug of the first heading inside the enclosing section.
 */
function findHeading(
  document: ParsedDocument,
  text: string,
  within: Scope,
  first: boolean,
): [number, number, number] | null {
  const wanted = slugify(text);
  const headings = document.headings;
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]!;
    if (first) {
      if (heading.slug !== wanted) continue;
    } else {
      if (within.headingIndex !== null && index <= within.headingIndex) continue;
      if (!(within.start <= heading.span.start && heading.span.start < within.end)) continue;
      if (slugify(heading.text) !== wanted) continue;
    }
    let end = document.text.length;
    for (const following of headings.slice(index + 1)) {
      if (following.level <= heading.level) {
        end = following.span.start;
        break;
      }
    }
    if (!first) end = Math.min(end, within.end);
    return [index, heading.span.start, end];
  }
  return null;
}

/** The anchored block: back from the anchored line to the nearest blank line. */
export function anchorRegion(
  document: ParsedDocument,
  blockId: string,
  floor: number,
): [number, number] | null {
  const text = document.text;
  for (const anchor of document.anchors) {
    if (anchor.blockId !== blockId) continue;
    let start = text.lastIndexOf("\n", anchor.span.start - 1) + 1;
    while (start > floor) {
      const previousEnd = start - 1;
      const previousStart = text.lastIndexOf("\n", previousEnd - 1) + 1;
      if (
        previousStart < floor ||
        text.slice(previousStart, previousEnd).replace(/^[ \t\r]+|[ \t\r]+$/g, "") === ""
      ) {
        break;
      }
      start = previousStart;
    }
    return [start, anchor.span.start];
  }
  return null;
}

function stripAnchor(document: ParsedDocument, block: B.Block): B.Block {
  for (const anchor of document.anchors) {
    if (block.start <= anchor.span.start && anchor.span.start < block.end && anchor.span.end >= block.end) {
      const end = anchor.span.start;
      return { ...block, end, bodyEnd: Math.min(block.bodyEnd, end) };
    }
  }
  return block;
}

/** Headings whose slug a short-form step would read as a unit (HMD022). */
export function shadowedHeadings(document: ParsedDocument): ParsedDocument["headings"] {
  return document.headings.filter((h) => SHADOW_RE.test(h.slug));
}

/** UTF-8 byte offset of a UTF-16 offset into `text`. */
export function utf8Offset(text: string, offset: number): number {
  let bytes = 0;
  for (let i = 0; i < offset; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < offset) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

// -- editors ---------------------------------------------------------------

/** Where a fragment lands in a card: a span, and whether it is exact. */
export interface Location {
  start: number;
  end: number;
  /**
   * True when the address names a passage — a count, a sentence, a word, a
   * line. False for a heading or a block, where an editor moves the cursor to
   * the start rather than selecting a whole section.
   */
  passage: boolean;
}

/**
 * Locate a fragment as written after `#` — `Setup`, `^limit`,
 * `^limit/Sentence2` — in `document`, or null when it lands nowhere.
 */
export function locateFragment(document: ParsedDocument, fragment: string): Location | null {
  let address: Address;
  try {
    address = parseAddress(fragment);
  } catch (exc) {
    if (exc instanceof AddressSyntaxError) return null;
    throw exc;
  }
  const result = resolveAddress(document, address);
  if (result.failure !== null) return null;
  const passage = address.steps.some((s) => s.kind === "counted");
  return { start: result.start, end: result.end, passage };
}

/** The fragment of a link as its author wrote it, `^` included; null for none. */
export function writtenFragment(link: { fragment: string | null; fragmentKind: string | null }): string | null {
  if (link.fragment === null) return null;
  return link.fragmentKind === "block" ? `^${link.fragment}` : link.fragment;
}

/**
 * Mint the address of [start, end) in `document`, in the long form and rooted
 * as high as the target allows: an anchor over its heading, a heading over a
 * count from the top of the card (HMD-0006, the root decides lifespan). It then
 * descends only as deep as the selection needs. An empty selection names the
 * block the cursor is in. Null when the selection is in no block at all.
 */
export function mintAddress(document: ParsedDocument, start: number, end: number): string | null {
  for (const useAnchor of [true, false]) {
    const minted = mint(document, start, end, useAnchor);
    if (minted === null) return null;
    // Never hand out an address that does not land where it was minted.
    const landed = locateFragment(document, minted);
    if (landed !== null && landed.start <= start && (start === end || landed.end >= end)) return minted;
  }
  return null;
}

function mint(document: ParsedDocument, start: number, end: number, useAnchor: boolean): string | null {
  const text = document.text;
  const offset = bodyOffset(document);
  const stop = Math.max(end, start + 1);
  const blocks = B.segment(text, offset, text.length, offset);
  const inside = blocks.filter((b) => b.start < stop && b.end > start);
  if (inside.length === 0) {
    // On a heading line, the heading is the address.
    const heading = document.headings.find((h) => h.span.start <= start && start <= h.span.end);
    return heading?.slug ?? null;
  }
  const first = inside[0]!;
  const last = inside[inside.length - 1]!;

  // The deepest section holding the whole selection.
  let root: { slug: string; start: number; end: number } | null = null;
  const headings = document.headings;
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]!;
    let sectionEnd = text.length;
    for (const following of headings.slice(index + 1)) {
      if (following.level <= heading.level) {
        sectionEnd = following.span.start;
        break;
      }
    }
    if (heading.span.start <= first.start && last.end <= sectionEnd) {
      root = { slug: heading.slug, start: heading.span.start, end: sectionEnd };
    }
  }
  const scopeStart = root?.start ?? offset;
  const scopeEnd = root?.end ?? text.length;
  const steps: string[] = root === null ? [] : [root.slug];
  const ordinal = (block: B.Block, kind: string): number =>
    B.segment(text, scopeStart, scopeEnd, offset)
      .filter((b) => kind === "Block" || b.kind === kind)
      .findIndex((b) => b.start === block.start) + 1;

  if (inside.length > 1) {
    const kind = inside.every((b) => b.kind === first.kind) ? first.kind : "Block";
    steps.push(`${kind}${ordinal(first, kind)}-${kind}${ordinal(last, kind)}`);
    return steps.join("/");
  }

  // One block: root it on its anchor when it has one.
  const anchor = useAnchor
    ? document.anchors.find((a) => first.start <= a.span.start && a.span.start < first.end)
    : undefined;
  let block = stripAnchor(document, first);
  if (anchor !== undefined) {
    steps.length = 0;
    steps.push(`^${anchor.blockId}`);
  } else {
    steps.push(`${block.kind}${ordinal(first, block.kind)}`);
  }

  const whole = start <= block.start && end >= block.end;
  if (start === end || whole) return steps.join("/");

  if (B.PROSE.has(block.kind)) {
    if (anchor !== undefined) {
      const region = anchorRegion(document, anchor.blockId, offset)!;
      block = { ...block, start: region[0], end: region[1] };
    }
    const skip = document.anchors.map((a) => ({ start: a.span.start, end: a.span.end }));
    const words = B.words(text, block, skip);
    const chosen = words.map((w, i) => [w, i] as const).filter(([w]) => w.start < end && w.end > start);
    if (chosen.length === 0) return steps.join("/");
    const groups = B.sentences(text, words);
    const sentenceOf = (wordIndex: number): number => {
      let seen = 0;
      for (let s = 0; s < groups.length; s += 1) {
        seen += groups[s]!.length;
        if (wordIndex < seen) return s;
      }
      return groups.length - 1;
    };
    const a = chosen[0]![1];
    const z = chosen[chosen.length - 1]![1];
    const sa = sentenceOf(a);
    const sz = sentenceOf(z);
    if (sa !== sz) {
      steps.push(a === z ? `Word${a + 1}` : `Word${a + 1}-Word${z + 1}`);
      return steps.join("/");
    }
    steps.push(`Sentence${sa + 1}`);
    const before = groups.slice(0, sa).reduce((n, g) => n + g.length, 0);
    const size = groups[sa]!.length;
    const wa = a - before + 1;
    const wz = z - before + 1;
    if (wa === 1 && wz === size) return steps.join("/");
    steps.push(wa === wz ? `Word${wa}` : `Word${wa}-Word${wz}`);
    return steps.join("/");
  }

  const lines = block.bodyEnd > block.bodyStart ? B.lines(text, block.bodyStart, block.bodyEnd) : [];
  const chosen = lines.map((l, i) => [l, i] as const).filter(([l]) => l.start <= end && l.end >= start);
  if (chosen.length === 0) return steps.join("/");
  const la = chosen[0]![1] + 1;
  const lz = chosen[chosen.length - 1]![1] + 1;
  steps.push(la === lz ? `Line${la}` : `Line${la}-Line${lz}`);
  return steps.join("/");
}
