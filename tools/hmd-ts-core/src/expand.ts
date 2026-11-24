/**
 * Embed expansion (HMD-0020).
 *
 * Expansion returns a *slice* of the target — its text plus the 1-indexed line
 * that slice starts on — rather than a rewritten string. Keeping the target's
 * own line numbers is what lets an embed card navigate to the right line of the
 * right card instead of to an offset in a document that never existed on disk.
 */

import { splitFrontmatter } from "./frontmatter.js";
import { findHeading, type Heading, type ParsedDocument } from "./model.js";
import { lineStarts } from "./scan.js";

/** Lines end at `\n`, `\r\n`, or a lone `\r`. */
const EOL_RE = /\r\n|\r|\n/;

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
 * - `#^id`: the anchored block, with its trailing marker stripped; an anchor
 *   on a heading's line names that heading, and expands its whole section
 *
 * The slice keeps every other block anchor as written: they are never
 * rendered, and the renderer drops them where it drops its own.
 */
export function expand(
  document: ParsedDocument,
  fragment: string | null,
  fragmentKind: "heading" | "block" | null,
): Expansion {
  if (fragment === null) return bodySlice(document);
  if (fragmentKind === "block") return expandBlock(document, fragment);
  return expandSection(document, fragment);
}

function expandSection(document: ParsedDocument, fragment: string): Expansion {
  // The first heading whose key is the fragment's.
  const heading = findHeading(document, fragment);
  if (heading === null) return { reason: `no heading '#${fragment}'` };
  return section(document, heading);
}

/**
 * A heading and everything up to the next heading of the same or higher
 * level. ATX and setext headings end each other's sections alike: a setext
 * heading's level is 1 under `===` and 2 under `---`.
 */
function section(document: ParsedDocument, heading: Heading): Slice {
  const lines = document.text.split(EOL_RE);
  const startLine = heading.span.line;

  let endLine = lines.length;
  for (const other of document.headings.slice(document.headings.indexOf(heading) + 1)) {
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

  const anchorLine = anchor.span.line;
  // An anchor on a heading's line names the heading, not its line.
  const heading = document.headings.find((h) => h.span.line === anchorLine);
  if (heading !== undefined) return section(document, heading);

  const lines = document.text.split(EOL_RE);
  // The walk never climbs into the frontmatter.
  const floor = bodySlice(document).startLine;

  // A block is the run of non-blank lines around the anchor. The anchor marks
  // the block's last line, so the walk is upward.
  let start = anchorLine;
  while (start > floor && (lines[start - 2] ?? "").trim() !== "") start -= 1;

  const body = lines
    .slice(start - 1, anchorLine)
    .join("\n")
    .replace(TRAILING_ANCHOR_RE, "");

  return { text: body, startLine: start };
}
