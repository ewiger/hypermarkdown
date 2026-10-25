/**
 * Running HQL cells (HMD-0026).
 *
 * The extension does not evaluate HQL; the `hql` binary does. This file runs
 * it the way an editor host is meant to — `hql render --emit after --envelope
 * json`, the card on stdin, one cell or the whole card — and turns its answer
 * into edits that write each output back into the card.
 *
 * Nothing here is taken on trust from the binary's output. Before an edit is
 * made, every cell HQL reports must be a cell this side found too, in the same
 * order and with the same hash. A disagreement means the two read the card
 * differently, and writing an output at a position the other side computed
 * would put it in the wrong place; the run is refused instead.
 *
 * Resolution order for the binary, highest first:
 *
 *   1. `hyperMarkdown.hql.path` — an explicit path, which never falls through.
 *   2. the `hql` the pinned toolchain puts in the VSIX — the default, on the
 *      platforms HQL publishes.
 *   3. `hql` on `PATH`.
 *
 * Free of the `vscode` API, so it runs under a unit test with a path.
 */

import { execFile, type ExecFileException } from "node:child_process";

import {
  maskForHql,
  outputEdit,
  scanCells,
  type Cell,
  type CellResult,
  type TextEdit,
} from "@hypermarkdown/core";

/** One run's ceiling. A query over a vault is not a keystroke-time operation. */
export const HQL_TIMEOUT_MS = 30_000;
/** The largest card handed to HQL. */
export const MAX_CARD_BYTES = 1024 * 1024;
/** The largest answer read back. */
const MAX_ANSWER_BYTES = 32 * 1024 * 1024;

export interface HqlEngineOptions {
  /** `hyperMarkdown.hql.path`, trimmed; empty or absent means unset. */
  configuredPath?: string | null;
  /** The VSIX's bundled `hql`, absent when the build carries none. */
  bundledPath?: string | null;
}

/** What one cell came to. */
export interface CellOutcome {
  index: number;
  status: "ok" | "error" | "skipped" | "not-run";
  /** Why a cell asked for did not run: the first error HQL reported. */
  reason: string | null;
}

export interface RunResult {
  /** Edits against the text the run was given, last first. */
  edits: TextEdit[];
  outcomes: CellOutcome[];
}

/** A run that produced nothing to write, and why. */
export class HqlRunError extends Error {}

interface EnvelopeCell {
  id: string | null;
  index: number;
  hash: string;
  status: string;
  markdown: string;
  reports?: Array<{ severity?: string; message?: string }>;
}

interface Envelope {
  cells: EnvelopeCell[];
  reports?: Array<{ severity?: string; message?: string }>;
}

interface Candidate {
  label: string;
  command: string;
  authoritative: boolean;
}

/** True when the failure means "no such executable" rather than "bad card". */
function missingExecutable(error: ExecFileException | null): boolean {
  return error !== null && (error.code === "ENOENT" || error.code === "EACCES");
}

interface Exec {
  error: ExecFileException | null;
  stdout: string;
  stderr: string;
}

function exec(command: string, args: readonly string[], input: string, cwd: string): Promise<Exec> {
  return new Promise((resolve) => {
    const child = execFile(
      command,
      [...args],
      { cwd, timeout: HQL_TIMEOUT_MS, maxBuffer: MAX_ANSWER_BYTES, encoding: "utf8" },
      (error, stdout, stderr) => resolve({ error, stdout, stderr }),
    );
    // An `hql` that exits before reading all of stdin makes this write fail
    // with EPIPE, which unhandled would take the extension host down over a
    // query. The callback above still reports the exit.
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });
}

export class HqlEngine {
  private options: HqlEngineOptions;
  private found: Candidate | null | undefined;

  constructor(options: HqlEngineOptions = {}) {
    this.options = options;
  }

  /** Forget which binary was found. Used when the setting changes. */
  reset(options?: HqlEngineOptions): void {
    this.found = undefined;
    if (options !== undefined) this.options = options;
  }

  private candidates(): Candidate[] {
    const list: Candidate[] = [];
    const configured = this.options.configuredPath?.trim();
    if (configured) list.push({ label: configured, command: configured, authoritative: true });
    const bundled = this.options.bundledPath?.trim();
    if (bundled) list.push({ label: "the bundled toolchain", command: bundled, authoritative: false });
    list.push({ label: "`hql` on PATH", command: "hql", authoritative: false });
    return list;
  }

  /**
   * Run `hql` once with the given arguments, finding the binary the first
   * time. A binary that exists but fails is still the binary; only a missing
   * one moves to the next candidate.
   */
  private async invoke(args: readonly string[], input: string, cwd: string): Promise<Exec> {
    if (this.found === null) throw new HqlRunError(this.notFound());
    if (this.found !== undefined) return exec(this.found.command, args, input, cwd);

    for (const candidate of this.candidates()) {
      const result = await exec(candidate.command, args, input, cwd);
      if (!missingExecutable(result.error)) {
        this.found = candidate;
        return result;
      }
      if (candidate.authoritative) break;
    }
    this.found = null;
    throw new HqlRunError(this.notFound());
  }

  private notFound(): string {
    const configured = this.options.configuredPath?.trim();
    return configured
      ? `hyperMarkdown.hql.path points at \`${configured}\`, which is not an executable`
      : "no `hql` found — this build carries none for this platform, and none is on PATH. Install HQL from https://hql-lang.org/ or set hyperMarkdown.hql.path";
  }

  /**
   * Run one cell and the cells it reads, or every cell when `target` is null,
   * and return the edits that write their outputs into `text`.
   *
   * A cell with an id runs alone with `--cell`. One without has no name HQL
   * can be asked for, so the whole card runs and only that cell's output is
   * written; the others are left exactly as they were.
   */
  async run(text: string, vaultRoot: string, target: number | null): Promise<RunResult> {
    if (Buffer.byteLength(text, "utf8") > MAX_CARD_BYTES) {
      throw new HqlRunError(`the card exceeds ${MAX_CARD_BYTES / 1024} KiB`);
    }
    const { cells } = scanCells(text);
    if (target !== null && cells[target] === undefined) {
      throw new HqlRunError("that cell is no longer in the card");
    }
    if (cells.length === 0) return { edits: [], outcomes: [] };

    const id = target === null ? null : cells[target]!.id;
    const args = ["--vault", vaultRoot, "render", "--emit", "after", "--envelope", "json"];
    if (id !== null) args.push("--cell", id);
    args.push("-");

    const answer = await this.invoke(args, maskForHql(text), vaultRoot);
    const envelope = parseEnvelope(answer.stdout);
    if (envelope === null) {
      const said = answer.stderr.trim() || answer.error?.message || "no answer";
      throw new HqlRunError(`hql did not run the card: ${said}`);
    }
    agree(cells, envelope);

    const wanted = target === null ? cells.map((c) => c.index) : [target];
    const firstError = firstErrorOf(envelope);
    const outcomes: CellOutcome[] = [];
    const edits: TextEdit[] = [];
    for (const index of wanted) {
      const reported = envelope.cells[index]!;
      const status = reported.status;
      if (status !== "ok" && status !== "error" && status !== "skipped") {
        outcomes.push({ index, status: "not-run", reason: firstError });
        continue;
      }
      outcomes.push({ index, status, reason: null });
      const result: CellResult = { status, hash: reported.hash, markdown: reported.markdown };
      edits.push(outputEdit(text, cells[index]!, result));
    }
    // Last first, so each edit's offsets are still valid when it is applied.
    edits.sort((a, b) => b.start - a.start);
    return { edits, outcomes };
  }
}

/** The envelope, or null when the answer is not one. */
export function parseEnvelope(stdout: string): Envelope | null {
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const cells = (raw as { cells?: unknown }).cells;
  if (!Array.isArray(cells)) return null;
  for (const cell of cells) {
    if (typeof cell !== "object" || cell === null) return null;
    const c = cell as Record<string, unknown>;
    if (typeof c["hash"] !== "string" || typeof c["status"] !== "string") return null;
    if (typeof c["markdown"] !== "string") return null;
  }
  return raw as Envelope;
}

/**
 * Refuse to write unless HQL and this side found the same cells.
 *
 * The hash covers each cell's code and what it reads, so equal hashes in equal
 * order mean the two agree on where every cell is and what it is.
 */
function agree(cells: readonly Cell[], envelope: Envelope): void {
  const mismatch =
    envelope.cells.length !== cells.length ||
    envelope.cells.some((reported, i) => reported.hash !== cells[i]!.hash);
  if (mismatch) {
    throw new HqlRunError(
      `hql and the extension read this card's cells differently (hql found ${envelope.cells.length}, the extension ${cells.length}); nothing was written`,
    );
  }
}

function firstErrorOf(envelope: Envelope): string | null {
  const all = [...(envelope.reports ?? []), ...envelope.cells.flatMap((c) => c.reports ?? [])];
  const error = all.find((r) => r.severity === "error" || r.severity === "failure");
  return error?.message ?? null;
}

export function describeOutcome(outcome: CellOutcome, cell: Cell | undefined): string {
  const name = cell?.id ?? `cell ${outcome.index + 1}`;
  switch (outcome.status) {
    case "ok":
      return `${name} ran`;
    case "error":
      return `${name} failed; the error is written below it`;
    case "skipped":
      return `${name} was skipped: a cell it reads failed`;
    default:
      return outcome.reason === null
        ? `${name} did not run`
        : `${name} did not run, because the card does not check: ${outcome.reason}`;
  }
}
