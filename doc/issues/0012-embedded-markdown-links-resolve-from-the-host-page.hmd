# 0012 — An embedded card's Markdown links resolve from the host page

**Column**: todo
**Opened**: 2026-11-13
**Found by**: fixing issue 0010, which moves a folder note's ordinary links in
one pass over the expanded page

## What

Embed expansion is textual: `![[part]]` is replaced by the bytes of `part`.
A wikilink inside those bytes is resolved from the card it was written in and
rewritten for the page being built. An ordinary relative Markdown link is plain
text to the expander, so it arrives in the host page as written, and is then
resolved from the host's directory instead of the embedded card's.

With `index.hmd` at the root embedding `sub/part.hmd`, which holds
`[notes](notes.md) ![chart](chart.png) [one](one.hmd)`:

| Link in `sub/part.hmd` | On `part`'s own page | Embedded in the home page |
| --- | --- | --- |
| `[notes](notes.md)` | `../notes/`, correct | `notes.md`, a file that is not there |
| `![chart](chart.png)` | `../chart.png`, correct | `chart.png`, a broken image |
| `[one](one.hmd)` | `../one/`, correct | `one.hmd`, a source file that is not served |

The link is right when host and embedded card share a directory, and wrong
otherwise. MkDocs reports the missing targets at `info` level only, so a
`--strict` build stays green.

`hmd render` flattens a card the same way and writes the same paths, relative
to the wrong file.

## Expected

An ordinary relative link in embedded content names the same file it named in
the card it was written in:

- in the MkDocs plugin, it is resolved from the embedded card's directory and
  rewritten for the host's registered page, as a wikilink already is;
- in `hmd render`, it is rewritten relative to the card being rendered.

Inline links, images, and reference definitions are covered, outside code. A
link in the host's own text is unaffected.

## Where to work

`expand` in `tools/hmd/src/hypermarkdown/embed.py` knows which card each region
came from; `_relink` in `mkdocs_plugin.py` knows how to move a link from one
directory to another, and runs after expansion, when that knowledge is gone.
The move has to happen per region, during expansion, or the expander has to
hand back where each region came from.

A reference definition needs a decision: two embedded cards may define the
same label with different targets, and the flattened page keeps only one.

## Other implementations

The TypeScript core renders embeds as nested regions rather than flattening
them. Whether the preview resolves a click inside an embed from the embedded
card or from the host is not checked yet, and belongs to this issue.
