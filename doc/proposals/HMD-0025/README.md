# HMD-0025: The graph tab — the vault as a picture

**Status**: drafted
**Created**: 2026-09-14
**Source**: [HyperMarkDown in the editor — Requirements](../../models/requirements/vscode-extension.md)

## Abstract

This record defines the graph tab of the HyperMarkDown preview: a directed graph
of one vault, drawn inside the webview, with cards as nodes and resolved link
and embed edges between them. It fixes two scopes — the whole network, and one
card with its neighbours in a chosen direction — the rule that unresolved edges
are not drawn and repeated edges of one kind collapse to one, a node cap of 400
with a nearest-first rule for choosing which cards survive it, click-to-navigate
behaviour identical to a link in the rendered card, a toolbar of zoom, fit,
relayout, and full screen, the division of labour that puts the cut in the
extension host and only the drawing in the webview, and Cytoscape.js compiled
into the webview bundle because the preview's content security policy forbids
both remote script and `eval`. It **replaces** the backlinks tab, whose list of
inbound cards is the card scope pointed at what links here. The message envelope
between host and webview, the policy the drawing runs under, and the tab strip
itself belong to the preview surface record and are unchanged.

## Motivation

The preview answers *what does this card say* and *what points at it*. It has
never answered *what does this knowledge base look like*, and that question is
the one a wiki exists to make answerable — a vault is a shape, and a list of
inbound links is a keyhole view of it.

- **Backlinks was the same answer, listed.** A list of the cards with an edge
  into this one is the card scope pointed downstream. Two surfaces offering one
  answer is not twice the feature; it is a second spelling that falls behind the
  first.
- **The data was already there.** The index keeps nodes and edges, and the CLI
  already emits them as JSON. Drawing them is a view over a query the system
  runs anyway, not a new traversal of the tree.
- **The preview label was waiting on this.** The extension has shipped marked a
  preview release since its first version, and the graph is the milestone that
  line has always named.

**The risk this record must not defer** is the one a graph view invites: an
unbounded picture. A force-directed layout over a few thousand nodes is not a
picture of a knowledge base, it is a hairball that costs a second of the main
thread every time the tab is shown, and it arrives exactly when the vault is
large enough for the feature to matter. The cap below is normative for that
reason.

## Goals

- One picture of a vault that a reader can navigate by clicking.
- A bounded cost on every vault, stated in the record rather than left to a
  setting nobody will find.
- A cut that is decided where the index lives, so what would be drawn is
  assertable without a canvas.

## Non-goals

- **The mind map**, which remains deferred under the preview surface record's
  tab contract.
- **Editing from the graph.** Nothing here writes a card, moves one, or creates
  an edge. Dragging a node moves it on screen and means nothing to the vault.
- **Crossing a vault boundary.** Two vaults are two namespaces, and a graph
  spanning both would draw a knowledge base that does not exist.
- **A graph of anything but cards.** Headings, tags, and blocks are not nodes.

## Specification

### What is drawn

The graph is one vault's cards and the resolved edges between them.

- Each node MUST be a card in the index of the vault that claims the card being
  previewed, identified by its path inside that vault and labelled with its file
  name without the suffix.
- Each edge MUST be a resolved reference from one indexed card to another,
  carrying its kind: `link` for a `[[wikilink]]`, `embed` for a `![[embed]]`.
- An edge whose target does not resolve MUST NOT be drawn. There is no card at
  the other end to draw it to, and a broken link is already reported in the
  rendered card and in the Problems panel, which is where a work item belongs.
- Repeated edges between the same pair of cards with the same kind MUST collapse
  to one. How many times one card mentions another is a fact about its prose,
  not about the shape of the knowledge base.
- Link and embed edges MUST be drawn distinguishably. "This card is quoted here"
  and "this card is mentioned here" are different facts, and the distinction the
  backlinks list made by grouping, the graph makes by drawing.
- The card being previewed MUST be marked. A picture centred on a card the
  reader cannot find in it is a picture of somewhere else.

### Scopes and direction

Two scopes, because *what surrounds this card* and *what does this vault look
like* are different questions asked at different moments.

```text
scope=card    direction=downstream   focus + every card with an edge into it
scope=card    direction=upstream     focus + every card it has an edge into
scope=network direction=(ignored)    every card in the vault, capped
```

- The tab MUST offer both scopes and both directions, and a preview MUST open on
  `scope=card`, `direction=downstream`. That is what the retired backlinks tab
  showed, and it is bounded by the focused card's degree rather than by the size
  of the vault.
- The card scope MUST reach exactly one hop. A depth control is a second
  unbounded axis over the same data the network scope already offers whole.
- In the network scope the direction control MUST be disabled rather than
  hidden. A control that vanishes moves the toolbar under the reader's cursor;
  a disabled one says the same thing and stays where it was.
- When the focused card has no resolved edges in the chosen direction, the tab
  MUST draw that card alone rather than an empty canvas.

### The node cap

The network scope is bounded by the record, not by configuration.

- cap: `400` cards

- The network scope MUST draw at most the cap. Past it, the cards nearest the
  focused card MUST be kept, distance measured breadth-first over the edges
  taken as **undirected** — a card that quotes the one being read is as near it
  as one it quotes, and the reader asked for a neighbourhood, not a direction.
- When the nearest-first walk exhausts the focused card's component before the
  cap is full, the remainder MUST be filled in path order. A vault is rarely one
  component, and a view silently limited to what happens to be reachable from
  where the reader stands is a lie about the vault.
- A view that dropped cards MUST say how many. A reader can act on a bounded
  view that names what it left out, and cannot act on a complete one they cannot
  see.
- Below the canvas the tab MUST state what is on screen: how many cards, which
  shape, and what was omitted.

### Navigating

- Clicking a node MUST move the preview to that card and open its source
  alongside, exactly as clicking a link in the rendered card does. Nodes are the
  same affordance as links and MUST behave like them.
- Navigation MUST go through the same host message a rendered link uses, so the
  path is validated at the message boundary like any other, and a node click can
  never name a file outside the vault.

### The toolbar

The controls are the ones a graph view is expected to have; none of them is
invented here.

- The toolbar MUST carry the scope and direction controls, zoom in, zoom out,
  fit to the view, and re-run the layout.
- The toolbar MUST carry a **full screen** toggle that gives the graph the whole
  panel by standing the preview's chrome down, and MUST leave full screen on
  `Escape`. A graph is read at the size it is drawn and a preview column is
  narrow, so the tab that most needs room is the one that has least of it.
- Full screen MUST be confined to the webview: the tab MUST NOT rearrange the
  editor's groups. The webview can promise what it owns, and a control that
  maximised an editor group would be lying about its state the moment a reader
  moved the groups by hand.
- Entering or leaving full screen MUST refit the graph, since the container
  changed size under a canvas that learns about it only when told.

### Where the work happens

The cut is taken in the extension host; the webview draws what it is given.

- The host MUST decide which cards and edges are in the picture, as a pure
  function of the index's node and edge lists, the focused card, and the chosen
  view. What would be drawn is then assertable in a unit test with no webview,
  no canvas, and no layout engine.
- The webview MUST NOT decide what it is entitled to see. It receives nodes and
  edges and draws them; it never queries the index, which it cannot reach.
- Changing scope or direction MUST ask the host for a new cut rather than
  filtering a cached whole vault in the webview. The card scope then costs a
  payload proportional to one card's degree, which is what makes the default
  view cheap on a vault of any size.

### Drawing

- The graph MUST be drawn with **Cytoscape.js**, compiled into the webview
  bundle. The preview's policy forbids remote script and `eval` alike, so a CDN
  copy and a runtime loader are equally unavailable, and the tab MUST work with
  no network at all. This costs roughly 400 KB in the package.
- D2 MUST NOT be used for this. It renders static SVG on the host and is the
  right tool for a diagram in a card; it is the wrong one for click-to-navigate
  exploration.
- Colours MUST come from the editor's own theme variables, read from the
  document each time the graph is drawn. A canvas cannot inherit a CSS variable
  the way the rest of the webview does, so a graph that hard-coded its palette
  would be the one surface in the preview that ignores the theme.
- The layout MUST be recomputed whenever the tab is shown: the preview does not
  retain webview context when hidden, and a container that was hidden has no
  size to lay anything out in.
- The layout MUST NOT be recomputed when a message redraws the same set of
  cards. A keystroke in the editor is enough to send one, and re-laying out an
  unchanged graph throws away a viewport the reader arranged.

## Backwards Compatibility

The backlinks tab and its renderer are removed, and with them the `backlinks`
message and the `backlinks` preview mode. Nothing outside the extension consumed
either: the message envelope is internal to the preview, versioned by the IR
version the two sides already agree on, and a webview restored from an older
build renames itself on the first message it receives. A persisted preview mode
naming the retired tab is rejected at the message boundary like any other
unknown value, and the preview falls back to the rendered card.

The core's backlinks query is untouched and remains part of the format
implementation's API.

## Security Considerations

The graph adds no new capability to the webview and no new reachable path.

- A node click produces the same navigation message a rendered link produces,
  validated against the same rule: a path that leaves the namespace root is
  rejected at the boundary, and the renderer only ever sends paths the core
  produced.
- The library is compiled into the extension's own script and runs under the
  existing nonce. The policy is unchanged, and in particular no `connect-src` is
  granted: the graph cannot reach the network.
- Card paths are drawn as **text** in node labels. A card named to look like
  markup is a label that says so, and never markup.
- The node cap is a resource bound as well as a legibility rule: it caps the
  work a cloned repository can ask the layout engine to do, whatever its size.

## Deployment / Activation

1. The host-side cut lands with its unit tests, drawing nothing.
2. The tab replaces the backlinks tab in the same change — the message, the
   mode, the renderer, and the tab strip entry go together, so no build ships a
   strip with two names for one answer.
3. The by-hand checks in the extension's developer guide are run against a real
   vault; nothing automated can say whether a layout is legible.
4. The `preview` flag comes off the manifest and the gallery copy, which is the
   milestone this record closes.

## Reference Implementation

- `tools/hmd-vsc-ext/src/preview/graphView.ts` — the cut: scopes, direction,
  edge resolution and deduplication, and the nearest-first cap.
- `tools/hmd-vsc-ext/src/preview/controller.ts` — view state per preview, and
  the graph message.
- `tools/hmd-vsc-ext/src/preview/html.ts` — the tab strip entry, the canvas, and
  the toolbar.
- `tools/hmd-vsc-ext/media/graph.ts` — Cytoscape, the stylesheet in theme
  variables, click handling, full screen.
- `tools/hmd-vsc-ext/src/vault.ts` — the vault's graph, off the index it keeps.

## Test Plan

Unit tests MUST include:

- The card scope pointed downstream holds exactly the cards with an edge in, and
  pointed upstream exactly the cards it links to.
- An unresolved edge is absent, and its dangling target is not a node.
- Repeated edges of one kind between one pair collapse to one.
- A network scope past the cap keeps the cards nearest the focused one and
  reports how many it dropped.
- A card with no resolved edges draws as itself alone.
- The shell carries the canvas, the note, and every toolbar control the tab
  wires itself to, so a renamed class is a failing test rather than a tab that
  silently never draws.
- The tab strip carries the tabs the build has and no others.

Integration tests SHOULD include, once the suite runs in CI:

- Opening the graph on a fixture card and clicking a node moves the preview to
  that card and opens its source in another column.

```bash
npm run -w tools/hmd-vsc-ext typecheck
npm run -w tools/hmd-vsc-ext test
npm run -w tools/hmd-vsc-ext build
```

## Open Questions

- Should the graph filter by namespace and tag, as the requirements ask? The
  index carries both on every node, and the question is what a filtered view
  does to the cap — whether it filters before the cap or after it, which are
  different pictures.
- Should a card with no resolved edges in either direction be reported as such
  somewhere other than the graph? The graph shows an island, which is honest and
  easy to miss.

## See also

- [HMD-0021](../HMD-0021/README.md) — the preview surface: the tab strip, the
  host/webview message envelope, and the content security policy this tab draws
  under.
- [HMD-0020](../HMD-0020/README.md) — the format implementation whose index
  supplies the nodes and edges.
- [`doc/status/vsc-ext.md`](../../status/vsc-ext.md) — where this work is
  tracked.

## Changelog

- 2026-09-14: drafted, from the implementation rather than ahead of it. The
  graph tab began as an outline inside the preview surface record; a bundled
  layout engine, a node cap, a scope and direction model, and a full-screen mode
  are a design of their own, and a record they share with the whole preview is a
  record where they cannot be found. See issue 0109.
