# Quick start

Two installs, and neither one needs the other. The **VS Code extension** renders
a card while you write it. The **`hmd` command** checks a whole tree of them and
publishes it. Take either, or both — the usual shape is the extension while
writing and the CLI in CI.

Neither one teaches the format. The [Tutorial](../wiki/hmd-tutorial.hmd) is that,
and it is the whole language in one sitting. This page is only how to get the
tools running.

## 1. The editor

[Install from the VS Marketplace](https://marketplace.visualstudio.com/items?itemName=hypermarkdown.hmd){ .md-button .md-button--primary }
[Open VSX](https://open-vsx.org/extension/hypermarkdown/hmd){ .md-button }

```
ext install hypermarkdown.hmd
```

Stock VS Code installs from the marketplace; Cursor, Windsurf, and VSCodium from
Open VSX. Then open any `.hmd` file and click the ⚡ at the top right of the
editor — source on the left, the rendered card on the right, keeping up as you
type, with embeds still visible as embeds and a link to nothing in red.

**Nothing else has to be installed.** The extension carries its own
implementation of the format — parser, resolver, and renderer, in TypeScript,
running inside the editor — so there is no interpreter to find and no subprocess
between a keystroke and the preview. It is a preview release; what it does, and
what it does not do yet, is [The VS Code extension](vscode.md).

## 2. The command line

```bash
pip install HyperMarkDown            # or: uv pip install HyperMarkDown
```

Python 3.11 through 3.14. Point it at a tree of cards:

```bash
hmd lint --root path/to/your/wiki
```

```text
glossary/index.hmd:11:3: warning[HMD001] [[idempotency]] does not resolve to a page

0 error(s), 1 warning(s)
```

A link to a page you have not written yet is a **warning**, because writing
forward is how a wiki grows; a malformed reference or a name that matches two
cards is an **error**. Exit codes are pinned for CI — `0` clean, `1`
diagnostics, `2` usage error — with `--strict` to fail on warnings and
`--format json` for machine-readable output.

Four more commands round it out: `hmd render` flattens a card to markdown or
HTML with its embeds expanded, `hmd graph` dumps the resolved link graph, and
`hmd info` reports which root and discovery policy it settled on. To stop
passing `--root`, run `hmd init` at the top of your project:

```bash
hmd init                    # or: hmd init --wiki notes --name shared
```

That writes `.hmd/config.toml` with every setting at its default and creates the
namespace root it names. The directory doubles as the root marker, so any
subtree can be self-contained — `hmd init` inside one is how you make it so.

It also names the tree, in a `[namespace]` section, after the project directory
unless you say otherwise. A project's own namespace is otherwise unnamed, and
[naming it](../public/namespaces.md) is what would let another project bind to
it — reserved today, so the section records intent and changes nothing.

Nothing to try it on yet? The repository carries a small runnable wiki that
exercises the spine walk, both import forms, folder notes, and most of the
syntax. It lints with zero errors and exactly one deliberate warning — the red
link above, showing what an unwritten page looks like:

```bash
git clone https://github.com/ewiger/hypermarkdown
hmd lint --root hypermarkdown/examples/cs-alg-sorting
```

## 3. Publish it, if you want a site

The site builder ships as an extra, and registers itself with MkDocs:

```bash
pip install "HyperMarkDown[mkdocs]"
```

```yaml
# mkdocs.yml
docs_dir: doc
plugins:
  - hypermarkdown:
      root: doc/wiki        # only this subtree is a namespace
exclude_docs: |
  *.hmd

nav:
  - Home: index.md
  - Wiki:
      - Overview: wiki/README.md
      - hmd://wiki          # ← the generated section lands here
```

```bash
mkdocs serve
```

Point `docs_dir` at a documentation tree and `root` at the part of it that is a
namespace: the rest is hand-ordered markdown, the cards are generated, and
`hmd://wiki` says where the generated section belongs in your nav. The site you
are reading is that build, from this project's own `doc/` tree.

D2 diagrams are the one thing with an outside dependency. A `d2` fence draws
when [`d2`](https://d2lang.com) is on your `PATH` or Docker is available, and
shows its own labelled source when neither is — a diagram never degrades to a
blank space.

## Where to go next

- **[Tutorial](../wiki/hmd-tutorial.hmd)** — the whole language in one sitting,
  every construct with its source shown beside what it renders.
- **[The VS Code extension](vscode.md)** — what the preview gives you, and the
  gaps that still carry a *preview* flag.
- **[Presentation](../public/presentation.md)** — the trade-offs between
  rendering a card in an editor, converting it, and publishing a tree of them.
- **[Language Specification](../wiki/hmd-lang-spec.hmd)** — the normative text,
  once you need the exact answer rather than the teaching one.
