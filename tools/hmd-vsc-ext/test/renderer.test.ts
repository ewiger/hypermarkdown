/**
 * The webview renderer, under jsdom (HMD-0021 Test Plan).
 */

import {
  MemoryHost,
  Renderer,
  Workspace,
  type DiagramBlock,
  type DocumentIR,
} from "@hypermarkdown/core";
import { beforeEach, describe, expect, it } from "vitest";

import {
  collectAnchors,
  lineForOffset,
  markRunning,
  offsetForLine,
  patchBlocks,
  renderBreadcrumb,
  zoomDiagram,
  type Anchor,
} from "../media/render.js";

const settings = { embeds: "expanded" } as const;

async function ir(files: Record<string, string>, path: string): Promise<DocumentIR> {
  const workspace = await Workspace.load(MemoryHost.from(files), {
    autodiscovery: true,
    mode: "both",
    source: null,
  });
  const document = new Renderer(workspace).render(path);
  if (document === null) throw new Error(`no such card: ${path}`);
  return document;
}

const ir_ = (body: string): Promise<DocumentIR> => ir({ "a.hmd": body }, "a.hmd");

let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  container = document.createElement("div");
  document.body.append(container);
});

describe("blocks", () => {
  it("stamps every rendered block with its source line", async () => {
    patchBlocks(container, (await ir({ "a.hmd": "# One\n\npara\n" }, "a.hmd")).blocks, settings);
    const lines = Array.from(container.querySelectorAll("[data-line]")).map(
      (el) => (el as HTMLElement).dataset["line"],
    );
    expect(lines).toContain("1");
    expect(lines).toContain("3");
  });

  it("renders a red link the user can click to create the card", async () => {
    patchBlocks(container, (await ir({ "a.hmd": "see [[nope]]\n" }, "a.hmd")).blocks, settings);
    const link = container.querySelector<HTMLElement>("a.hmd-redlink");
    expect(link).not.toBeNull();
    expect(link!.dataset["hmdTarget"]).toBe("nope");
  });
});

describe("embed cards", () => {
  const tree = {
    "token.hmd": "# Token\n\nA bearer credential.\n",
    "a.hmd": "intro\n\n![[token]]\n",
  };

  it("renders an embed as a card headed by the embedded card's path", async () => {
    patchBlocks(container, (await ir(tree, "a.hmd")).blocks, settings);
    const card = container.querySelector<HTMLElement>("section.hmd-embed");
    expect(card).not.toBeNull();
    const source = card!.querySelector<HTMLElement>(".hmd-embed-source");
    expect(source!.textContent).toBe("token.hmd");
    // The header navigates to the EMBEDDED card, not the embedding one.
    expect(source!.dataset["hmdPath"]).toBe("token.hmd");
  });

  it("renders the embedded body inside the card", async () => {
    patchBlocks(container, (await ir(tree, "a.hmd")).blocks, settings);
    expect(container.querySelector(".hmd-embed-body")!.textContent).toContain(
      "A bearer credential.",
    );
  });

  it("renders a nested embed as a nested card", async () => {
    const nested = {
      "c.hmd": "# C\n\nbottom\n",
      "b.hmd": "# B\n\n![[c]]\n",
      "a.hmd": "![[b]]\n",
    };
    patchBlocks(container, (await ir(nested, "a.hmd")).blocks, settings);
    expect(container.querySelectorAll("section.hmd-embed").length).toBe(2);
  });

  it("renders an unresolved embed as a failure card, never as nothing", async () => {
    patchBlocks(container, (await ir({ "a.hmd": "![[nope]]\n" }, "a.hmd")).blocks, settings);
    const failure = container.querySelector(".hmd-embed-failure");
    expect(failure).not.toBeNull();
    expect(failure!.textContent).toMatch(/HMD001/);
  });

  it("starts collapsed when the setting says so", async () => {
    patchBlocks(container, (await ir(tree, "a.hmd")).blocks, { embeds: "collapsed" });
    expect(container.querySelector(".hmd-embed")!.classList.contains("is-collapsed")).toBe(true);
  });
});

describe("patching", () => {
  it("keeps the element of an untouched block across a re-render", async () => {
    const first = await ir({ "a.hmd": "# One\n\nstable\n" }, "a.hmd");
    patchBlocks(container, first.blocks, settings);
    const before = container.querySelector<HTMLElement>("[data-line='3']");
    before!.setAttribute("data-probe", "kept");

    const second = await ir({ "a.hmd": "# One changed\n\nstable\n" }, "a.hmd");
    patchBlocks(container, second.blocks, settings);

    const after = container.querySelector<HTMLElement>("[data-probe='kept']");
    expect(after).not.toBeNull();
    expect(after!.textContent).toContain("stable");
  });

  it("preserves an embed's collapse state across a re-render", async () => {
    const tree = { "token.hmd": "# T\n\nbody\n", "a.hmd": "intro\n\n![[token]]\n" };
    patchBlocks(container, (await ir(tree, "a.hmd")).blocks, settings);
    const card = container.querySelector<HTMLElement>(".hmd-embed")!;
    card.classList.add("is-collapsed");

    const edited = { ...tree, "a.hmd": "intro edited\n\n![[token]]\n" };
    patchBlocks(container, (await ir(edited, "a.hmd")).blocks, settings);

    expect(container.querySelector(".hmd-embed")!.classList.contains("is-collapsed")).toBe(true);
  });

  it("drops blocks that no longer exist", async () => {
    patchBlocks(container, (await ir({ "a.hmd": "one\n\ntwo\n\nthree\n" }, "a.hmd")).blocks, settings);
    const before = container.children.length;
    patchBlocks(container, (await ir({ "a.hmd": "one\n" }, "a.hmd")).blocks, settings);
    expect(container.children.length).toBeLessThan(before);
    expect(container.textContent).not.toContain("three");
  });

  it("never leaves the panel empty for a card that still has content", async () => {
    patchBlocks(container, (await ir({ "a.hmd": "# H\n\ntext\n" }, "a.hmd")).blocks, settings);
    // A half-typed construct is the ordinary state of a card being edited.
    patchBlocks(container, (await ir({ "a.hmd": "# H\n\ntext [[half\n" }, "a.hmd")).blocks, settings);
    expect(container.textContent!.trim()).not.toBe("");
    expect(container.textContent).toContain("[[half");
  });
});

describe("diagrams", () => {
  const card = "# T\n\n```d2\na -> b\n```\n";

  it("shows the source and the reason when there is no renderer", async () => {
    const ir = await ir_(card);
    // The core never renders; an unrendered diagram is the ordinary state.
    patchBlocks(container, ir.blocks, settings);
    const diagram = container.querySelector<HTMLElement>(".hmd-diagram");
    expect(diagram).not.toBeNull();
    expect(diagram!.classList.contains("is-unrendered")).toBe(true);
    expect(diagram!.textContent).toContain("a -> b");
  });

  it("shows a failure beside the source, not instead of it", async () => {
    const ir = await ir_(card);
    const blocks = ir.blocks.map((b) =>
      b.kind === "diagram" ? { ...b, failure: "d2 exploded" } : b,
    );
    patchBlocks(container, blocks, settings);
    expect(container.textContent).toContain("d2 exploded");
    expect(container.textContent).toContain("a -> b");
  });

  it("renders a data: URI as an image, never as markup", async () => {
    const ir = await ir_(card);
    const evil = `data:image/svg+xml;base64,${btoa("<svg onload=\"alert(1)\"></svg>")}`;
    const blocks = ir.blocks.map((b) => (b.kind === "diagram" ? { ...b, dataUri: evil } : b));
    patchBlocks(container, blocks, settings);

    const image = container.querySelector<HTMLImageElement>("img.hmd-diagram-image");
    expect(image).not.toBeNull();
    expect(image!.getAttribute("src")).toBe(evil);
    // An <img> cannot execute its payload; an inlined <svg> could.
    expect(container.querySelector("svg")).toBeNull();
  });

  it("carries a data-line so a diagram participates in scroll sync", async () => {
    patchBlocks(container, (await ir_(card)).blocks, settings);
    expect(container.querySelector(".hmd-diagram")!.getAttribute("data-line")).toBe("3");
  });
});

describe("diagram cells", () => {
  const card = "# T\n\n```mermaid#show\nflowchart LR\n  a --> b\n```\n";
  const drawing = `data:image/svg+xml;base64,${btoa("<svg/>")}`;

  type Patch = Partial<Pick<DiagramBlock, "dataUri" | "drawnFrom" | "current" | "failure" | "source">>;
  const withState = (document: DocumentIR, patch: Patch): DocumentIR["blocks"] =>
    document.blocks.map((b) => (b.kind === "diagram" ? { ...b, ...patch } : b));
  const cell = (): HTMLElement => container.querySelector<HTMLElement>(".hmd-diagram-cell")!;
  const button = (name: string): HTMLButtonElement | null =>
    cell().querySelector<HTMLButtonElement>(`:scope > .hmd-cell-bar > .hmd-cell-${name}`);

  it("shows the drawing and hides the source", async () => {
    patchBlocks(container, withState(await ir_(card), { dataUri: drawing, current: true }), settings);
    expect(cell().classList.contains("is-current")).toBe(true);
    expect(cell().querySelector("img.hmd-diagram-image")!.getAttribute("src")).toBe(drawing);
    expect(cell().querySelector<HTMLElement>(":scope > .hmd-cell-source")!.hidden).toBe(true);
    expect(cell().querySelector(".hmd-cell-state")!.textContent).toBe("drawn");
    expect(cell().querySelector(".hmd-cell-kind")!.textContent).toBe("mermaid#show");
  });

  it("offers Code, Edit, and Show, and no Run", async () => {
    patchBlocks(container, withState(await ir_(card), { dataUri: drawing, current: true }), settings);
    expect(button("code")).not.toBeNull();
    expect(button("edit")).not.toBeNull();
    expect(button("show")!.textContent).toBe("Show");
    expect(button("run")).toBeNull();
  });

  it("carries what Show sends: the language, and the source in the hidden listing", async () => {
    patchBlocks(container, withState(await ir_(card), { dataUri: drawing, current: true }), settings);
    expect(cell().dataset["language"]).toBe("mermaid#show");
    expect(cell().querySelector(":scope > .hmd-cell-source > code")!.textContent).toBe(
      "flowchart LR\n  a --> b\n",
    );
    // The fence opens on line 3, so Edit goes to line 4.
    expect(cell().dataset["line"]).toBe("3");
  });

  it("keeps the last drawing, marked stale, with the reason under it", async () => {
    patchBlocks(
      container,
      withState(await ir_(card), { dataUri: drawing, current: false, failure: "parse error on line 2" }),
      settings,
    );
    expect(cell().classList.contains("is-stale")).toBe(true);
    expect(cell().querySelector("img.hmd-diagram-image")).not.toBeNull();
    expect(cell().querySelector(".hmd-cell-state")!.textContent).toBe("stale");
    expect(cell().querySelector(".hmd-diagram-notice")!.textContent).toBe("parse error on line 2");
  });

  it("shows the source and the reason when nothing was ever drawn", async () => {
    patchBlocks(
      container,
      withState(await ir_(card), { failure: "no mermaid renderer found" }),
      settings,
    );
    expect(cell().classList.contains("is-none")).toBe(true);
    expect(cell().querySelector("img")).toBeNull();
    expect(cell().querySelector(".hmd-cell-state")!.textContent).toBe("not drawn");
    expect(cell().querySelector(".hmd-diagram-notice")!.textContent).toBe("no mermaid renderer found");
    expect(cell().querySelector(".hmd-diagram-source")!.textContent).toContain("a --> b");
  });

  it("keeps the element and the Code choice when the source is edited", async () => {
    patchBlocks(container, withState(await ir_(card), { dataUri: drawing, current: true }), settings);
    const before = cell();
    before.classList.add("is-code-shown");

    const edited = await ir_(card.replace("a --> b", "a --> c"));
    patchBlocks(container, withState(edited, { dataUri: drawing, current: true }), settings);
    expect(cell()).toBe(before);
    expect(cell().classList.contains("is-code-shown")).toBe(true);
    expect(cell().querySelector<HTMLElement>(":scope > .hmd-cell-source")!.hidden).toBe(false);
    expect(cell().querySelector(":scope > .hmd-cell-source > code")!.textContent).toContain("a --> c");
  });

  it("delivers the drawing as an image, never as markup", async () => {
    const evil = `data:image/svg+xml;base64,${btoa("<svg onload=\"alert(1)\"></svg>")}`;
    patchBlocks(container, withState(await ir_(card), { dataUri: evil, current: true }), settings);
    expect(cell().querySelector("img")!.getAttribute("src")).toBe(evil);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("offers Show inside an embed, where an HQL cell offers no Run", async () => {
    const document = await ir(
      {
        "a.hmd": "![[b]]\n",
        "b.hmd": "# B\n\n```d2#show\nx -> y\n```\n\n```hql#eval\n1\n```\n",
      },
      "a.hmd",
    );
    patchBlocks(container, document.blocks, settings);
    const embedded = container.querySelector<HTMLElement>(".hmd-embed .hmd-diagram-cell")!;
    expect(embedded.querySelector(".hmd-cell-show")).not.toBeNull();
    expect(container.querySelector(".hmd-embed .hmd-cell-run")).toBeNull();
  });

  it("draws a plain `d2` fence without the cell layout", async () => {
    patchBlocks(container, (await ir_("```d2\na -> b\n```\n")).blocks, settings);
    expect(container.querySelector(".hmd-diagram-cell")).toBeNull();
    expect(container.querySelector(".hmd-diagram")).not.toBeNull();
  });

  it("is not marked running when the card's HQL cells run", async () => {
    const document = await ir_(`${card}\n\`\`\`hql#eval\n1\n\`\`\`\n`);
    patchBlocks(container, document.blocks, settings);
    markRunning(container, [-1]);
    expect(cell().classList.contains("is-running")).toBe(false);
    expect(container.querySelector(".hmd-cell[data-kind='cell']")!.classList.contains("is-running")).toBe(true);
  });
});

describe("diagram zoom", () => {
  const drawing = `data:image/svg+xml;base64,${btoa("<svg/>")}`;
  const drawn = async (card: string): Promise<DocumentIR["blocks"]> =>
    (await ir_(card)).blocks.map((b) =>
      b.kind === "diagram" ? { ...b, dataUri: drawing, current: true } : b,
    );
  const view = (): HTMLElement => container.querySelector<HTMLElement>(".hmd-diagram-view")!;
  const image = (): HTMLImageElement => view().querySelector<HTMLImageElement>("img")!;
  const label = (): string => view().querySelector(".hmd-diagram-zoom-reset")!.textContent!;

  for (const [name, card] of [
    ["a Mermaid cell", "```mermaid#show\nflowchart LR\n```\n"],
    ["a D2 cell", "```d2#show\na -> b\n```\n"],
    ["a plain `d2` fence", "```d2\na -> b\n```\n"],
  ] as const) {
    it(`gives ${name} three zoom buttons`, async () => {
      patchBlocks(container, await drawn(card), settings);
      const buttons = Array.from(view().querySelectorAll<HTMLElement>(".hmd-diagram-zoom-button"));
      expect(buttons.map((b) => b.dataset["zoom"])).toEqual(["out", "reset", "in"]);
      expect(buttons.map((b) => b.textContent)).toEqual(["−", "100%", "+"]);
    });
  }

  it("starts at the drawing's own size, with no size of its own", async () => {
    patchBlocks(container, await drawn("```mermaid#show\nflowchart LR\n```\n"), settings);
    expect(view().dataset["zoom"]).toBe("1");
    expect(view().classList.contains("is-zoomed")).toBe(false);
    expect(image().style.width).toBe("");
  });

  it("makes the drawing larger and smaller, and says by how much", async () => {
    patchBlocks(container, await drawn("```mermaid#show\nflowchart LR\n```\n"), settings);
    expect(zoomDiagram(view(), "in")).toBe(1.25);
    expect(image().style.width).toBe("125%");
    expect(image().style.maxWidth).toBe("none");
    expect(label()).toBe("125%");
    expect(view().classList.contains("is-zoomed")).toBe(true);

    zoomDiagram(view(), "out");
    zoomDiagram(view(), "out");
    expect(image().style.width).toBe("80%");
    expect(label()).toBe("80%");
  });

  it("is back at its own size after in then out, and after reset", async () => {
    patchBlocks(container, await drawn("```d2#show\na -> b\n```\n"), settings);
    zoomDiagram(view(), "in");
    expect(zoomDiagram(view(), "out")).toBe(1);
    expect(image().style.width).toBe("");

    zoomDiagram(view(), "in");
    zoomDiagram(view(), "in");
    expect(zoomDiagram(view(), "reset")).toBe(1);
    expect(image().style.width).toBe("");
    expect(image().style.maxWidth).toBe("");
    expect(label()).toBe("100%");
  });

  it("stops at its bounds", async () => {
    patchBlocks(container, await drawn("```d2#show\na -> b\n```\n"), settings);
    for (let i = 0; i < 40; i += 1) zoomDiagram(view(), "in");
    expect(view().dataset["zoom"]).toBe("8");
    for (let i = 0; i < 80; i += 1) zoomDiagram(view(), "out");
    expect(view().dataset["zoom"]).toBe("0.25");
  });

  it("keeps a cell's zoom when its source is edited and drawn again", async () => {
    patchBlocks(container, await drawn("```mermaid#show\nflowchart LR\n```\n"), settings);
    zoomDiagram(view(), "in");
    zoomDiagram(view(), "in");

    patchBlocks(container, await drawn("```mermaid#show\nflowchart TD\n```\n"), settings);
    expect(Number(view().dataset["zoom"])).toBeCloseTo(1.5625);
    expect(image().style.width).toBe("156%");
  });

  it("offers no zoom where nothing is drawn", async () => {
    patchBlocks(container, (await ir_("```mermaid#show\nflowchart LR\n```\n")).blocks, settings);
    expect(container.querySelector(".hmd-diagram-zoom")).toBeNull();
  });
});

describe("breadcrumb", () => {
  it("shows the namespace path and the card name", async () => {
    const document_ = await ir({ "specs/auth/login.hmd": "# Login\n" }, "specs/auth/login.hmd");
    renderBreadcrumb(container, document_);
    expect(container.textContent).toBe("specs/auth/login.hmd");
  });
});

describe("scroll sync", () => {
  const anchors: Anchor[] = [
    { line: 1, top: 0 },
    { line: 11, top: 100 },
    { line: 21, top: 300 },
  ];

  it("is exact at anchors", () => {
    expect(offsetForLine(anchors, 1)).toBe(0);
    expect(offsetForLine(anchors, 11)).toBe(100);
    expect(offsetForLine(anchors, 21)).toBe(300);
  });

  it("interpolates between anchors", () => {
    expect(offsetForLine(anchors, 6)).toBe(50);
    expect(offsetForLine(anchors, 16)).toBe(200);
  });

  it("clamps outside the anchor range", () => {
    expect(offsetForLine(anchors, -5)).toBe(0);
    expect(offsetForLine(anchors, 999)).toBe(300);
  });

  it("is monotonic", () => {
    let previous = -1;
    for (let line = 1; line <= 25; line += 1) {
      const offset = offsetForLine(anchors, line);
      expect(offset).toBeGreaterThanOrEqual(previous);
      previous = offset;
    }
  });

  it("round-trips a line through an offset and back", () => {
    for (const line of [1, 6, 11, 16, 21]) {
      expect(lineForOffset(anchors, offsetForLine(anchors, line))).toBe(line);
    }
  });

  it("returns a safe answer with no anchors at all", () => {
    expect(offsetForLine([], 5)).toBe(0);
    expect(lineForOffset([], 500)).toBe(1);
  });

  it("collects anchors from rendered content in line order", async () => {
    patchBlocks(container, (await ir({ "a.hmd": "# One\n\ntwo\n\n## Three\n" }, "a.hmd")).blocks, settings);
    const collected = collectAnchors(container);
    expect(collected.length).toBeGreaterThan(0);
    expect(collected.map((a) => a.line)).toEqual([...collected.map((a) => a.line)].sort((a, b) => a - b));
  });
});
