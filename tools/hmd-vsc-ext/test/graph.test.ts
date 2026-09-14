/**
 * The graph tab's view of the vault (HMD-0025).
 *
 * The cut is taken in the host, so it is testable without a webview, a canvas,
 * or a layout engine: these assert what would be drawn, not what it looks like.
 */

import { MemoryHost, Workspace, buildGraph, type Graph } from "@hypermarkdown/core";
import { describe, expect, it } from "vitest";

import { DEFAULT_GRAPH_VIEW, buildGraphView } from "../src/preview/graphView.js";
import { describe as describeView, elementsOf } from "../media/graph.js";

async function graphOf(files: Record<string, string>): Promise<Graph> {
  const workspace = await Workspace.load(MemoryHost.from(files), {
    autodiscovery: true,
    mode: "both",
    source: null,
  });
  return buildGraph(workspace);
}

/** A hub quoted by one card, linked from another, and linking out to a third. */
const VAULT = {
  "hub.hmd": "# Hub\n\nSee [[outward]].\n",
  "outward.hmd": "# Outward\n",
  "mentions.hmd": "# Mentions\n\nSee [[hub]] and [[hub]] again.\n",
  "quotes.hmd": "# Quotes\n\n![[hub]]\n",
  "island.hmd": "# Island\n",
};

describe("the card scope", () => {
  it("shows what links to the card, which is what backlinks showed", async () => {
    const view = buildGraphView(await graphOf(VAULT), "hub.hmd", DEFAULT_GRAPH_VIEW);

    expect(view.nodes.map((node) => node.path).sort()).toEqual([
      "hub.hmd",
      "mentions.hmd",
      "quotes.hmd",
    ]);
    expect(view.edges.map((edge) => edge.kind).sort()).toEqual(["embed", "link"]);
  });

  it("shows what the card links to when pointed upstream", async () => {
    const view = buildGraphView(await graphOf(VAULT), "hub.hmd", {
      scope: "card",
      direction: "upstream",
    });

    expect(view.nodes.map((node) => node.path).sort()).toEqual(["hub.hmd", "outward.hmd"]);
  });

  it("counts a card linked to four times as one edge", async () => {
    const view = buildGraphView(await graphOf(VAULT), "hub.hmd", DEFAULT_GRAPH_VIEW);
    const fromMentions = view.edges.filter((edge) => edge.source === "mentions.hmd");

    expect(fromMentions.length).toBe(1);
  });

  it("draws the card alone when nothing points at it", async () => {
    const view = buildGraphView(await graphOf(VAULT), "island.hmd", DEFAULT_GRAPH_VIEW);

    expect(view.nodes.map((node) => node.path)).toEqual(["island.hmd"]);
    expect(view.edges).toEqual([]);
  });
});

describe("the network scope", () => {
  const network = { scope: "network", direction: "downstream" } as const;

  it("shows every card in the vault, including the unlinked ones", async () => {
    const view = buildGraphView(await graphOf(VAULT), "hub.hmd", network);

    expect(view.nodes.length).toBe(5);
    expect(view.omitted).toBe(0);
  });

  it("leaves out an unresolved edge, which has no card at the other end", async () => {
    const view = buildGraphView(
      await graphOf({ "a.hmd": "# A\n\nSee [[nowhere]].\n" }),
      "a.hmd",
      network,
    );

    expect(view.nodes.map((node) => node.path)).toEqual(["a.hmd"]);
    expect(view.edges).toEqual([]);
  });

  it("keeps the cards nearest the focused one when the cap bites, and says how many it dropped", async () => {
    const chain: Record<string, string> = {};
    for (let i = 0; i < 10; i += 1) chain[`c${i}.hmd`] = `# C${i}\n\nSee [[c${i + 1}]].\n`;
    chain["c10.hmd"] = "# C10\n";

    const view = buildGraphView(await graphOf(chain), "c0.hmd", network, 3);

    expect(view.nodes.map((node) => node.path).sort()).toEqual(["c0.hmd", "c1.hmd", "c2.hmd"]);
    expect(view.omitted).toBe(8);
  });
});

describe("what the view says about itself", () => {
  it("names the shape it is showing and what it left out", () => {
    expect(
      describeView({
        view: { scope: "network", direction: "downstream" },
        focus: "hub.hmd",
        nodes: [{ path: "hub.hmd", label: "hub" }],
        edges: [],
        omitted: 12,
      }),
    ).toBe("1 card — the whole vault, nearest this one. 12 further cards are not drawn.");

    expect(
      describeView({
        view: DEFAULT_GRAPH_VIEW,
        focus: "hub.hmd",
        nodes: [
          { path: "hub.hmd", label: "hub" },
          { path: "mentions.hmd", label: "mentions" },
        ],
        edges: [],
        omitted: 0,
      }),
    ).toBe("2 cards — what links to this card.");
  });
});

describe("the elements handed to the layout", () => {
  it("marks the focused card and carries each edge's kind", async () => {
    const elements = elementsOf(
      buildGraphView(await graphOf(VAULT), "hub.hmd", DEFAULT_GRAPH_VIEW),
    );

    const hub = elements.find((element) => element.data.id === "hub.hmd");
    expect(hub?.data["focus"]).toBe("yes");
    expect(elements.filter((element) => element.group === "edges").length).toBe(2);
    expect(elements.some((element) => element.data["kind"] === "embed")).toBe(true);
  });
});
