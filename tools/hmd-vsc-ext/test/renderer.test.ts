/**
 * The webview renderer, under jsdom (HMD-0021 Test Plan).
 */

import { MemoryHost, Renderer, Workspace, type DocumentIR } from "@hypermarkdown/core";
import { beforeEach, describe, expect, it } from "vitest";

import {
  collectAnchors,
  lineForOffset,
  offsetForLine,
  patchBlocks,
  renderBreadcrumb,
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
