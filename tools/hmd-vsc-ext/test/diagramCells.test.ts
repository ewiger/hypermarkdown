/**
 * Diagram cells in the preview (HMD-0030): what a `d2#show` or `mermaid#show`
 * fence shows as its source is typed, and after it stops drawing.
 *
 * The renderers here are tiny scripts, as in `engine.test.ts`: the thing worth
 * testing is which source reached a process, and which drawing came back.
 */

import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  MemoryHost,
  Renderer,
  Workspace,
  diagramKey,
  type DiagramBlock,
  type DocumentIR,
} from "@hypermarkdown/core";
import { describe, expect, it } from "vitest";

import { attachDiagrams, type DiagramDrawings } from "../src/diagram/attach.js";
import { DiagramEngine } from "../src/diagram/engine.js";
import { diagramCellIn } from "../src/diagram/lens.js";

const dir = mkdtempSync(join(tmpdir(), "hmd-diagram-cells-"));

/**
 * A renderer that draws its input, and refuses any input holding `!`.
 *
 * The SVG carries the source, so a test can tell which text a drawing is of.
 */
function renderer(name: string): string {
  const path = join(dir, name);
  writeFileSync(
    path,
    `#!/bin/sh\nbody=$(cat)\ncase "$body" in *'!'*) echo "${name}: syntax error" >&2; exit 1;; esac\nprintf '<svg data-by="${name}">%s</svg>' "$body"\n`,
  );
  chmodSync(path, 0o755);
  return path;
}

const engine = (): DiagramEngine =>
  new DiagramEngine({
    configuredPath: renderer("fake-d2"),
    mermaid: { configuredPath: renderer("fake-merman") },
  });

async function ir(files: Record<string, string>, path = "a.hmd"): Promise<DocumentIR> {
  const workspace = await Workspace.load(MemoryHost.from(files), {
    autodiscovery: true,
    mode: "both",
    source: null,
  });
  const document = new Renderer(workspace).render(path);
  if (document === null) throw new Error(`no such card: ${path}`);
  return document;
}

const card = (info: string, body: string): string => `# T\n\n\`\`\`${info}\n${body}\n\`\`\`\n`;

function diagramsOf(document: DocumentIR): DiagramBlock[] {
  return document.blocks.filter((b): b is DiagramBlock => b.kind === "diagram");
}

function svg(block: DiagramBlock): string {
  expect(block.dataUri).not.toBeNull();
  return Buffer.from(block.dataUri!.split(",")[1]!, "base64").toString("utf8");
}

describe("drawing a diagram cell", () => {
  it("draws `mermaid#show` with the Mermaid renderer and `d2#show` with d2", async () => {
    const document = await ir({
      "a.hmd": "```mermaid#show\nflowchart LR\n```\n\ntext\n\n```d2#show\na -> b\n```\n",
    });
    const [mermaid, d2] = diagramsOf(await attachDiagrams(document, engine(), new Map()));
    expect(svg(mermaid!)).toContain('data-by="fake-merman"');
    expect(svg(d2!)).toContain('data-by="fake-d2"');
    expect(mermaid).toMatchObject({ current: true, failure: null });
    expect(mermaid!.drawnFrom).toBe(diagramKey("flowchart LR\n"));
  });

  it("follows the source as it is edited", async () => {
    const drawings: DiagramDrawings = new Map();
    const shared = engine();
    const before = await attachDiagrams(await ir({ "a.hmd": card("mermaid#show", "one") }), shared, drawings);
    const after = await attachDiagrams(await ir({ "a.hmd": card("mermaid#show", "two") }), shared, drawings);
    expect(svg(diagramsOf(before)[0]!)).toContain("one");
    expect(svg(diagramsOf(after)[0]!)).toContain("two");
    expect(diagramsOf(after)[0]).toMatchObject({ current: true, failure: null });
  });

  it("keeps the last drawing, marked stale, when the source stops drawing", async () => {
    const drawings: DiagramDrawings = new Map();
    const shared = engine();
    await attachDiagrams(await ir({ "a.hmd": card("mermaid#show", "good") }), shared, drawings);
    const broken = diagramsOf(
      await attachDiagrams(await ir({ "a.hmd": card("mermaid#show", "bad!") }), shared, drawings),
    )[0]!;

    expect(svg(broken)).toContain("good");
    expect(broken.current).toBe(false);
    expect(broken.drawnFrom).toBe(diagramKey("good\n"));
    expect(broken.failure).toContain("syntax error");
    expect(broken.source).toBe("bad!\n");
  });

  it("is current again once the source draws", async () => {
    const drawings: DiagramDrawings = new Map();
    const shared = engine();
    await attachDiagrams(await ir({ "a.hmd": card("d2#show", "good") }), shared, drawings);
    await attachDiagrams(await ir({ "a.hmd": card("d2#show", "bad!") }), shared, drawings);
    const fixed = diagramsOf(
      await attachDiagrams(await ir({ "a.hmd": card("d2#show", "better") }), shared, drawings),
    )[0]!;
    expect(svg(fixed)).toContain("better");
    expect(fixed).toMatchObject({ current: true, failure: null });
  });

  it("has no drawing, and says why, when the source never drew", async () => {
    const [block] = diagramsOf(
      await attachDiagrams(await ir({ "a.hmd": card("mermaid#show", "bad!") }), engine(), new Map()),
    );
    expect(block).toMatchObject({ dataUri: null, drawnFrom: null, current: false });
    expect(block!.failure).toContain("syntax error");
  });

  it("does not hand one cell's last drawing to another", async () => {
    const drawings: DiagramDrawings = new Map();
    const shared = engine();
    const two = (second: string): string =>
      `\`\`\`mermaid#show\nfirst\n\`\`\`\n\ntext\n\n\`\`\`mermaid#show\n${second}\n\`\`\`\n`;
    await attachDiagrams(await ir({ "a.hmd": two("second") }), shared, drawings);
    const [first, second] = diagramsOf(
      await attachDiagrams(await ir({ "a.hmd": two("bad!") }), shared, drawings),
    );
    expect(svg(first!)).toContain("first");
    expect(svg(second!)).toContain("second");
    expect(second!.current).toBe(false);
  });

  it("draws a cell inside an embedded card, and keeps its drawing apart", async () => {
    const drawings: DiagramDrawings = new Map();
    const document = await ir({
      "a.hmd": "```mermaid#show\nhost\n```\n\n![[b]]\n",
      "b.hmd": "# B\n\n```mermaid#show\nguest\n```\n",
    });
    const drawn = await attachDiagrams(document, engine(), drawings);
    const embed = drawn.blocks.find((b) => b.kind === "embed");
    if (embed?.kind !== "embed" || embed.document === null) throw new Error("no embed");
    expect(svg(diagramsOf(drawn)[0]!)).toContain("host");
    expect(svg(diagramsOf(embed.document)[0]!)).toContain("guest");
    expect(drawings.size).toBe(2);
  });

  it("leaves a plain `mermaid` fence as a listing, with no renderer started", async () => {
    const document = await ir({ "a.hmd": card("mermaid", "flowchart LR") });
    expect(diagramsOf(await attachDiagrams(document, engine(), new Map()))).toHaveLength(0);
  });

  it("still draws a plain `d2` fence, and shows its source when it fails", async () => {
    const drawings: DiagramDrawings = new Map();
    const shared = engine();
    const good = diagramsOf(await attachDiagrams(await ir({ "a.hmd": card("d2", "good") }), shared, drawings))[0]!;
    expect(svg(good)).toContain("good");
    const bad = diagramsOf(await attachDiagrams(await ir({ "a.hmd": card("d2", "bad!") }), shared, drawings))[0]!;
    // No memory for a plain fence: it has no cell to mark stale.
    expect(bad.dataUri).toBeNull();
    expect(bad.failure).toContain("syntax error");
  });
});

describe("the cell under the cursor", () => {
  const text = "# T\n\n```mermaid#show\nflowchart LR\n  a --> b\n```\n\n```d2\nx -> y\n```\n";

  it("is found from any line of the fence, with the source the preview draws", async () => {
    for (const line of [2, 3, 4, 5]) {
      expect(diagramCellIn(text, { line })).toMatchObject({ language: "mermaid#show", index: 0 });
    }
    const [block] = diagramsOf(await ir({ "a.hmd": text }));
    expect(diagramCellIn(text, { line: 3 })!.source).toBe(block!.source);
  });

  it("is nothing outside a diagram cell, and nothing in a plain fence", () => {
    expect(diagramCellIn(text, { line: 0 })).toBeNull();
    expect(diagramCellIn(text, { line: 8 })).toBeNull();
    expect(diagramCellIn(text, { index: 1 })).toBeNull();
  });
});
