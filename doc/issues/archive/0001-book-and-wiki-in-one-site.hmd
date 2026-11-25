# 0001 — Book and wiki in one site

**Column**: done
**Opened**: 2026-08-07
**Closed**: 2026-08-07

## What

A HyperMarkDown site should be a *book* with a *wiki* section in it, not a wiki
alone. Two pieces are missing:

1. **A restricted namespace.** `docs_dir` covers the whole `doc/` tree while the
   `[[…]]` namespace stays restricted to `doc/wiki`. Everything else under
   `doc/` — the book, the proposals — builds as ordinary MkDocs pages and is
   reachable by ordinary relative links.
2. **Placing the derived wiki nav inside an authored nav.** Today the plugin
   derives the whole nav or none of it. A book has a hand-written nav and needs
   to say *where* the generated wiki section goes.

## Why

This is the integration the format was for: namespaces give the wiki its
structure, and the book gives a reader somewhere to start. A wiki with no
entrance is a graph you have to already understand.

## Done when

- `docs_dir: doc` with the namespace root at `doc/wiki` builds, and cards serve
  under `/wiki/`.
- An authored `nav` can name the spot the derived wiki section is spliced into.
- `doc/public/` holds a short book explaining the format, and its nav ends in
  the wiki section.
- `mkdocs build --strict` stays green.

No proposal. This is ordinary feature work against HMD-0002 §2.
