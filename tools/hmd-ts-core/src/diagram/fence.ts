/**
 * Diagram fences (HMD-0022, HMD-0030, HMD-0034).
 *
 * The core recognises a diagram fence and carries its source. It does not
 * render: `d2` and `merman-cli` are command-line tools, and only the consumer
 * that can run a process knows whether one is available.
 *
 * A fence whose info string opens `d2#show` or `mermaid#show` is a diagram
 * cell. A plain `mermaid` fence is a listing, shown as code. A plain `d2` fence
 * still draws, as it did before diagram cells: it becomes a listing in the
 * release that turns the listing rule on.
 */

import { sha256 } from "./sha256.js";

/** The engines a diagram can be drawn by. */
export type DiagramEngineName = "d2" | "mermaid";

/** Fence kinds that are diagram cells, and the engine each one is drawn by. */
export const DIAGRAM_CELL_KINDS: ReadonlyMap<string, DiagramEngineName> = new Map([
  ["d2#show", "d2"],
  ["mermaid#show", "mermaid"],
]);

/**
 * Plain fence languages that still draw, matched without regard to case.
 *
 * Only `d2`, which drew before diagram cells existed. Nothing is added here: a
 * new diagram language gets a `#show` kind.
 */
export const DIAGRAM_LANGUAGES: ReadonlySet<string> = new Set(["d2"]);

/**
 * Bounds on one render, shared with the Python implementation so that a diagram refused
 * in a site build is refused in the editor.
 */
export const MAX_SOURCE_BYTES = 64 * 1024;
export const RENDER_TIMEOUT_MS = 2_000;
export const CACHE_ENTRIES = 64;

/** The first word of a fence info string, as written. */
export function fenceKind(info: string): string {
  return info.trim().split(/\s+/)[0] ?? "";
}

/** The first word of a fence info string, lowercased. */
export function fenceLanguage(info: string): string {
  return fenceKind(info).toLowerCase();
}

/**
 * What a `DiagramBlock` calls the fence, or null when the fence is not a diagram.
 *
 * A diagram cell is matched exactly, as an HQL cell is: `D2#show` is a listing.
 */
export function diagramLanguage(info: string): string | null {
  const kind = fenceKind(info);
  if (DIAGRAM_CELL_KINDS.has(kind)) return kind;
  const language = kind.toLowerCase();
  return DIAGRAM_LANGUAGES.has(language) ? language : null;
}

export function isDiagramFence(info: string): boolean {
  return diagramLanguage(info) !== null;
}

/** True for `d2#show` and `mermaid#show`, the kinds drawn as cells. */
export function isDiagramCell(language: string): boolean {
  return DIAGRAM_CELL_KINDS.has(language);
}

/** The engine that draws a `DiagramBlock`'s language, or null when none does. */
export function diagramEngine(language: string): DiagramEngineName | null {
  const cell = DIAGRAM_CELL_KINDS.get(language);
  if (cell !== undefined) return cell;
  return DIAGRAM_LANGUAGES.has(language) ? (language as DiagramEngineName) : null;
}

/** A diagram cell as it sits in a card's text. */
export interface DiagramCell {
  /** Position among the card's diagram cells, from 0. */
  index: number;
  /** `d2#show` or `mermaid#show`. */
  language: string;
  /** The fence body, each line ended with a newline, as a `DiagramBlock` carries it. */
  source: string;
  /** 0-based line of the opening fence. */
  openLine: number;
  /** 0-based line of the closing fence, or the last line when it is unclosed. */
  closeLine: number;
}

/**
 * The diagram cells of a card, for an editor that needs their lines.
 *
 * Fences are read the way HQL cells are (HMD-0026): an unindented line opening
 * with three backticks opens a fence, and the next such line closes it.
 */
export function scanDiagramCells(text: string): DiagramCell[] {
  const lines = text.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  if (lines[lines.length - 1] === "") lines.pop();
  const info = (line: string): string | null => {
    const trimmed = line.replace(/\s+$/u, "");
    return trimmed.startsWith("```") ? trimmed.slice(3) : null;
  };

  const cells: DiagramCell[] = [];
  let index = 0;
  while (index < lines.length) {
    const opened = info(lines[index]!);
    if (opened === null) {
      index += 1;
      continue;
    }
    let close = index + 1;
    while (close < lines.length && info(lines[close]!) === null) close += 1;
    const kind = fenceKind(opened);
    if (DIAGRAM_CELL_KINDS.has(kind)) {
      cells.push({
        index: cells.length,
        language: kind,
        source: lines
          .slice(index + 1, close)
          .map((line) => `${line}\n`)
          .join(""),
        openLine: index,
        closeLine: Math.min(close, lines.length - 1),
      });
    }
    index = close + 1;
  }
  return cells;
}

/** Identifies a diagram's source: equal sources have equal keys. */
export function diagramKey(source: string): string {
  return sha256(source);
}

export { sha256 };
