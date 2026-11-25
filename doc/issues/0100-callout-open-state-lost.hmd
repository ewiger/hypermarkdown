# 0100 — A `???` callout snaps shut on every re-render

**Column**: todo
**Opened**: 2026-08-07

## Symptom

Open a collapsible callout in the preview, then type anywhere in the same card.
The callout closes. Reproduced under jsdom: it closes even when the card is not
edited at all and the incoming IR is byte-identical.

## Cause

`patchBlocks` reuses an `HtmlBlock`'s element and reassigns its markup only when
the content changed:

```ts
if (element.innerHTML !== block.html) element.innerHTML = block.html;
```

Clicking a `<details>` open makes the browser set its `open` attribute, and that
attribute is reflected in serialisation. So `element.innerHTML` now carries
`open` while `block.html` does not, the equality test fails, `innerHTML` is
reassigned, and the element — with its state — is rebuilt.

The comparison was written to answer "did the author change this block?" and
actually answers "does the DOM differ from the IR?", which is a different
question once the DOM holds user state.

## Why it was missed

VSX-019 is tested, but only for embed cards. Those are structural IR nodes with
their own element, so `patchBlocks` reuses them and the collapse test passes. A
`<details>` lives *inside* an `HtmlBlock`'s opaque markup, where the renderer
has no node identity to preserve — the whole block is one string.

This is the general shape of the problem, not one element's quirk: any
interactive state inside `HtmlBlock.html` is lost the same way. Scroll position
inside a wide table would go too.

## Fix

Options, cheapest first:

1. **Compare against what was last written**, not against live `innerHTML`.
   Store the last applied html on the element (`dataset` or a WeakMap) and skip
   the write when that matches. Fixes every in-block state at once and is a
   few lines.
2. Capture and restore `open` for each `<details>` around the write, keyed by
   its position in the block. Narrow, and does nothing for the next stateful
   element.
3. Give callouts their own IR block kind, as embeds have. Correct, and much more
   than this needs.

Option 1 is the one to take.

## Done when

- Opening a `???` callout and re-rendering an identical IR leaves it open.
- Opening one and editing a *different* block leaves it open.
- Editing the callout's own body may reset it; that is acceptable and should be
  asserted so the boundary is deliberate.
- A regression test covers all three in `test/renderer.test.ts`.
