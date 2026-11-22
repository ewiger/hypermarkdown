/**
 * Addresses in the editor (HMD-0006): what a link points at, what it quotes,
 * what to offer after `#` and `/`, and how to anchor a block.
 *
 * Pure, with no `vscode` import, so the parts that decide are tested without
 * an editor; `links.ts` adapts them to the editor's providers. Every offset is
 * a UTF-16 code unit, which is what both the core and the editor count.
 */

import {
  bodyOffset,
  locateFragment,
  parseAddress,
  resolveAddress,
  segment,
  slugify,
  writtenFragment,
  type Link,
  type ParsedDocument,
} from "@hypermarkdown/core";

/** Looks a card up by its root-relative path. */
export type Lookup = (path: string) => ParsedDocument | undefined;
/** Resolves a page reference written in the source card to a path, or null. */
export type Resolver = (pageRef: string) => string | null;

/** The link whose source span holds `offset`, if any. */
export function linkAt(document: ParsedDocument, offset: number): Link | null {
  return document.links.find((l) => l.span.start <= offset && offset <= l.span.end) ?? null;
}

export interface Target {
  path: string;
  start: number;
  end: number;
  /** Select [start, end) rather than only moving the cursor to `start`. */
  passage: boolean;
  /** False when a fragment was written and lands nowhere: the card's top instead. */
  found: boolean;
}

/** Where a link lands: its card, and the span its fragment names there. */
export function targetOf(link: Link, resolve: Resolver, lookup: Lookup): Target | null {
  const path = resolve(link.pageRef);
  if (path === null) return null;
  const document = lookup(path);
  const fragment = writtenFragment(link);
  if (document === undefined || fragment === null) {
    return { path, start: 0, end: 0, passage: false, found: fragment === null };
  }
  const at = locateFragment(document, fragment);
  if (at === null) return { path, start: 0, end: 0, passage: false, found: false };
  return { path, start: at.start, end: at.end, passage: at.passage, found: true };
}

/** The text an address link quotes, or null for a link that is not a quotation. */
export function quoteOf(link: Link, resolve: Resolver, lookup: Lookup): string | null {
  if (link.fragmentKind !== "address") return null;
  const target = targetOf(link, resolve, lookup);
  if (target === null || !target.found) return null;
  const document = lookup(target.path);
  return document === undefined ? null : document.text.slice(target.start, target.end);
}

// -- completion ------------------------------------------------------------

export interface Suggestion {
  label: string;
  detail: string;
  kind: "heading" | "anchor" | "unit";
}

const OPEN_RE = /!?\[\[([^[\]|\n]*)$/;

/**
 * What a link being typed has so far, when the cursor is after its `#`:
 * the page reference, the completed steps, and the step being typed.
 */
export function fragmentInProgress(
  before: string,
): { pageRef: string; done: string; partial: string } | null {
  const m = OPEN_RE.exec(before);
  if (!m) return null;
  const inner = m[1]!;
  const hash = inner.indexOf("#");
  if (hash === -1) return null;
  const fragment = inner.slice(hash + 1);
  const cut = fragment.lastIndexOf("/");
  return {
    pageRef: inner.slice(0, hash).trim(),
    done: cut === -1 ? "" : fragment.slice(0, cut),
    partial: cut === -1 ? fragment : fragment.slice(cut + 1),
  };
}

const PROSE = new Set(["Para", "List", "Blockquote", "Callout"]);

/** The steps that may come next, given the target card and the steps so far. */
export function suggest(document: ParsedDocument, done: string): Suggestion[] {
  const text = document.text;
  let start = 0;
  let end = text.length;
  let after: "card" | "section" | "prose" | "literal" | "sentence" = "card";
  let sectionIndex: number | null = null;

  if (done !== "") {
    let address;
    try {
      address = parseAddress(done);
    } catch {
      return [];
    }
    const result = resolveAddress(document, address);
    if (result.failure !== null) return [];
    start = result.start;
    end = result.end;
    const last = address.steps[address.steps.length - 1]!;
    if (last.kind === "heading") {
      after = "section";
      sectionIndex = document.headings.findIndex((h) => h.span.start === start);
    } else if (last.isRange || last.value === "Line" || last.value === "Word") {
      return [];
    } else if (last.value === "Sentence") {
      after = "sentence";
    } else {
      const blocks = segment(text, start, end, bodyOffset(document));
      const kind = last.kind === "anchor" ? (blocks.length === 1 ? blocks[0]!.kind : "Para") : last.value;
      after = PROSE.has(kind) ? "prose" : "literal";
    }
  }

  const out: Suggestion[] = [];
  if (after === "card" || after === "section") {
    for (const [index, heading] of document.headings.entries()) {
      if (after === "section" && (index <= (sectionIndex ?? -1) || heading.span.start >= end)) continue;
      const slug = after === "card" ? heading.slug : slugify(heading.text);
      out.push({ label: slug, detail: heading.text, kind: "heading" });
    }
    for (const anchor of document.anchors) {
      if (anchor.span.start < start || anchor.span.start >= end) continue;
      out.push({ label: `^${anchor.blockId}`, detail: "block anchor", kind: "anchor" });
    }
    const counts = new Map<string, number>();
    const from = after === "card" ? bodyOffset(document) : start;
    for (const block of segment(text, from, end, bodyOffset(document))) counts.set(block.kind, (counts.get(block.kind) ?? 0) + 1);
    let total = 0;
    for (const [kind, count] of counts) {
      total += count;
      out.push({ label: `${kind}1`, detail: count === 1 ? `1 here` : `${count} here, ${kind}1 to ${kind}${count}`, kind: "unit" });
    }
    if (total > 0) out.push({ label: "Block1", detail: `${total} blocks of any kind`, kind: "unit" });
    if (after === "card") out.push({ label: "Line1", detail: "a line of the file", kind: "unit" });
  } else if (after === "prose") {
    out.push(
      { label: "Sentence1", detail: "a sentence of this block", kind: "unit" },
      { label: "Word1", detail: "a word of this block", kind: "unit" },
      { label: "Line1", detail: "a line of this block", kind: "unit" },
    );
  } else if (after === "literal") {
    out.push({ label: "Line1", detail: "a line of this block", kind: "unit" });
  } else {
    out.push({ label: "Word1", detail: "a word of this sentence", kind: "unit" });
  }
  return out;
}

// -- anchoring -------------------------------------------------------------

/**
 * Where to put a new anchor so the block holding `offset` can be addressed by
 * name, and the id to give it — or null when the block cannot carry one
 * (a fence, a table, math, a diagram: a trailing `^id` would change them).
 */
export function anchorSuggestion(
  document: ParsedDocument,
  offset: number,
): { at: number; id: string } | null {
  const text = document.text;
  const offset0 = bodyOffset(document);
  const block = segment(text, offset0, text.length, offset0).find((b) => b.start <= offset && offset <= b.end);
  if (block === undefined || !PROSE.has(block.kind)) return null;
  if (document.anchors.some((a) => block.start <= a.span.start && a.span.start < block.end)) return null;

  const words = text
    .slice(block.start, block.end)
    .replace(/^[ \t]*(?:>[ \t]?)*(?:[-*+]|[0-9]{1,9}[.)])?[ \t]*/, "")
    .split(/\s+/)
    .map((w) => slugify(w))
    .filter((w) => w !== "")
    .slice(0, 3);
  const base = (words.join("-") || "block").slice(0, 40).replace(/^[^A-Za-z0-9]+/, "") || "block";
  const used = new Set(document.anchors.map((a) => a.blockId));
  let id = base;
  for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
  return { at: block.end, id };
}
