# Roadmap

## News and updates

**2026-10-19 — HQL 0.4.2.** The query language is released as a separate
project: `cargo install hql`, release binaries for Linux and macOS,
documentation at [hql.hypermarkdown.org](https://hql.hypermarkdown.org/). It queries a vault with
lexical and semantic search and graph traversal, and also JSON and YAML.
Inside a card it runs as cells; `hql render` writes their output into the
page.

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
| **`hql`** — the query language, a sibling project | 0.4.2 | [crates.io](https://crates.io/crates/hql), [releases](https://github.com/ewiger/hql/releases) |

The **HMD language specification** versions independently of the tools, and
**HQL** versions in [its own repository](https://github.com/ewiger/hql): a
release there never implies one here.

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
- **Query** a vault with [HQL](https://hql.hypermarkdown.org/): filter, sort, lexical and semantic
  search, graph traversal. A separate project.

The specification is a 0.1 draft and will change before 1.0. The documentation
is being written alongside it.

## What is coming

### Cards as notebooks

[HQL](https://hql.hypermarkdown.org/) is a statically typed query and data transformation language
and a separate project. Inside a `.hmd` file it runs as **cells**: fences
marked `hql#eval` or `hql#query`. A fence marked plain `hql` is a listing,
shown as code and never run. `id=<name>` makes a cell's value available to other
cells; `hidden` evaluates a cell without printing its output. Cells run in
dependency order, and `hql render` writes each cell's output into the page.
[Cell output](cell-output.md) lists what each kind of value becomes:

````markdown
```hql#eval id=books hidden
cards | filter(c => c.metadata.category == "book")
```

## Still to read

```hql#eval
books | filter(c => c.metadata.status == "todo") | map(c => c.title)
```
````

This works today from the command line. Planned on the HyperMarkDown side are
cells for the content a wiki otherwise maintains by hand:

- **Table of contents.** Generated for a card, a folder, or the whole vault,
  ordered by frontmatter.
- **Related pages.** Backlinks, outgoing links, cards sharing a tag, and
  semantic neighbours.
- **Status and roadmap.** A table of every card's `status` field. All open
  items across a set of trackers. A kanban board from a folder of issue cards.
- **Indexes.** All cards with a given tag. A glossary from named definition
  blocks. Cards changed in a given period.
- **Health.** Orphan cards. Red links grouped by source card. Cells whose
  output is older than their inputs.
- **Summaries.** A generated, cached one-line abstract per card, for use in
  indexes.

Next in the VS Code extension: cards as notebooks. The preview shows each
cell's saved output, keeps the query behind a **Code** toggle, and runs a cell
when you press **Run**. An `hql#query` cell is `hql#eval hidden`: it computes a
value for other cells and shows nothing. Also planned: cells in the MkDocs build.
Cell output is stored in the file, so a card renders without HQL installed.

HQL is at major version 0. A minor release may change the language.

### Linking across repositories

Today a name resolves inside one tree. The plan is for separately published
collections to name each other, so a card in your vault can point into someone
else's. The argument is in [Vision](vision.md).

### Your editor, not just VS Code

The same diagnostics and navigation, in any editor that speaks the language
server protocol.

---

No dates on this page. It is what we intend to build next, in rough order.
