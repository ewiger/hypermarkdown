# 0010 — A folder note's Markdown links resolve one directory up

**Column**: done
**Opened**: 2026-11-13
**Found by**: building the HQL site from cards, where every chapter folder of
the book has an `index.hmd`

## What

The MkDocs plugin registers a folder note `a/b/index.hmd` as the page `a/b.md`,
so that it serves at `a/b/` (the URL policy in `urls.py`). Wikilinks are
rewritten for that place, since `href_for` computes from the registered page.
An ordinary relative Markdown link is not. It was written against the file's
own directory, `a/b/`, but MkDocs resolves it from the registered page's
directory, `a/`. Both kinds of Markdown link go wrong:

- **A link to a card.** `[`Bool`](bool.hmd)` in
  `learn/02-data-types/index.hmd` is looked up by `_link_to_cards` from
  `learn/`. There it names nothing, so it is left as `bool.hmd`, and the built
  page links to a source file that is not served.
- **A link to an ordinary page or asset.** `[Reference](../../reference/index.md)`
  in `learn/05-modules/index.hmd` resolves from `learn/` to a path outside the
  docs, and MkDocs reports it at `info` level only.

So a folder note works in the repository and in the editor but not on the
site. The link is correct as written, and the plugin moved the page without
moving its links. A link with code in its text, such as `` [`Bool`](bool.hmd) ``,
is the common case. A wikilink's display text cannot hold a code span
(HMD010), so such a link stays an ordinary Markdown link.

## Expected

On a folder note, every relative Markdown link (inline and reference
definitions, outside code) is resolved from the folder note's own directory,
then rewritten relative to the page it is registered as:

- a link to a `.hmd` card becomes a link to that card's registered page, as
  `_link_to_cards` does today;
- a link to any other file becomes the same file, relative to the registered
  page.

An ordinary card, not a folder note, is unaffected, since its registered page
sits in its own directory.

## Workaround downstream

The HQL repository carries a MkDocs hook,
`contrib/mkdocs/folder_notes.py`, that runs after the plugin and does exactly
this. It is removed once a release carries the fix.

## Release

Ships with 0009 in the same patch release (0.3.1).
