/**
 * Drawing diagram fences (HMD-0022, HMD-0030, HMD-0034).
 *
 * D2 and Mermaid are drawn by command-line tools the project depends on: `d2`,
 * and `merman-cli`, a Mermaid renderer that needs no browser. The extension
 * runs them, caches the result by source, and degrades to a labelled
 * placeholder when one is not available — a diagram that is merely not drawn
 * is not a defect in the card and must not look like one.
 *
 * Where a binary comes from is settled at package time, not at run time
 * (issue 0107). The VSIX is built per target platform and carries the
 * renderers from the pinned `hypermarkdown-toolchain` release at
 * `toolchain/bin/`, which are the same binaries CI and the published site
 * render with. The extension downloads nothing and runs no container: an
 * editor is not a place to acquire software.
 *
 * Resolution order for each renderer, highest first:
 *
 *   1. its setting, `hyperMarkdown.diagram.d2Path` or
 *      `hyperMarkdown.diagram.mermaidPath` — an explicit path, for developers
 *      deliberately testing another build. It never falls through: a setting
 *      that points at nothing is a mistake worth seeing, not a reason to
 *      quietly render with a different binary than the one named.
 *   2. the bundled toolchain in the VSIX — the deterministic default.
 *   3. the program on `PATH` — for a source checkout, where nothing is bundled.
 *   4. no renderer; the placeholder says so.
 *
 * Bounds and cache size are shared with the Python implementation's `diagram.py`, so a
 * diagram refused in a site build is refused here for the same stated reason.
 */

import { execFile } from "node:child_process";

import {
  CACHE_ENTRIES,
  MAX_SOURCE_BYTES,
  RENDER_TIMEOUT_MS,
  diagramKey,
  type DiagramEngineName,
} from "@hypermarkdown/core";

export interface DiagramResult {
  dataUri: string | null;
  failure: string | null;
}

/** Where one renderer may be found. */
export interface RendererPaths {
  /** The renderer's path setting, trimmed; empty or absent means unset. */
  configuredPath?: string | null;
  /** The renderer inside the VSIX's `toolchain/bin`, absent in a source checkout. */
  bundledPath?: string | null;
}

/**
 * Where this engine may look for its renderers. Supplied by the extension host
 * rather than read here, so the engine stays independent of the `vscode` API
 * and can be exercised with a path and a directory.
 *
 * The paths at the top level are `d2`'s, and `mermaid` holds `merman-cli`'s.
 */
export interface DiagramEngineOptions extends RendererPaths {
  mermaid?: RendererPaths;
}

interface Renderer {
  /** The program's name, as it is bundled and as it is looked up on `PATH`. */
  program: string;
  /** The setting that names another build of it. */
  setting: string;
  /** Arguments that make it read source on stdin and write SVG on stdout. */
  args: readonly string[];
}

/**
 * How each renderer is run.
 *
 * `merman-cli` is told three things `d2` needs no flag for. `resvg-safe` draws
 * labels as SVG text: Mermaid's default is HTML inside `foreignObject`, which
 * an `<img>` does not show. `constrained` is its resource policy for input
 * nobody vetted. The operation timeout is its own deadline, set to the bound
 * the process is killed at anyway.
 */
export const RENDERERS: Readonly<Record<DiagramEngineName, Renderer>> = {
  d2: {
    program: "d2",
    setting: "hyperMarkdown.diagram.d2Path",
    args: ["-", "-"],
  },
  mermaid: {
    program: "merman-cli",
    setting: "hyperMarkdown.diagram.mermaidPath",
    args: [
      "render",
      "-",
      "--format",
      "svg",
      "--svg-pipeline",
      "resvg-safe",
      "--resource-profile",
      "constrained",
      "--operation-timeout-ms",
      String(RENDER_TIMEOUT_MS),
      "--quiet",
    ],
  },
};

interface Candidate {
  command: string;
  /** A wrong answer here is the user's to fix, so do not try the next one. */
  authoritative: boolean;
}

/**
 * Run one renderer.
 *
 * The source goes in on stdin and the SVG comes back on stdout: no shell
 * string, no temporary file named from user content, no argument built from a
 * card.
 */
function run(command: string, args: readonly string[], source: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      [...args],
      { timeout: RENDER_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) reject(new Error(stderr.trim() || error.message));
        else resolve(stdout);
      },
    );
    child.on("error", reject);

    // A renderer that exits before it has read all of stdin — a crash, a parse
    // error it bails on early, a binary that is not the renderer at all — makes
    // this write fail with EPIPE. Without a listener that is an unhandled
    // `error` event on the stream, which takes down the extension host over a
    // diagram. The `execFile` callback above is the one that decides the
    // outcome: it still fires, with the exit status and whatever the renderer
    // said on stderr, which is a better message than the write error anyway.
    const stdin = child.stdin;
    if (stdin !== null) {
      stdin.on("error", () => {});
      stdin.end(source);
    }
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
  private readonly resolved = new Map<DiagramEngineName, Candidate | null>();
  private options: DiagramEngineOptions;

  constructor(options: DiagramEngineOptions = {}) {
    this.options = options;
  }

  /** Forget every rendered diagram. Used when an engine setting changes. */
  clear(options?: DiagramEngineOptions): void {
    this.cache.clear();
    this.resolved.clear();
    if (options !== undefined) this.options = options;
  }

  /**
   * Draw one diagram, from the cache when the same source was drawn before.
   *
   * `retry` is what Show asks for: a failure is not served from the cache, and
   * a renderer that was missing is looked for again. A drawing is still served
   * from the cache, because the same source draws the same picture.
   */
  async render(
    source: string,
    engine: DiagramEngineName = "d2",
    options: { retry?: boolean } = {},
  ): Promise<DiagramResult> {
    const key = `${engine}:${diagramKey(source)}`;
    const hit = this.cache.get(key);
    if (hit !== undefined && !(options.retry === true && hit.dataUri === null)) {
      // Refresh recency: delete and reinsert moves it to the end.
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    if (options.retry === true && this.resolved.get(engine) === null) this.resolved.delete(engine);

    const result = await this.renderUncached(source, engine);
    this.cache.delete(key);
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

  private paths(engine: DiagramEngineName): RendererPaths {
    return engine === "d2" ? this.options : (this.options.mermaid ?? {});
  }

  /** The order described in the file header, minus the steps that do not apply. */
  private candidates(engine: DiagramEngineName): Candidate[] {
    const paths = this.paths(engine);
    const list: Candidate[] = [];
    const configured = paths.configuredPath?.trim();
    if (configured) list.push({ command: configured, authoritative: true });
    const bundled = paths.bundledPath?.trim();
    if (bundled) list.push({ command: bundled, authoritative: false });
    list.push({ command: RENDERERS[engine].program, authoritative: false });
    return list;
  }

  private async renderUncached(source: string, engine: DiagramEngineName): Promise<DiagramResult> {
    if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) {
      return { dataUri: null, failure: `diagram source exceeds ${MAX_SOURCE_BYTES / 1024} KiB` };
    }

    const renderer = RENDERERS[engine];
    const candidate = await this.resolveCandidate(source, engine);
    if (candidate === null) {
      const configured = this.paths(engine).configuredPath?.trim();
      return {
        dataUri: null,
        failure: configured
          ? `${renderer.setting} points at \`${configured}\`, which is not an executable`
          : `no ${engine} renderer found — no \`${renderer.program}\` is bundled with this build and none is on \`PATH\``,
      };
    }

    try {
      const svg = await run(candidate.command, renderer.args, source);
      // An <img> with a data URI executes no script, which turns SVG injection
      // from a vulnerability into a rendering limitation (HMD-0022 §6).
      const base64 = Buffer.from(svg, "utf8").toString("base64");
      return { dataUri: `data:image/svg+xml;base64,${base64}`, failure: null };
    } catch (exc) {
      return { dataUri: null, failure: exc instanceof Error ? exc.message : String(exc) };
    }
  }

  /** Find a renderer once, then remember the answer for the session. */
  private async resolveCandidate(
    source: string,
    engine: DiagramEngineName,
  ): Promise<Candidate | null> {
    const known = this.resolved.get(engine);
    if (known !== undefined) return known;
    for (const candidate of this.candidates(engine)) {
      try {
        await run(candidate.command, RENDERERS[engine].args, source);
        this.resolved.set(engine, candidate);
        return candidate;
      } catch (exc) {
        // A renderer that exists but rejects *this* diagram is still the
        // renderer; only a missing executable moves us to the next candidate.
        if (!missingExecutable(exc)) {
          this.resolved.set(engine, candidate);
          return candidate;
        }
        // An explicit setting that resolves to nothing stops the search: the
        // next candidate would render, and the user would never learn that the
        // binary they named is not the one drawing their diagrams.
        if (candidate.authoritative) break;
      }
    }
    this.resolved.set(engine, null);
    return null;
  }
}
