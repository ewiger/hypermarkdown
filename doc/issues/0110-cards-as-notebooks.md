# 0110 — HQL cells show as code, and their saved output shows its markers

**Column**: doing
**Opened**: 2026-10-19

## What

A card carrying HQL cells should read like a notebook in the preview: the
output a cell last saved, rendered like the rest of the card, with the query
behind a **Code** toggle and **Edit** and **Run** beside it. Today the preview
draws a cell as a code block and draws its saved output's
`<!-- hql:output -->` markers as literal text.

Which fences run is part of the work, because `hql render` answers it
differently from what a card needs:

- `hql#eval` — a cell whose output is saved in the card.
- `hql#query` — `hql#eval hidden`: it computes a value for other cells and
  shows nothing.
- `hql` — a listing, shown as code and never run.

## Why now

HQL 0.4.2 shipped cells, shared values between them, hashed saved outputs, and
a JSON interface for an editor to drive. The extension is the missing host.

## Shape

- Opening a card runs nothing; the saved output is what it shows. A badge says
  whether that output came from the code as it stands.
- Run hands the open buffer to `hql render --emit after --envelope json`, refuses
  an answer whose cells and hashes disagree with the card's, and writes the
  outputs back as one undoable edit — in the bytes `hql render` would write.
- Runs need a trusted workspace. `hql` comes from `hyperMarkdown.hql.path`, a
  bundled binary, or `PATH`.

## Done when

The record is `HMD-0026`, the cells render and run on `main` with tests against
the real binary, `examples/notebook/` exercises every fence kind, and the
by-hand pass in the extension's `DEVELOP.md` has been made in a running editor.
