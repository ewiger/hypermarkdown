/**
 * Diagram fences (HMD-0022).
 *
 * The core recognises a ```` ```d2 ```` fence and carries its source. It does not
 * render: `d2` is a command-line tool, and only the consumer that can run a
 * process knows whether one is available.
 */

import { sha256 } from "./sha256.js";

/** Fence languages that become a `DiagramBlock` rather than a code block. */
export const DIAGRAM_LANGUAGES: ReadonlySet<string> = new Set(["d2"]);

/**
 * Bounds on one render, shared with the Python implementation so that a diagram refused
 * in a site build is refused in the editor.
 */
export const MAX_SOURCE_BYTES = 64 * 1024;
export const RENDER_TIMEOUT_MS = 2_000;
export const CACHE_ENTRIES = 64;

/** The first word of a fence info string, lowercased. */
export function fenceLanguage(info: string): string {
  return (info.trim().split(/\s+/)[0] ?? "").toLowerCase();
}

export function isDiagramFence(info: string): boolean {
  return DIAGRAM_LANGUAGES.has(fenceLanguage(info));
}

/** Cache key for a rendered diagram: the source decides, nothing else. */
export function diagramKey(source: string): string {
  return sha256(source);
}

export { sha256 };
