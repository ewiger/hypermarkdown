# 0106 — There is no way to search the wiki from the preview

**Column**: backlog
**Opened**: 2026-08-08

## What

A search header in the preview's chrome, searching the whole knowledge base
rather than the open card, with results navigating the preview to the card
they name.

## Why it is not urgent

The preview already answers *what points at this card* — backlinks, and the
graph tab when E6 lands. Search answers a different question, *where did I
write that*, and that question only becomes hard at a scale this knowledge
base has not reached. Until then `Ctrl+Shift+F` over the workspace is a
worse-looking answer that works.

It is worth recording now because the design questions below are the kind that
get decided badly under pressure, and because the answer to the third one may
be that the feature costs almost nothing.

## Open design questions

These are why this needs a specification of its own rather than an
implementation.

- **What is indexed.** Card paths and titles only, headings as well, or body
  text? Body text is the useful answer and the expensive one: the store
  reparses on every keystroke, so a body-text index is rebuilt on a clock the
  preview already shares.
- **Where it lives.** In `@hypermarkdown/core`, where it would be
  language-neutral and covered by the conformance corpus like every other
  semantic — or extension-only UI, on the grounds that search is a reading
  affordance and not part of the format.
- **What draws it.** A field in `.hmd-chrome`, or a native
  `window.showQuickPick`. The native one is far cheaper and inherits fuzzy
  matching, keyboard handling, and theming — but it is not "a search header in
  the preview", and a quick-pick that vanishes on `Escape` is a different
  interaction from a results list you can read while browsing.
- **Ranking**, and whether a match is highlighted in the rendered card once
  the preview navigates to it.

## Done when

`HMD-0023` is drafted and accepted. This card is a placeholder for a decision,
not for code; implementation gets its own issue once the proposal exists.
