/**
 * Embed expansion (HMD-0001 §6, HMD-0020 §8).
 *
 * Expansion returns a *slice* of the target — its text plus the 1-indexed line
 * that slice starts on — rather than a rewritten string. Keeping the target's
 * own line numbers is what lets an embed card navigate to the right line of the
 * right card instead of to an offset in a document that never existed on disk.
 */

import { splitFrontmatter } from "./frontmatter.js";
import { resolveAddress, type Address } from "./address.js";
import type { FragmentKind, ParsedDocument } from "./model.js";
import { lineStarts } from "./scan.js";
import { slugify } from "./slug.js";

export interface Slice {
  text: string;
  /** 1-indexed line in the target document where `text` begins. */
  startLine: number;
}

export interface ExpansionFailure {
  reason: string;
}

export type Expansion = Slice | ExpansionFailure;

export function isFailure(value: Expansion): value is ExpansionFailure {
  return "reason" in value;
}

/** The document body with its frontmatter fence removed. */
export function bodySlice(document: ParsedDocument): Slice {
  const { body, bodyOffset } = splitFrontmatter(document.text);
  const starts = lineStarts(document.text);
  let startLine = 1;
  for (let i = 0; i < starts.length; i += 1) {
    if (starts[i]! <= bodyOffset) startLine = i + 1;
    else break;
  }
  return { text: body, startLine };
}

/**
 * Extract the region a fragment addresses.
 *
 * - no fragment: the whole body, frontmatter removed
 * - `#Section`: the heading and everything up to the next heading of the same
 *   or higher level
 * - `#^id`: the anchored block, with its trailing marker stripped
 */
export function expand(
  document: ParsedDocument,
  fragment: string | null,
  fragmentKind: FragmentKind | null,
  address: Address | null = null,
): Expansion {
  if (fragment === null) return bodySlice(document);
  if (fragmentKind === "block") return expandBlock(document, fragment);
  if (fragmentKind === "address") return expandAddress(document, address);
  return expandSection(document, fragment);
}

/** HMD-0006: an address quotes exactly the span it selects. */
function expandAddress(document: ParsedDocument, address: Address | null): Expansion {
  if (address === null) return { reason: "a malformed address" };
  const result = resolveAddress(document, address);
  if (result.failure !== null) return { reason: result.failure[1] };
  const text = document.text.slice(result.start, result.end).trim();
  const lead = document.text.slice(result.start, result.end).search(/\S/);
  const begin = result.start + Math.max(lead, 0);
  const startLine = document.text.slice(0, begin).split("\n").length;
  return { text, startLine };
}

function expandSection(document: ParsedDocument, fragment: string): Expansion {
  const wanted = slugify(fragment);
  const heading = document.headings.find((h) => h.slug === wanted);
  if (heading === undefined) return { reason: `no heading '#${wanted}'` };

  const lines = document.text.split("\n");
  const startLine = heading.span.line;

  let endLine = lines.length;
  for (const other of document.headings) {
    if (other.span.line <= startLine) continue;
    if (other.level <= heading.level) {
      endLine = other.span.line - 1;
      break;
    }
  }

  return { text: lines.slice(startLine - 1, endLine).join("\n"), startLine };
}

const TRAILING_ANCHOR_RE = /[ \t]+\^[A-Za-z0-9][A-Za-z0-9_-]{0,63}[ \t]*$/;

function expandBlock(document: ParsedDocument, blockId: string): Expansion {
  const anchor = document.anchors.find((a) => a.blockId === blockId);
  if (anchor === undefined) return { reason: `no block '^${blockId}'` };

  const lines = document.text.split("\n");
  const anchorLine = anchor.span.line;

  // A block is the run of non-blank lines around the anchor. The anchor marks
  // the block's last line, so the walk is upward.
  let start = anchorLine;
  while (start > 1 && (lines[start - 2] ?? "").trim() !== "") start -= 1;

  const body = lines
    .slice(start - 1, anchorLine)
    .join("\n")
    .replace(TRAILING_ANCHOR_RE, "");

  return { text: body, startLine: start };
}
