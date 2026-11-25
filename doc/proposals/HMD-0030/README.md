# HMD-0030: Diagram cells

**Status**: drafted
**Created**: 2026-11-22
**Source**: the decision, taken while preparing the specification's 0.1
release, that diagrams are cells

## Abstract

A fence whose info string opens `d2#show` or `mermaid#show` is a **diagram
cell**. The preview draws it the way it draws an `hql#eval` cell: the picture
first, the source behind a **Code** toggle, and an **Edit** button beside it.
Where an HQL cell has **Run**, a diagram cell has **Show**. A diagram cell is
drawn when the card opens. After its source is edited it keeps its last
drawing, marked stale, until the reader presses Show. The drawing lives in the
preview only; nothing is written into the card. A plain `d2` or `mermaid`
fence becomes a **listing**, shown as code, exactly as a plain `hql` fence is.
The document IR's `DiagramBlock` gains a staleness state and moves to version
4.

## Motivation

- **One rule for every fence that does something.** A card already has
  fences that run (`hql#eval`, `hql#query`) and a fence that is only shown
  (`hql`). Diagrams were the exception: any `d2` fence drew, so a card could
  not show D2 source as an example without it turning into a picture. Diagram
  cells put diagrams under the same rule as HQL.
- **A reader wants the picture; an author wants the source.** The notebook
  layout already solves this for HQL: answer first, code one click away. A
  diagram is the same shape of thing.
- **Mermaid cannot be drawn on every keystroke.** Its reference renderer
  drives a headless browser, and a cold start does not fit the two-second
  bound D2 meets. Drawing on open and on Show, and never while typing, keeps
  the preview responsive whichever renderer Mermaid ends up with.

**What this must not break.** A card with diagram cells renders completely
with no renderer installed: each cell shows its source and says why it is not
drawn.

## Goals

- `d2#show` and `mermaid#show` behave like HQL cells in the preview, with Show
  in place of Run.
- No renderer starts while the reader types.
- The card stays text: showing a diagram never edits the file.

## Non-goals

- **Saving drawings in the card.** HMD-0022 dropped committed diagram
  artifacts as more machinery than the problem has, and this record keeps that
  decision.
- **Choosing Mermaid's renderer.** That choice, its bounds, and its security
  settings belong to the Mermaid card. Until it is made, a `mermaid#show` cell
  shows its source and says no renderer is available.
- **Interactive diagrams.** A drawing still reaches the page as an image, so
  links and click handlers inside it do nothing.
- **New diagram languages.** Only `d2` and `mermaid` get a `#show` kind.

## Specification

### Which fences are diagram cells

A fence's kind is the first word of its info string, as for HQL cells.

| Kind | What it is | What the preview draws |
| --- | --- | --- |
| `d2#show` | a diagram cell in D2 | the drawing, source hidden |
| `mermaid#show` | a diagram cell in Mermaid | the drawing, source hidden |
| `d2`, `mermaid` | a listing | the source, as a code block |

- A fence whose kind is `d2#show` or `mermaid#show` MUST be a diagram cell, and
  no other fence MUST be. Matching is exact and case-sensitive, as it is for
  HQL cells. `D2#show` is a listing.
- A plain `d2` or `mermaid` fence MUST NOT be drawn. It is how a card shows
  diagram source as text, the way a plain `hql` fence shows a query.
- The words after the kind are reserved. This record gives none of them a
  meaning, and an implementation MUST ignore them.
- A diagram cell's body is opaque to the resolver. It yields no link, no
  embed, no anchor, and no graph edge, as every fence body does.
- A diagram cell is not an HQL cell. It takes no HQL cell number, has no `id`
  other cells can read, and the mask HMD-0026 applies before handing a card to
  `hql` leaves it untouched.

````markdown
```d2#show
client -> server: request
```

```d2
client -> server: request
```
````

The first is drawn; the second is shown as code.

### When a diagram cell is drawn

A cell is drawn when the card is shown, and again when the reader asks.

- When the preview first shows a card, it MUST draw each diagram cell whose
  renderer is available, within the bounds of HMD-0022. A drawing already in
  the cache is used without starting a renderer.
- When a cell's source changes, the preview MUST NOT start a renderer. If the
  new source is in the cache — after an undo, say — that drawing is shown and
  the cell is current. Otherwise the last drawing stays on screen, marked
  **stale**.
- **Show** draws the cell's current source and replaces its drawing. It is
  also how a reader retries after a timeout or a failure.
- A cell whose source has never been drawn, and is not in the cache, is **not
  drawn**, with the reason: no renderer, a syntax error, a timeout, or a
  source over the size bound.

The cache is HMD-0022's: in memory, keyed by source, bounded to 64 entries,
least recently used evicted.

### What the preview draws

The layout is HMD-0026's, with Show in place of Run.

- By default the preview MUST show the drawing and hide the source.
- A **Code** toggle shows the source in the preview, read-only. The reader's
  choice MUST survive a redraw and an edit, and MUST be forgotten when the
  preview closes.
- **Edit** moves the editor to the first line of the cell's source.
- **Show** is offered on every diagram cell, including one drawn inside an
  embed. Unlike Run, Show writes nothing, so drawing another card's diagram
  touches no file.
- A small bar names the kind and the state — drawn, stale, not drawn,
  drawing — and stays quiet until hovered, unless the cell is stale or not
  drawn.
- While a cell is drawing, its Show button is disabled.

In the editor, each diagram cell carries a **Show diagram** code lens, and the
command *Show Diagram* draws the cell under the cursor.

### Trust and processes

Drawing keeps HMD-0022's rules, because the process and its input are the
same.

- Drawing MUST NOT require a trusted workspace. The renderer gets the fence
  body on standard input and nothing else: no path, no workspace, no
  environment from the card.
- The drawing MUST reach the page as a `data:` URI image and MUST NOT be
  inserted as markup.

### The document IR

`DiagramBlock` keeps its fields and gains the cell's state.

```text
DiagramBlock := {
  kind:      "diagram"
  key:       string        // "diagram:#" + index among the card's diagram cells
  language:  string        // "d2#show" | "mermaid#show"
  source:    string        // the fence body, verbatim
  dataUri:   string | null // the drawing on screen, filled by the consumer
  drawnFrom: string | null // diagramKey of the source dataUri was drawn from
  current:   boolean       // drawnFrom == diagramKey(source)
  failure:   string | null // why there is no drawing
  span:      Span
}
```

- `IR_VERSION` becomes **4**. A webview that receives another version refuses
  to render and asks for a reload.
- The key is the cell's position among diagram cells, not its content. Editing
  a cell would otherwise give it a new key, and the reader's Code toggle and
  the stale drawing would be lost with it.
- The core still renders nothing. It recognises the cell and carries its
  source; the consumer fills `dataUri`, `drawnFrom`, `current`, and `failure`.

### The site build

The canonical implementation follows the same fence rule.

- A site build MUST draw `d2#show` cells, with the renderer and bounds it uses
  today, and MUST render a plain `d2` fence as a code block. `mermaid#show`
  draws once the Mermaid renderer is chosen.
- How a built page shows a diagram cell's source is an open question below.
  Until it is answered, the page shows the drawing only, as it does today.

## Backwards Compatibility

- **Every plain `d2` fence stops drawing.** This is the cost of the listing
  rule, and it is accepted. In this repository about eighteen fences, in the
  book, the wiki, the README, and two example vaults, are rewritten as
  `d2#show` in the same change that turns the rule on.
- **A Mermaid block written for GitHub, GitLab, or Obsidian shows as code
  here.** Those tools draw a plain `mermaid` fence; this format draws only
  `mermaid#show`. A card brought in from elsewhere needs its fences renamed to
  draw.
- **HQL's `mermaid` format step writes a plain `mermaid` fence**, which becomes
  a listing. HQL is asked to write `mermaid#show`.
- **`IR_VERSION` moves from 3 to 4.** A stale webview shows the reload message.
- No card changes on disk because of this record. Showing a diagram never
  writes.

## Security Considerations

Nothing new runs, and nothing runs on new input.

- The renderer and its input are HMD-0022's: the fence body on standard
  input, an image back, bounded in size and time, killed on timeout.
- Show adds no new process; it starts the same render the preview already
  starts on open, at a moment the reader chose.
- Show writes nothing, so it needs no trust check and is safe inside an embed.
- The drawing is still an image, so no script, link, or handler in diagram
  source reaches the webview.

## Deployment / Activation

1. In both implementations, recognise `d2#show` as a diagram, beside plain
   `d2`. Both still draw, so nothing breaks.
2. Rewrite every `d2` fence in this repository as `d2#show`.
3. In one release of each tool, turn plain `d2` into a listing, and land the
   preview's cell layout, Show, the stale state, and `IR_VERSION` 4. State the
   change in each changelog, with the one-line migration: rename the fence.
4. Add `mermaid#show` to the recognised kinds. It shows its source until the
   Mermaid renderer lands.
5. Ask HQL to write `mermaid#show` from its `mermaid` step.

## Reference Implementation

```text
tools/hmd-ts-core/src/
  diagram/fence.ts         the kinds: d2#show, mermaid#show; plain d2 is code
  ir.ts                    DiagramBlock gains drawnFrom and current; IR_VERSION 4
  render.ts                the ordinal key among the card's diagram cells
tools/hmd-vsc-ext/
  src/preview/controller.ts  draw on open, keep the stale drawing on edit, Show
  src/protocol.ts          showDiagram
  media/render.ts          the cell: drawing, Code, Edit, Show, state
tools/hmd/src/hypermarkdown/
  diagram.py               LANGUAGES matches d2#show; plain d2 is a code block
```

## Test Plan

Unit tests MUST include:

- `d2#show` and `mermaid#show` are diagram cells; `d2`, `mermaid`, `D2#show`,
  and every other kind are not.
- A diagram cell takes no HQL cell number and is untouched by the HQL mask.
- A diagram cell's body yields no link and no edge.
- On first render the cell is drawn; after an edit no renderer starts and the
  cell is stale; after an undo to a cached source it is current again without
  a render.
- Show replaces the drawing and clears stale; a failed draw keeps the reason.
- The Code toggle survives an edit and a redraw.
- Show is offered inside an embed, and Run is still not.
- The key of a diagram cell does not change when its source does.

Integration tests MUST include:

- A site build of a card with a `d2#show` cell and a plain `d2` fence draws
  the first and shows the second as code.

```bash
npm run -w tools/hmd-ts-core test
npm run -w tools/hmd-vsc-ext test
uv run python -m pytest tools/hmd/tests/test_diagram.py
```

## Open Questions

- Should a plain `d2` or `mermaid` fence raise a diagnostic suggesting
  `#show`? It would ease migration for vaults outside this repository, but it
  needs a new rule identifier from the canonical implementation, and it would
  fire on every deliberate listing.
- How does a built site page show a diagram cell's source: never, below the
  drawing, or behind a toggle as the preview does? The same question is open
  for HQL cells.
- Should the cover's live editor draw a diagram cell, or keep showing it as
  text as it does today?
- Should Show also exist as *Show All Diagrams* for a card, the way Run has
  *Run All*?

## Changelog

- 2026-11-22: drafted.

## See also

- [HMD-0026](../HMD-0026/README.md) — HQL cells: the layout, the Code toggle,
  Edit, and the listing rule this record extends to diagrams.
- [HMD-0022](../HMD-0022/README.md) — the diagram block, the renderer, its
  bounds, its cache, and its image delivery, all kept here.
- [The Mermaid card](../../issues/0115-mermaid-diagrams-on-par-with-d2.hmd) —
  the Mermaid renderer, still to be chosen.
