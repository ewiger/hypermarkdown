# Roadmap

## News and updates

**2026-11-25 — HyperMarkDown 0.1.1.** A patch to the
[specification](../wiki/hmd-lang-spec.hmd): it now says what a vault is, the
directory where a namespace is stored. No construct changes.

**2026-11-25 — HyperMarkDown 0.1.0, and every tool with it.** The first
release of the [specification](../wiki/hmd-lang-spec.hmd).

One change to make first: in `.hmd/config.toml`, rename `wiki` to
`location_path`. A configuration that still sets `wiki` is refused, and
nothing is read. The default is now the vault itself, not `doc/wiki`, so if
your cards live in `doc/wiki`, write `location_path = "doc/wiki"`.

The tools follow the specification: `hmd` 0.5.0, `@hypermarkdown/core` 0.4.0,
the VS Code extension 0.6.0, the Rust crate `hypermarkdown` 0.3.0, and
`hmd-semantics` 0.2.0. Headings in any script can be linked, names and
extensions are case-sensitive everywhere, and a backslash in a link is an
error.

HQL 0.8.0 reads `location_path` too, so its cells and `hql render` work on
the same vaults.

**2026-11-22 — VS Code extension 0.5.2, HQL 0.7.2.** HQL ships a Windows
binary, and the extension's Windows builds bring their own `hql`: cells run
with nothing on `PATH`. A card's path reads `books/owl.hmd` on every system.
Only Linux ARM64 still needs `hql` on `PATH`.

**2026-11-13 — VS Code extension 0.4.3.** Ships with
[`hql`](https://hql-lang.org/) 0.6.0. Plain Markdown links in the preview,
`[bar](../foo/bar.md)`, now open what they point at.

**2026-10-26 — VS Code extension 0.4.2.** Ships with
[`hql`](https://hql-lang.org/) 0.5.2. A cell that fails to run now says why again.

**2026-10-19 — VS Code extension 0.4.1.** Cards are notebooks. The preview shows
each HQL cell's saved output, keeps the query behind a **Code** toggle, and runs
a cell when you press **Run**. The extension brings its own
[`hql`](https://hql-lang.org/) on Linux x64 and macOS; elsewhere, put
`hql` on `PATH`.

**2026-10-19 — HQL 0.4.2.** The query language is released as a separate
project: `cargo install hql`, release binaries for Linux and macOS,
documentation at [hql-lang.org](https://hql-lang.org/). It queries a vault with
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
| **HyperMarkDown**, the language | 0.1.1 | [specification](../wiki/hmd-lang-spec.hmd) |
| **`hmd`** — CLI, library, MkDocs plugin | 0.5.0 | [PyPI](https://pypi.org/project/hypermarkdown/) |
| **`@hypermarkdown/core`** — TypeScript | 0.4.0 | [npm](https://www.npmjs.com/package/@hypermarkdown/core) |
| **`hypermarkdown`** — Rust resolver | 0.3.0 | [crates.io](https://crates.io/crates/hypermarkdown) |
| **`hmd-semantics`** — semantic index | 0.2.0 | [PyPI](https://pypi.org/project/hypermarkdown-semantics/) |
| **`hmd-vsc-ext`** — VS Code | 0.6.0 | [Marketplace](https://marketplace.visualstudio.com/items?itemName=hypermarkdown.hmd), [Open VSX](https://open-vsx.org/extension/hypermarkdown/hmd) |
| **`hql`** — the Hyper Query Language | 0.8.0 | [crates.io](https://crates.io/crates/hql), [releases](https://github.com/ewiger/hql/releases) |

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
- **Run HQL cells** in the VS Code preview: see each cell's output, show its
  query, run it. [Cell output](cell-output.md) lists what a cell writes.
- **Publish** a tree of cards as a site. This one is built that way.
- **Query** a vault with [HQL](https://hql-lang.org/): filter, sort, lexical and semantic
  search, graph traversal. A separate project.

The specification is at 0.1.1. A later 0.x version may still change a
construct; 1.0 will promise that none changes.

## What is coming

### Where the work goes

HyperMarkDown's own work has two priorities.

- **The language specification.** Its first version, 0.1.0, is released.
  Next is 1.0, the version that promises stability.
- **The VS Code extension.** Bug fixes, and improvements to how a card is
  presented in the preview.

AI and querying the knowledge graph are built in
[HQL](https://hql-lang.org/): semantic retrieval, graph traversal, and
assembling context for a language model from a vault of cards. HQL is a
separate project with its own releases, and most of what changes next for
someone using HyperMarkDown arrives through it. HyperMarkDown follows by
running the newer HQL in the editor and presenting what its cells return.

### Cards as notebooks

[HQL](https://hql-lang.org/) is a strongly typed expression and query language
and a separate project. Inside a `.hmd` file it runs as **cells**: fences
marked `hql#eval` or `hql#query`. A fence marked plain `hql` is a listing,
shown as code and never run. `id=<name>` makes a cell's value available to other
cells; `hidden` evaluates a cell without printing its output. Only a fence
marked `hql#eval` or `hql#query` is a cell. Cells run in dependency order, and
`hql render` writes each cell's output into the page.
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

The VS Code preview runs cells as of extension 0.4.1. An `hql#query` cell is
`hql#eval hidden`: it computes a value for other cells and shows nothing. Next:
cells in the MkDocs build.
Cell output is stored in the file, so a card renders without HQL installed.

HQL is at major version 0. A minor release may change the language.

### Linking across repositories

Today a name resolves inside one tree. The plan is for separately published
collections to name each other, so a card in your vault can point into someone
else's. The argument is in [Vision](vision.hmd).

### Your editor, not just VS Code

The same diagnostics and navigation, in any editor that speaks the language
server protocol.

---

No dates on this page. It is what we intend to build next, in rough order.
