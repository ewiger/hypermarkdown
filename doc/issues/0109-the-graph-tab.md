# 0109 — The preview shows what links here, but never the shape of the vault

**Column**: doing
**Opened**: 2026-09-14

## What

A **graph** tab in the preview, drawing the vault as a directed graph — cards as
nodes, link and embed edges drawn distinctly — with two scopes, a direction
control for the card scope, a toolbar, and click-to-navigate.

It **replaces** the backlinks tab rather than joining it. Backlinks is one view
of one direction of the graph: the cards with an edge into this one, which is
the card scope pointed downstream. A tab strip carrying both would offer the
same thing twice, and the second spelling would be the one nobody maintains.

## Why now

It is the last milestone the extension's preview label was ever waiting on.
`0.2.0` and `0.3.0` both ship marked `"preview": true` in the manifest, and the
only thing that line still means is that the graph is missing. Everything else
the extension claims to do works and is gated by tests.

The data is already there, on both sides of the contract. `buildGraph` in
`@hypermarkdown/core` emits the same nodes and edges `hmd graph --format json`
emits, from an index the vault maintains anyway, so this is a view over an
existing query rather than a new one.

## Shape

- **Network** scope: every card in the vault.
- **Card** scope: one card and its neighbours, **upstream** (the cards this one
  links to) or **downstream** (the cards that link to it, which is what the
  backlinks tab showed).
- **Clicking a node navigates** — the preview moves to that card and its source
  opens alongside, exactly as clicking a link in the rendered tab already does.
- **Cytoscape.js, bundled.** The webview may not reach a CDN and may not
  evaluate code, so the library is compiled into the extension's own script. The
  layout is recomputed whenever the tab is shown, because `retainContextWhenHidden`
  is off and a hidden webview keeps no state.
- **A toolbar** over the canvas: zoom in and out, fit, re-run the layout, full
  screen, plus the scope and direction controls. A graph is read at the size it
  is drawn and a preview column is narrow, so full screen stands the preview's
  chrome down and `Escape` gives it back.

## Done when

The tab has a record of its own — `HMD-0025`, because a bundled layout engine, a
node cap, and a scope model outgrew a section of the preview surface — the tab
is on `main` and gated by tests, the backlinks tab and its renderer are gone,
and the `preview` flag is out of the manifest.
