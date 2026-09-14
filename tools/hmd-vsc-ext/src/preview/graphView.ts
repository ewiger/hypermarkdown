/**
 * The vault graph, cut down to what one view draws (HMD-0025).
 *
 * A pure function of the core's `Graph`, so the whole of what the graph tab
 * shows can be asserted in a unit test without a webview, a layout engine, or
 * a running editor. The webview receives nodes and edges and draws them; it
 * never decides which ones it is entitled to.
 */

import { SUFFIX, type Graph } from "@hypermarkdown/core";

import type { GraphPayload, GraphView, GraphViewEdge, GraphViewNode } from "../protocol.js";

/**
 * How many cards the network scope draws before it starts leaving some out.
 *
 * A force-directed layout over a few thousand nodes is not a picture of a
 * knowledge base, it is a hairball that costs a second of the main thread every
 * time the tab is shown. The cap keeps the cards nearest the one being read and
 * says how many it dropped, which is a view the reader can act on — unlike a
 * complete one they cannot see.
 */
export const MAX_GRAPH_NODES = 400;

/** The view a preview opens on: bounded, and what backlinks used to show. */
export const DEFAULT_GRAPH_VIEW: GraphView = { scope: "card", direction: "downstream" };

interface ResolvedEdge {
  source: string;
  target: string;
  kind: "link" | "embed";
}

/** Separator for the deduplication key: the one byte a path cannot carry. */
const KEY_SEP = String.fromCharCode(0);

/**
 * Build the payload for one view of one vault's graph.
 *
 * Unresolved edges are left out. A red link has no card at the other end, so
 * there is no node to draw it to; the rendered tab is where a broken link is
 * reported, and the graph is a picture of what resolved.
 */
export function buildGraphView(
  graph: Graph,
  focus: string | null,
  view: GraphView,
  cap: number = MAX_GRAPH_NODES,
): GraphPayload {
  const known = new Set(graph.nodes.map((node) => node.path));
  const edges = resolvedEdges(graph, known);

  const kept =
    view.scope === "card"
      ? neighbourhood(focus, edges, view.direction)
      : nearest(
          graph.nodes.map((node) => node.path),
          focus,
          edges,
          cap,
        );

  const nodes: GraphViewNode[] = graph.nodes
    .filter((node) => kept.has(node.path))
    .map((node) => ({ path: node.path, label: labelFor(node.path) }));

  const drawn: GraphViewEdge[] = edges.filter(
    (edge) => kept.has(edge.source) && kept.has(edge.target),
  );

  const omitted = view.scope === "card" ? 0 : graph.nodes.length - nodes.length;
  return { view, focus, nodes, edges: drawn, omitted };
}

/** Resolved edges between two cards that are both in the index, deduplicated. */
function resolvedEdges(graph: Graph, known: Set<string>): ResolvedEdge[] {
  const seen = new Set<string>();
  const out: ResolvedEdge[] = [];
  for (const edge of graph.edges) {
    const target = edge.target;
    if (target === null || !known.has(target) || !known.has(edge.source)) continue;
    // A card that links to the same card four times is one edge. The count is a
    // fact about the prose, not about the shape of the knowledge base.
    const key = [edge.source, target, edge.kind].join(KEY_SEP);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ source: edge.source, target, kind: edge.kind });
  }
  return out;
}

/** The focused card and the cards one hop away in the chosen direction. */
function neighbourhood(
  focus: string | null,
  edges: readonly ResolvedEdge[],
  direction: "upstream" | "downstream",
): Set<string> {
  if (focus === null) return new Set();
  const kept = new Set([focus]);
  for (const edge of edges) {
    if (direction === "upstream" && edge.source === focus) kept.add(edge.target);
    if (direction === "downstream" && edge.target === focus) kept.add(edge.source);
  }
  return kept;
}

/**
 * Every card, or the `cap` nearest the focused one.
 *
 * Distance is measured with the edges undirected: a card that quotes the one
 * being read is as near it as one it quotes, and the reader asked for a
 * neighbourhood rather than for a direction.
 */
function nearest(
  paths: readonly string[],
  focus: string | null,
  edges: readonly ResolvedEdge[],
  cap: number,
): Set<string> {
  if (paths.length <= cap) return new Set(paths);
  if (focus === null || !paths.includes(focus)) return new Set(paths.slice(0, cap));

  const adjacency = new Map<string, string[]>();
  const link = (from: string, to: string): void => {
    const list = adjacency.get(from);
    if (list === undefined) adjacency.set(from, [to]);
    else list.push(to);
  };
  for (const edge of edges) {
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }

  const kept = new Set([focus]);
  const queue = [focus];
  for (let head = 0; head < queue.length && kept.size < cap; head += 1) {
    for (const next of adjacency.get(queue[head]!) ?? []) {
      if (kept.has(next)) continue;
      kept.add(next);
      queue.push(next);
      if (kept.size >= cap) break;
    }
  }

  // A vault is rarely one component, so fill the remainder in path order: a
  // view that stopped at the focused card's component would be silently
  // limited to whatever happens to be reachable from where the reader stands.
  for (const path of paths) {
    if (kept.size >= cap) break;
    kept.add(path);
  }
  return kept;
}

function labelFor(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.endsWith(SUFFIX) ? name.slice(0, -SUFFIX.length) : name;
}
