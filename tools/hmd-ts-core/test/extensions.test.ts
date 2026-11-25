/**
 * Callouts, math, and diagram fences (HMD-0020 §3.3, HMD-0022).
 */

import { describe, expect, it } from "vitest";

import {
  diagramEngine,
  diagramKey,
  diagramLanguage,
  fenceLanguage,
  isDiagramCell,
  isDiagramFence,
  scanDiagramCells,
  sha256,
} from "../src/diagram/fence.js";
import { MemoryHost } from "../src/host.js";
import type { DiagramBlock, DocumentIR } from "../src/ir.js";
import { Renderer } from "../src/render.js";
import { Workspace } from "../src/workspace.js";

async function render(files: Record<string, string>, path = "a.hmd"): Promise<DocumentIR> {
  const workspace = await Workspace.load(MemoryHost.from(files), {
    autodiscovery: true,
    mode: "both",
    source: null,
  });
  const ir = new Renderer(workspace).render(path);
  if (ir === null) throw new Error(`no such card: ${path}`);
  return ir;
}

async function html(body: string): Promise<string> {
  const ir = await render({ "a.hmd": body });
  return ir.blocks.map((b) => (b.kind === "html" ? b.html : "")).join("");
}

async function diagrams(files: Record<string, string>): Promise<DiagramBlock[]> {
  const ir = await render(files);
  return ir.blocks.filter((b): b is DiagramBlock => b.kind === "diagram");
}

describe("callouts", () => {
  it("renders !!! in the shape Python-Markdown's admonition produces", async () => {
    const out = await html('!!! note "Why per subject"\n\n    Throttling is per subject.\n');
    expect(out).toMatch(/<div class="admonition note"[^>]*>/);
    expect(out).toMatch(/<p class="admonition-title"[^>]*>Why per subject<\/p>/);
    expect(out).toContain("Throttling is per subject.");
  });

  it("titles a bare type", async () => {
    expect(await html("!!! warning\n\n    Careful.\n")).toContain(">Warning</p>");
  });

  it("renders ??? as a collapsed details element", async () => {
    const out = await html("??? tip\n\n    Hidden.\n");
    expect(out).toMatch(/<details class="tip"[^>]*>/);
    expect(out).toMatch(/<summary[^>]*>Tip<\/summary>/);
    expect(out).not.toMatch(/<details[^>]*\sopen/);
  });

  it("renders ???+ as an open details element", async () => {
    expect(await html("???+ tip\n\n    Shown.\n")).toContain("open");
  });

  it("carries extra classes through", async () => {
    expect(await html("!!! danger highlight\n\n    Boom.\n")).toContain(
      'class="admonition danger highlight"',
    );
  });

  it("parses markdown inside the body, including links", async () => {
    const ir = await render({
      "tokens.hmd": "# Tokens\n",
      "a.hmd": "!!! note\n\n    see [[tokens]] and **bold**\n",
    });
    const out = ir.blocks.map((b) => (b.kind === "html" ? b.html : "")).join("");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain('data-hmd-path="tokens.hmd"');
  });

  it("ends the body at the first unindented line", async () => {
    const out = await html("!!! note\n\n    inside\n\noutside\n");
    const admonition = out.slice(out.indexOf("admonition"), out.indexOf("</div>"));
    expect(admonition).toContain("inside");
    expect(admonition).not.toContain("outside");
  });
});

describe("math", () => {
  it("typesets inline math", async () => {
    expect(await html("Attempt $n$ is delayed.\n")).toContain("katex");
  });

  it("leaves prose about money alone", async () => {
    // smart_dollar: the opening delimiter must be followed by non-whitespace
    // and the closing one preceded by it.
    const out = await html("I have $2.00 and Bob has $10.00.\n");
    expect(out).not.toContain("katex");
    expect(out).toContain("$2.00");
  });

  it("leaves an escaped dollar alone", async () => {
    expect(await html("A literal \\$5 stays literal.\n")).not.toContain("katex");
  });

  it("does not treat spaced delimiters as math", async () => {
    expect(await html("range $ x $ here.\n")).not.toContain("katex");
  });

  it("typesets a display block", async () => {
    const out = await html("$$\nt_n = U(0, b)\n$$\n");
    expect(out).toContain("hmd-math-block");
    expect(out).toContain("katex");
  });

  it("degrades a broken expression to readable output rather than throwing", async () => {
    expect(async () => html("$\\frac{}{$\n")).not.toThrow();
  });

  it("does not typeset inside a code fence", async () => {
    expect(await html("```\n$n$\n```\n")).not.toContain("katex");
  });
});

describe("diagram fences", () => {
  const fence = (body: string, info = "d2"): string => `# T\n\n\`\`\`${info}\n${body}\n\`\`\`\n`;

  it("makes a d2 fence its own block", async () => {
    const [diagram] = await diagrams({ "a.hmd": fence("a -> b") });
    expect(diagram).toMatchObject({ kind: "diagram", language: "d2" });
    expect(diagram!.source).toBe("a -> b\n");
  });

  it("leaves other fences as code blocks", async () => {
    expect(await diagrams({ "a.hmd": fence("print(1)", "python") })).toHaveLength(0);
  });

  it("recognises the languages it claims", () => {
    expect(isDiagramFence("d2")).toBe(true);
    expect(isDiagramFence("D2 something")).toBe(true);
    expect(isDiagramFence("python")).toBe(false);
    expect(fenceLanguage("  D2  extra ")).toBe("d2");
  });

  it("runs no renderer of its own — the consumer runs `d2`", async () => {
    const [diagram] = await diagrams({ "a.hmd": fence("a -> b") });
    expect(diagram!.dataUri).toBeNull();
    expect(diagram!.failure).toBeNull();
  });

  it("keys a diagram by its source, so identical fences share a render", () => {
    expect(diagramKey("a -> b\n")).toBe(diagramKey("a -> b\n"));
    expect(diagramKey("a -> b\n")).not.toBe(diagramKey("a -> c\n"));
  });

  it("gives two different diagrams distinct block keys", async () => {
    const both = await diagrams({
      "a.hmd": "```d2\na -> b\n```\n\ntext\n\n```d2\nc -> d\n```\n",
    });
    expect(both).toHaveLength(2);
    expect(both[0]!.key).not.toBe(both[1]!.key);
  });
});

describe("diagram cells", () => {
  const cell = (info: string, body: string): string => `# T\n\n\`\`\`${info}\n${body}\n\`\`\`\n`;

  it("makes `d2#show` and `mermaid#show` diagram cells", async () => {
    const [d2] = await diagrams({ "a.hmd": cell("d2#show", "a -> b") });
    expect(d2).toMatchObject({ kind: "diagram", language: "d2#show", source: "a -> b\n" });

    const [mermaid] = await diagrams({ "a.hmd": cell("mermaid#show", "flowchart LR\n  a --> b") });
    expect(mermaid).toMatchObject({ kind: "diagram", language: "mermaid#show" });
    expect(mermaid!.source).toBe("flowchart LR\n  a --> b\n");
  });

  it("matches a cell kind exactly, and ignores the words after it", () => {
    expect(diagramLanguage("d2#show")).toBe("d2#show");
    expect(diagramLanguage("mermaid#show")).toBe("mermaid#show");
    expect(diagramLanguage("mermaid#show wide")).toBe("mermaid#show");
    expect(diagramLanguage("D2#show")).toBeNull();
    expect(diagramLanguage("Mermaid#show")).toBeNull();
    expect(diagramLanguage("mermaid#Show")).toBeNull();
    expect(diagramLanguage("d2#eval")).toBeNull();
    expect(diagramLanguage("hql#eval")).toBeNull();
    expect(isDiagramCell("d2#show")).toBe(true);
    expect(isDiagramCell("d2")).toBe(false);
  });

  it("shows a plain `mermaid` fence as a listing", async () => {
    const body = cell("mermaid", "flowchart LR\n  a --> b");
    expect(await diagrams({ "a.hmd": body })).toHaveLength(0);
    expect(await html(body)).toContain("<code");
    expect(isDiagramFence("mermaid")).toBe(false);
    expect(isDiagramFence("Mermaid")).toBe(false);
  });

  it("names the engine that draws each language", () => {
    expect(diagramEngine("d2#show")).toBe("d2");
    expect(diagramEngine("mermaid#show")).toBe("mermaid");
    expect(diagramEngine("d2")).toBe("d2");
    expect(diagramEngine("mermaid")).toBeNull();
    expect(diagramEngine("python")).toBeNull();
  });

  it("carries a cell with no drawing and no drawing state", async () => {
    const [diagram] = await diagrams({ "a.hmd": cell("mermaid#show", "flowchart LR\n  a --> b") });
    expect(diagram).toMatchObject({
      dataUri: null,
      drawnFrom: null,
      current: false,
      failure: null,
    });
  });

  it("keeps a cell's key when its source changes", async () => {
    const [before] = await diagrams({ "a.hmd": cell("mermaid#show", "flowchart LR\n  a --> b") });
    const [after] = await diagrams({ "a.hmd": cell("mermaid#show", "flowchart LR\n  a --> c") });
    expect(after!.key).toBe(before!.key);
  });

  it("gives two cells with the same source distinct keys", async () => {
    const both = await diagrams({
      "a.hmd": "```d2#show\na -> b\n```\n\ntext\n\n```d2#show\na -> b\n```\n",
    });
    expect(both).toHaveLength(2);
    expect(both[0]!.key).not.toBe(both[1]!.key);
  });

  it("finds the cells of a card with the source a block carries", async () => {
    const text =
      "# T\n\n```d2#show\na -> b\n```\n\n```mermaid\nlisting\n```\n\n```mermaid#show\nflowchart LR\n  a --> b\n```\n";
    const cells = scanDiagramCells(text);
    expect(cells.map((c) => [c.index, c.language, c.openLine, c.closeLine])).toEqual([
      [0, "d2#show", 2, 4],
      [1, "mermaid#show", 10, 13],
    ]);
    const blocks = await diagrams({ "a.hmd": text });
    expect(cells.map((c) => c.source)).toEqual(blocks.map((b) => b.source));
  });

  it("yields no link and no embed from a cell's body", async () => {
    const ir = await render({
      "a.hmd": cell("mermaid#show", "flowchart LR\n  a[\"[[b]]\"] --> c[\"![[b]]\"]"),
      "b.hmd": "# B\n",
    });
    expect(ir.blocks.filter((b) => b.kind === "embed")).toHaveLength(0);
    const [diagram] = ir.blocks.filter((b): b is DiagramBlock => b.kind === "diagram");
    expect(diagram!.source).toContain("[[b]]");
  });
});

describe("sha256", () => {
  it("matches the known digest of the empty string", () => {
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("matches the known digest of 'abc'", () => {
    expect(sha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("handles multi-byte and astral input", () => {
    expect(sha256("héllo 😀")).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256("a".repeat(1000))).toMatch(/^[0-9a-f]{64}$/);
  });
});
