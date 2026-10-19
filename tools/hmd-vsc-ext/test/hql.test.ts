/**
 * Running HQL cells (HMD-0026).
 *
 * The stand-ins for `hql` are small scripts, as the diagram engine's are: the
 * thing worth testing is that the engine runs the executable it chose and
 * writes what that executable answered. The last block runs the real binary
 * when `HQL_BIN` names one, and checks that writing one output by hand leaves
 * the card byte-identical to what `hql render` itself would write.
 */

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  MemoryHost,
  Renderer,
  Workspace,
  maskForHql,
  scanCells,
  type DocumentIR,
} from "@hypermarkdown/core";
import { beforeEach, describe, expect, it } from "vitest";

import { HqlEngine, HqlRunError } from "../src/hql/engine.js";
import { markRunning, patchBlocks } from "../media/render.js";
import { parseWebviewMessage } from "../src/protocol.js";

const dir = mkdtempSync(join(tmpdir(), "hmd-hql-"));

/** A stand-in `hql` that records its arguments and stdin and prints `answer`. */
function fakeHql(name: string, answer: object | string, exit = 0): string {
  const path = join(dir, name);
  const body = typeof answer === "string" ? answer : JSON.stringify(answer);
  writeFileSync(join(dir, `${name}.json`), body);
  writeFileSync(
    path,
    `#!/bin/sh\nprintf '%s\\n' "$@" > "${dir}/${name}.args"\ncat > "${dir}/${name}.stdin"\ncat "${dir}/${name}.json"\nexit ${exit}\n`,
  );
  chmodSync(path, 0o755);
  return path;
}

function apply(text: string, edits: Array<{ start: number; end: number; text: string }>): string {
  let out = text;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

const CARD = "# Contents\n\n```hql\ncards | size\n```\n\n```hql#eval id=toc\n[1,2] | map(x => x * 2)\n```\n\n```hql#eval\ntoc | size\n```\n";

function envelopeFor(text: string, statuses: string[], markdown: string[]): object {
  const { cells } = scanCells(text);
  return {
    cells: cells.map((c, i) => ({
      id: c.id,
      index: i,
      hash: c.hash,
      status: statuses[i],
      markdown: markdown[i] ?? "",
      reports: [],
    })),
    document: "",
    reports: [],
  };
}

describe("running a cell", () => {
  it("runs a named cell alone, with the card on stdin and listings masked", async () => {
    const hql = fakeHql("named", envelopeFor(CARD, ["ok", "not-run"], ["- 2\n- 4"]));
    const engine = new HqlEngine({ configuredPath: hql });
    const result = await engine.run(CARD, dir, 0);

    const args = execFileSync("cat", [join(dir, "named.args")], { encoding: "utf8" }).split("\n");
    expect(args).toEqual(
      expect.arrayContaining(["--vault", dir, "render", "--emit", "after", "--envelope", "json", "--cell", "toc", "-"]),
    );
    const stdin = execFileSync("cat", [join(dir, "named.stdin")], { encoding: "utf8" });
    expect(stdin).toContain("```txt\ncards | size");
    expect(stdin.length).toBe(CARD.length);

    const written = apply(CARD, result.edits);
    expect(written).toContain(
      "```hql#eval id=toc\n[1,2] | map(x => x * 2)\n```\n<!-- hql:output id=toc hash=dcba52b6c100 status=ok -->\n- 2\n- 4\n<!-- /hql:output -->\n",
    );
    // The listing and the other cell are untouched.
    expect(written).toContain("```hql\ncards | size\n```\n\n");
    expect(written.endsWith("<!-- /hql:output -->\n\n```hql#eval\ntoc | size\n```\n")).toBe(true);
  });

  it("runs the whole card for a cell with no id, and writes only that cell", async () => {
    const hql = fakeHql("anonymous", envelopeFor(CARD, ["ok", "ok"], ["- 2\n- 4", "2"]));
    const result = await new HqlEngine({ configuredPath: hql }).run(CARD, dir, 1);
    const args = execFileSync("cat", [join(dir, "anonymous.args")], { encoding: "utf8" });
    expect(args).not.toContain("--cell");
    const written = apply(CARD, result.edits);
    expect(written).toContain("```hql#eval\ntoc | size\n```\n<!-- hql:output hash=");
    expect(written).not.toContain("id=toc hash=");
  });

  it("writes every cell's output when the whole card runs", async () => {
    const hql = fakeHql("all", envelopeFor(CARD, ["ok", "error"], ["- 2\n- 4", "error: no"]));
    const result = await new HqlEngine({ configuredPath: hql }).run(CARD, dir, null);
    const written = apply(CARD, result.edits);
    expect(written).toContain("status=ok -->\n- 2\n- 4\n");
    expect(written).toContain("status=error -->\nerror: no\n");
    expect(result.outcomes.map((o) => o.status)).toEqual(["ok", "error"]);
  });

  it("runs a query cell hidden, and keeps no output for it", async () => {
    const card = "```hql#query id=q\n[1]\n```\n<!-- hql:output id=q hash=x status=ok -->\nold\n<!-- /hql:output -->\n";
    const hql = fakeHql("query", envelopeFor(card, ["ok"], ["- 1"]));
    const result = await new HqlEngine({ configuredPath: hql }).run(card, dir, 0);
    const stdin = execFileSync("cat", [join(dir, "query.stdin")], { encoding: "utf8" });
    expect(stdin.startsWith("```hql#query id=q hidden\n")).toBe(true);
    expect(apply(card, result.edits)).toBe("```hql#query id=q\n[1]\n```\n");
  });

  it("says why a cell did not run, and writes nothing for it", async () => {
    const envelope = envelopeFor(CARD, ["not-run", "error"], ["", "error: x"]) as {
      reports: object[];
    };
    envelope.reports = [{ severity: "error", message: "addition requires two Int" }];
    const hql = fakeHql("check", envelope, 1);
    const result = await new HqlEngine({ configuredPath: hql }).run(CARD, dir, 0);
    expect(result.edits).toEqual([]);
    expect(result.outcomes[0]).toMatchObject({ status: "not-run", reason: "addition requires two Int" });
  });

  it("refuses to write when hql found different cells", async () => {
    const wrong = envelopeFor(CARD, ["ok", "ok"], ["1", "2"]) as { cells: Array<{ hash: string }> };
    wrong.cells[0]!.hash = "000000000000";
    const hql = fakeHql("disagree", wrong);
    await expect(new HqlEngine({ configuredPath: hql }).run(CARD, dir, 0)).rejects.toThrow(
      /read this card's cells differently/,
    );
  });

  it("reports what hql said when it answered with no envelope", async () => {
    const path = join(dir, "usage");
    writeFileSync(path, "#!/bin/sh\ncat >/dev/null\necho 'hql: unknown option' >&2\nexit 2\n");
    chmodSync(path, 0o755);
    await expect(new HqlEngine({ configuredPath: path }).run(CARD, dir, 0)).rejects.toThrow(
      /unknown option/,
    );
  });

  it("names a configured path that is not an executable, and does not fall through", async () => {
    const engine = new HqlEngine({ configuredPath: join(dir, "nothing-here"), bundledPath: fakeHql("bundled", {}) });
    await expect(engine.run(CARD, dir, 0)).rejects.toThrow(HqlRunError);
    await expect(engine.run(CARD, dir, 0)).rejects.toThrow(/points at/);
  });
});

describe("the preview", () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.append(container);
  });

  async function ir(text: string): Promise<DocumentIR> {
    const ws = await Workspace.load(MemoryHost.from({ "a.hmd": text, "dune.hmd": "# Dune\n" }), {
      autodiscovery: true,
      mode: "both",
      source: null,
    });
    return new Renderer(ws).render("a.hmd")!;
  }

  const SAVED =
    "# Contents\n\n```hql#eval id=toc\n[1,2] | map(x => x * 2)\n```\n<!-- hql:output id=toc hash=dcba52b6c100 status=ok -->\n- [[dune]]\n<!-- /hql:output -->\n";

  it("shows the saved output and hides the code", async () => {
    patchBlocks(container, (await ir(SAVED)).blocks, { embeds: "expanded" });
    const cell = container.querySelector<HTMLElement>(".hmd-cell")!;
    expect(cell.classList.contains("is-current")).toBe(true);
    expect(cell.querySelector(".hmd-cell-output a.hmd-link")?.textContent).toBe("dune");
    expect(cell.querySelector<HTMLElement>(".hmd-cell-source")!.hidden).toBe(true);
    expect(container.textContent).not.toContain("hql:output");
  });

  it("keeps the code shown across a new output", async () => {
    patchBlocks(container, (await ir(SAVED)).blocks, { embeds: "expanded" });
    container.querySelector(".hmd-cell")!.classList.add("is-code-shown");
    patchBlocks(container, (await ir(SAVED.replace("[[dune]]", "two"))).blocks, { embeds: "expanded" });
    const cell = container.querySelector<HTMLElement>(".hmd-cell")!;
    expect(cell.querySelector<HTMLElement>(".hmd-cell-source")!.hidden).toBe(false);
    expect(cell.querySelector(".hmd-cell-output")!.textContent).toContain("two");
  });

  it("marks an output whose code changed as stale", async () => {
    patchBlocks(container, (await ir(SAVED.replace("x * 2", "x * 3"))).blocks, { embeds: "expanded" });
    expect(container.querySelector(".hmd-cell")!.classList.contains("is-stale")).toBe(true);
  });

  it("offers no Run button inside an embed", async () => {
    const ws = await Workspace.load(
      MemoryHost.from({ "a.hmd": "![[b]]\n", "b.hmd": SAVED, "dune.hmd": "# Dune\n" }),
      { autodiscovery: true, mode: "both", source: null },
    );
    patchBlocks(container, new Renderer(ws).render("a.hmd")!.blocks, { embeds: "expanded" });
    expect(container.querySelector(".hmd-cell")).not.toBeNull();
    expect(container.querySelector(".hmd-cell-run")).toBeNull();
  });

  it("marks the running cells", async () => {
    patchBlocks(container, (await ir(SAVED)).blocks, { embeds: "expanded" });
    markRunning(container, [0]);
    expect(container.querySelector<HTMLButtonElement>(".hmd-cell-run")!.disabled).toBe(true);
    markRunning(container, []);
    expect(container.querySelector<HTMLButtonElement>(".hmd-cell-run")!.disabled).toBe(false);
  });

  it("accepts a run request only with a cell index", () => {
    expect(parseWebviewMessage({ type: "runCell", index: 2 })).toEqual({ type: "runCell", index: 2 });
    expect(parseWebviewMessage({ type: "runCell", index: -1 })).toBeNull();
    expect(parseWebviewMessage({ type: "runCell", index: "0" })).toBeNull();
    expect(parseWebviewMessage({ type: "runAllCells" })).toEqual({ type: "runAllCells" });
  });
});

const HQL_BIN = process.env["HQL_BIN"];

describe.skipIf(HQL_BIN === undefined || !existsSync(HQL_BIN ?? ""))("against the real hql", () => {
  it("writes one output exactly as hql render does", async () => {
    const vault = join(dir, "vault");
    mkdirSync(join(vault, ".hmd"), { recursive: true });
    writeFileSync(join(vault, "dune.hmd"), "---\ntitle: Dune\nmetadata:\n  category: book\n---\n# Dune\n");
    writeFileSync(join(vault, "emma.hmd"), "---\ntitle: Emma\nmetadata:\n  category: book\n---\n# Emma\n");
    const text =
      "# Books\n\n```hql\ncards | size\n```\n\n```hql#query id=books\ncards | filter(c => c.metadata.category == \"book\") | sort(by = c => c.title)\n```\n\n```hql#eval\nbooks\n```\n\n```hql#eval\nbooks | size\n```\n";

    const engine = new HqlEngine({ configuredPath: HQL_BIN! });
    const once = apply(text, (await engine.run(text, vault, null)).edits);
    expect(once).toContain("- [[dune]]\n- [[emma]]");
    expect(once).toContain("```hql\ncards | size\n```\n\n");

    expect(once).toContain("```hql#query id=books\ncards | filter(c => c.metadata.category == \"book\") | sort(by = c => c.title)\n```\n\n");
    expect(once).toContain("```hql#eval\nbooks | size\n```\n<!-- hql:output hash=");

    // HQL, given the card the extension wrote, masked as the extension masks
    // it, has nothing left to change.
    const masked = maskForHql(once);
    const again = execFileSync(HQL_BIN!, ["--vault", vault, "render", "--emit", "after", "-"], {
      input: masked,
      encoding: "utf8",
    });
    expect(again).toBe(masked);
  });
});
