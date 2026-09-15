# Roadmap

## News and updates

**2026-09-14 — `hmd` 0.3.0, VS Code extension 0.3.0.** The extension leaves
preview. It adds a graph view of your vault, replacing the backlinks tab.

**2026-08-10 — `@hypermarkdown/core` 0.1.1 on npm.** The format in TypeScript —
parser, resolver, renderer. It renders the extension's preview pane as you
type; the preview needs no Python.

| | Version | Install from |
| --- | --- | --- |
| **HyperMarkDown**, the language | 0.1 draft | [specification](../wiki/hmd-lang-spec.hmd) |
| **`hmd`** — CLI, library, MkDocs plugin | 0.3.0 | [PyPI](https://pypi.org/project/hypermarkdown/) |
| **`@hypermarkdown/core`** — TypeScript | 0.1.1 | [npm](https://www.npmjs.com/package/@hypermarkdown/core) |
| **`hmd-vsc-ext`** — VS Code | 0.3.0 | [Marketplace](https://marketplace.visualstudio.com/items?itemName=hypermarkdown.hmd), [Open VSX](https://open-vsx.org/extension/hypermarkdown/hmd) |

The **HMD language specification** versions independently of the tools.

## What works today

Released and out of preview. Installing is the [Quick start](../tools/index.md).

- **Write** `.hmd` cards — CommonMark, plus wikilinks, transclusion, tables,
  callouts, footnotes, TeX, and D2 diagrams.
- **Link by name.** `[[card]]`, `[[card#Section]]`, `[[card#^block]]`. No paths.
- **Embed** any of those with `![[...]]` and compose documents out of documents.
- **Lint a tree** with `hmd lint` — broken links, ambiguous names, malformed
  references.
- **Render** a card to Markdown or HTML, or dump the resolved graph.
- **Preview live** in VS Code, with a graph of the vault, red links for pages
  you have not written yet, and diagnostics inline.
- **Publish** a tree of cards as a site. This one is built that way.

The specification is a 0.1 draft and will change before 1.0. The documentation
is being written alongside it.

## What is coming

### Semantic search

Ask a question in plain language and get back the cards that are *about* it,
not the cards that happen to share a word.

It searches cards, not folders. Each card is summarised twice — a one-line
abstract for finding it, a longer summary for judging whether it is the one you
want — and your card itself is always what you end up reading. The summaries are
generated, hidden, and disposable.

### HQL

[HQL](https://github.com/ewiger/hql) is a query language for your cards: their
contents, their metadata, and the links between them. Semantic search is one
thing you can do with it. Start loose, then follow exact links:

```hql
cards
| semantic("bearer token authorization")
| take(5)
| graph(depth = 1)
```

Syntax is illustrative. HQL is early and does not read HyperMarkDown yet.

### Linking across repositories

Today a name resolves inside one tree. The plan is for separately published
collections to name each other, so a card in your vault can point into someone
else's. The argument is in [Vision](vision.md).

### Your editor, not just VS Code

The same diagnostics and navigation, in any editor that speaks the language
server protocol.

---

No dates on this page. It is what we intend to build next, in rough order.
