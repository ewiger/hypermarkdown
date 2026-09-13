/**
 * Rendering `d2` fences (HMD-0022).
 *
 * `d2` is a command-line tool the project depends on. The extension runs it,
 * caches the result by source, and degrades to a labelled placeholder when it
 * is not available — a diagram that is merely not drawn is not a defect in the
 * card and must not look like one.
 *
 * Where the binary comes from is settled at package time, not at run time
 * (issue 0107). The VSIX is built per target platform and carries the `d2` from
 * the pinned `hypermarkdown-toolchain` release at `toolchain/bin/`, which is the
 * same binary CI and the published site render with. The extension downloads
 * nothing and runs no container: an editor is not a place to acquire software.
 *
 * Resolution order, highest first:
 *
 *   1. `hyperMarkdown.diagram.d2Path` — an explicit path, for developers
 *      deliberately testing another build of d2. It never falls through: a
 *      setting that points at nothing is a mistake worth seeing, not a reason
 *      to quietly render with a different binary than the one named.
 *   2. the bundled toolchain in the VSIX — the deterministic default.
 *   3. `d2` on `PATH` — for a source checkout, where nothing is bundled.
 *   4. no renderer; the placeholder says so.
 *
 * Bounds and cache size are shared with the Python line's `diagram.py`, so a
 * diagram refused in a site build is refused here for the same stated reason.
 */

import { execFile } from "node:child_process";

import {
  CACHE_ENTRIES,
  MAX_SOURCE_BYTES,
  RENDER_TIMEOUT_MS,
  diagramKey,
} from "@hypermarkdown/core";

export interface DiagramResult {
  dataUri: string | null;
  failure: string | null;
}

/**
 * Where this engine may look for `d2`. Supplied by the extension host rather
 * than read here, so the engine stays independent of the `vscode` API and can
 * be exercised with a path and a directory.
 */
export interface DiagramEngineOptions {
  /** `hyperMarkdown.diagram.d2Path`, trimmed; empty or absent means unset. */
  configuredPath?: string | null;
  /** The VSIX's `toolchain/bin` directory, absent in a source checkout. */
  bundledPath?: string | null;
}

interface Candidate {
  /** What the placeholder calls this, when nothing works. */
  label: string;
  command: string;
  /** A wrong answer here is the user's to fix, so do not try the next one. */
  authoritative: boolean;
}

const NOTHING_TRIED =
  "no diagram renderer found — no `d2` is bundled with this build and none is on `PATH`";

/**
 * Run one renderer.
 *
 * The source goes in on stdin and the SVG comes back on stdout: no shell
 * string, no temporary file named from user content, no argument built from a
 * card.
 */
function run(command: string, source: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      ["-", "-"],
      { timeout: RENDER_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) reject(new Error(stderr.trim() || error.message));
        else resolve(stdout);
      },
    );
    child.on("error", reject);
    child.stdin?.end(source);
  });
}

/** True when the failure means "no such executable" rather than "bad diagram". */
function missingExecutable(exc: unknown): boolean {
  const message = exc instanceof Error ? exc.message : String(exc);
  return /ENOENT|not found|no such file|cannot find/i.test(message);
}

export class DiagramEngine {
  /** Insertion-ordered, so the oldest entry is the first key. */
  private readonly cache = new Map<string, DiagramResult>();
  private candidate: Candidate | null | undefined;
  private options: DiagramEngineOptions;

  constructor(options: DiagramEngineOptions = {}) {
    this.options = options;
  }

  /** Forget every rendered diagram. Used when the engine setting changes. */
  clear(options?: DiagramEngineOptions): void {
    this.cache.clear();
    this.candidate = undefined;
    if (options !== undefined) this.options = options;
  }

  async render(source: string): Promise<DiagramResult> {
    const key = diagramKey(source);
    const hit = this.cache.get(key);
    if (hit !== undefined) {
      // Refresh recency: delete and reinsert moves it to the end.
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }

    const result = await this.renderUncached(source);
    this.cache.set(key, result);
    // An unbounded cache in a long-lived editor process is a leak with a slow
    // fuse, and 64 live diagrams in one session is not the case worth serving.
    while (this.cache.size > CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    return result;
  }

  /** The order described in the file header, minus the steps that do not apply. */
  private candidates(): Candidate[] {
    const list: Candidate[] = [];
    const configured = this.options.configuredPath?.trim();
    if (configured) {
      list.push({ label: configured, command: configured, authoritative: true });
    }
    const bundled = this.options.bundledPath?.trim();
    if (bundled) {
      list.push({ label: "the bundled toolchain", command: bundled, authoritative: false });
    }
    list.push({ label: "`d2` on PATH", command: "d2", authoritative: false });
    return list;
  }

  private async renderUncached(source: string): Promise<DiagramResult> {
    if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) {
      return { dataUri: null, failure: `diagram source exceeds ${MAX_SOURCE_BYTES / 1024} KiB` };
    }

    const candidate = await this.resolveCandidate(source);
    if (candidate === null) {
      const configured = this.options.configuredPath?.trim();
      return {
        dataUri: null,
        failure: configured
          ? `hyperMarkdown.diagram.d2Path points at \`${configured}\`, which is not an executable`
          : NOTHING_TRIED,
      };
    }

    try {
      const svg = await run(candidate.command, source);
      // An <img> with a data URI executes no script, which turns SVG injection
      // from a vulnerability into a rendering limitation (HMD-0022 §6).
      const base64 = Buffer.from(svg, "utf8").toString("base64");
      return { dataUri: `data:image/svg+xml;base64,${base64}`, failure: null };
    } catch (exc) {
      return { dataUri: null, failure: exc instanceof Error ? exc.message : String(exc) };
    }
  }

  /** Find a renderer once, then remember the answer for the session. */
  private async resolveCandidate(source: string): Promise<Candidate | null> {
    if (this.candidate !== undefined) return this.candidate;
    for (const candidate of this.candidates()) {
      try {
        await run(candidate.command, source);
        this.candidate = candidate;
        return candidate;
      } catch (exc) {
        // A renderer that exists but rejects *this* diagram is still the
        // renderer; only a missing executable moves us to the next candidate.
        if (!missingExecutable(exc)) {
          this.candidate = candidate;
          return candidate;
        }
        // An explicit setting that resolves to nothing stops the search: the
        // next candidate would render, and the user would never learn that the
        // binary they named is not the one drawing their diagrams.
        if (candidate.authoritative) break;
      }
    }
    this.candidate = null;
    return null;
  }
}
