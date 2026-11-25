# 0002 — Markdown links to `.hmd` files 404 on the site

**Column**: done
**Opened**: 2026-08-07
**Closed**: 2026-08-07
**Found by**: clicking through the served site

## Symptom

From the Wiki overview page, the link to the HyperMarkDown card went to
`/wiki/hypermarkdown.hmd` and 404'd.

## Cause

A page *outside* the namespace cannot use `[[wikilinks]]`, so it links to a card
the only way it can — an ordinary relative markdown link to the real file:

```markdown
see [hypermarkdown.hmd](hypermarkdown.hmd) for the format itself
```

That path is correct in the repository, and it is what makes the link work when
someone browses the tree on GitHub. But the site excludes `.hmd` sources
(`exclude_docs`), and the plugin only rewrote `[[…]]`. The link therefore
pointed at a file the site does not serve.

Three links were affected, all of them 404s:

| Page | Link |
| --- | --- |
| `doc/wiki/README.md` | `hypermarkdown.hmd` |
| `doc/proposals/HMD-0001/README.md` | `../../wiki/hypermarkdown.hmd` |
| `doc/proposals/HMD-0002/README.md` | `../../wiki/md-hmd-interop.hmd` |

MkDocs did report each one as `contains a link to '…' which is excluded from the
built site`, at INFO level. That is exactly the kind of message a green
`--strict` build trains you to scroll past.

## Fix

The plugin now rewrites ordinary markdown links whose target is a card, on every
page — book, proposal, or card. The author keeps writing the real path, which
works in the repository, and the build points it at the rendered page.

Masked with the scanner first, so a `.hmd` path quoted inside a code fence is
left alone — `HMD-0001` has several.

## Done when

- Every link in the table above resolves to a page on the built site.
- A `.hmd` path inside a fence is not rewritten.
- `mkdocs build --strict` reports no excluded-link messages for cards.
