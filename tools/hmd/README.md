<div align="center">

<img src="https://raw.githubusercontent.com/ewiger/hypermarkdown/main/doc/wiki/assets/logo.png" width="76" height="76" alt="">

# HyperMarkDown

**The Python implementation, and the `hmd` command**

[![PyPI](https://img.shields.io/pypi/v/hypermarkdown.svg)](https://pypi.org/project/hypermarkdown/)
[![Python versions](https://img.shields.io/pypi/pyversions/hypermarkdown?color=blue&label=python)](https://pypi.org/project/hypermarkdown/)
[![CI](https://github.com/ewiger/hypermarkdown/actions/workflows/ci.yml/badge.svg)](https://github.com/ewiger/hypermarkdown/actions/workflows/ci.yml)
[![Documentation](https://img.shields.io/badge/docs-hypermarkdown.org-ffb300)](https://hypermarkdown.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd/LICENSE)

</div>

HyperMarkDown (`.hmd`) is ordinary GitHub-flavored markdown plus the part HTML
had on its first day: a link that means something, a page that can be made out
of other pages, a document that is part of a web rather than a file in a folder.
Every `.md` file is already valid `.hmd`, so a tree is adopted one rename at a
time.

This distribution is the **canonical implementation** of that format. It ships
three things:

- **`hmd`**, a command line tool — lint a tree of cards, render one, dump the
  link graph.
- **the library under it** — scanner, resolver, embed expander, and renderer,
  importable as `hypermarkdown`.
- **a MkDocs plugin**, installed with the `mkdocs` extra, which builds a tree of
  cards into a website.

There is a second implementation in TypeScript for editors. Where the two
disagree about a case the shared conformance corpus covers, **this one defines
the answer**.

The format itself — every construct, the resolution algorithm, the rule IDs — is
documented at **[hypermarkdown.org](https://hypermarkdown.org/)**. This page
is about the tool.

## Install

```bash
pip install HyperMarkDown            # or: uv pip install HyperMarkDown
pip install "HyperMarkDown[mkdocs]"  # with the site builder
```

Python 3.11 through 3.14.

## Sixty seconds

Point `hmd` at a tree of cards and lint it:

```bash
hmd lint --root path/to/your/wiki
```

```text
glossary/index.hmd:11:3: warning[HMD001] [[idempotency]] does not resolve to a page

0 error(s), 1 warning(s)
```

Exit codes are pinned for CI: `0` clean, `1` diagnostics, `2` usage error. Add
`--strict` to fail on warnings, `--format json` for machine-readable output.

That output is
[`examples/small/`](https://github.com/ewiger/hypermarkdown/tree/main/examples/small),
a runnable wiki that exercises the spine walk, both import forms, `use`
inheritance, folder notes, and most of the syntax. It lints with zero errors and
exactly one deliberate warning — the red link above, showing what an unwritten
page looks like. The fixture travels in the repository rather than in the
distribution, so try it from a clone:

```bash
git clone https://github.com/ewiger/hypermarkdown
hmd lint --root hypermarkdown/examples/small
```

## The card it is reading

```markdown
---
tags: [area/auth, status/accepted]
use: [autodiscovery]
import:
  - from /shared import tokens as shared-tokens
  - from /glossary import *
---

# Login

- `[[tokens]]` → the sibling card, found on the spine
- `[[shared-tokens]]` → `shared/tokens.hmd`, a named import under an alias
- `[[token]]` → `glossary/token.hmd`, via the imported search path

See [[shared-tokens#Rotation|the rotation window]], and embed one block rather
than restating it:

![[token#^definition]]
```

Six constructs are what the format adds — wikilinks, aliased links, heading
links, block anchors, block references, and the three embed forms. Four
frontmatter keys mean something to this tool: `tags`, `use`, `import`, and `nav`.
Every other key is yours, and nothing will inspect it.

## Commands

| Command | What it does |
| --- | --- |
| `hmd init` | Write `.hmd/config.toml` and create the namespace root it names |
| `hmd lint` | Parse, resolve, and report — `HMD001`–`HMD017`, text or JSON |
| `hmd render` | Expand embeds and rewrite links, to flat markdown or HTML |
| `hmd graph` | Dump the resolved link graph as JSON |
| `hmd info` | Show the resolved root and discovery policy |
| `hmd --version` | Print the installed version |

Every command but `init` takes `--root` to override the namespace root, which
otherwise comes from the `wiki` setting in `.hmd/config.toml` (defaulting to
`doc/wiki`). A `.hmd/` directory doubles as the project root marker, so any
subtree can be self-contained.

```bash
hmd init                    # here; the namespace is named after the directory
hmd init path/to/project --wiki notes --name shared
```

`init` writes every setting at its default rather than leaving them implicit —
the file is where you find out which keys exist. It creates the wiki root
alongside the config, since a `wiki` setting pointing at nothing is an error
every later command reports. It refuses to replace a config it did not write;
`--force` overrides that.

The `[namespace]` section names this tree so another project can bind to it and
address a card as `name:card`. `--name` defaults to the project directory's own
name, repaired into that address form if it has to be — a folder called
`My Notes` becomes `My-Notes`. A `--name` you pass is validated instead of
repaired, because a name you typed is a request rather than a guess. Nothing
reads either key yet: binding is specified and not implemented, so the section
records intent.

`hmd render --to markdown` is **one-way** on purpose. Flattening a card erases
the embed boundary and the provenance of every link, which is right for
something you are shipping and wrong for something you are still editing.

## The linter refuses to guess

A wiki that guesses is a wiki that quietly rots, because a link that silently
changes meaning is indistinguishable from one that did not:

```text
specs/auth/login.hmd:14:5: error[HMD002] [[tokens]] matches 2 pages; qualify it
  (candidates: shared/tokens.hmd, specs/auth/tokens.hmd)
```

The distinction it draws is a compiler's. A link to a page you have not written
yet is a **warning** — writing forward is how a wiki grows, so it renders as a
red link instead of breaking the build. A malformed link or multiple
autodiscovery matches is an **error**. Ordered wildcard imports instead use
declaration precedence and report shadowing as HMD016.

Resolution runs in phases and stops at the first hit: explicit imports, then the
**spine** — this folder, then each folder above it, probed without recursion —
then imported search paths, then one sweep of the whole tree. A bare name
is a one-segment reference such as `[[tokens]]`; `[[shared/tokens]]` is an
unqualified path, not a bare name. The spine never searches sideways, but if
the earlier phases miss, autodiscovery may resolve a unique card elsewhere in
the namespace. Use `[[/shared/tokens]]` to make that dependency explicit.

## Publish it: a book with a wiki in it

The `mkdocs` extra registers a plugin through the `mkdocs.plugins` entry point.
It registers `.hmd` files as pages, derives the nav from the namespace tree,
expands embeds, and rewrites every wikilink to a source-relative link that
MkDocs resolves and validates itself:

```bash
pip install "HyperMarkDown[mkdocs]"
mkdocs build --strict     # or: mkdocs serve
```

The namespace does not have to be the whole site, and a wiki on its own is not
the interesting case — a **book with a wiki inside it** is. Point `docs_dir` at a
documentation tree and `root` at the part of it that is a namespace: the book is
hand-ordered markdown, the wiki is generated, and `hmd://wiki` says where the
generated section belongs in your nav.

```yaml
# mkdocs.yml
docs_dir: doc
plugins:
  - HyperMarkDown:
      root: doc/wiki        # only this subtree is a namespace
exclude_docs: |
  *.hmd

nav:
  - Home: index.md
  - Introduction: public/introduction.md
  - Wiki:
      - Overview: wiki/README.md
      - hmd://wiki          # ← the derived section lands here
```

An authored nav wins everywhere except where it names the wiki. Omit the
placeholder and your nav is used verbatim; omit `nav` entirely and the whole
thing is derived from the namespace tree. A card at `a/b.hmd` serves at `a/b/`,
and so does a folder note at `a/b/index.hmd` — two names for one page, one URL.
Unresolved links render red rather than failing the build, so a wiki stays
publishable while it is still being written.

Publication is opt-in: `nav: {visibility: public}` is what puts a card on the
site, it inherits down a subtree from a folder note, and the default is private.
The failure mode is a missing page, never an unintended one.

[hypermarkdown.org](https://hypermarkdown.org/) is that build, from this
repository's own `doc/` tree.

## Math, diagrams, callouts

TeX mathematics, D2 diagrams, callouts, tables, task lists, footnotes,
strikethrough. None of these are HyperMarkDown's own — they are the tier the
wider markdown world settled on, and both `hmd render --to html` and the site
build assume them present.

Diagrams go through the [`d2`](https://d2lang.com) binary, which is deliberately
*not* a Python dependency: without it a diagram degrades to its own labelled
source rather than failing the build.

## The library

```python
from pathlib import Path

from hypermarkdown import Workspace, config
from hypermarkdown.lint import check

workspace = Workspace(config.load(root_override=Path("doc/wiki")))
for diagnostic in check(workspace):
    print(diagnostic.path, diagnostic.rule, diagnostic.message)
```

`parse`, `resolve`, `embed`, `urls`, and `lint` do not import MkDocs — the
plugin is one file, `mkdocs_plugin.py`, and swapping the renderer is that file
plus a `mkdocs.yml` rather than a re-specification. Every entry point that
ingests a document takes the document's *text*, not only a path, because the
language server this package will grow serves buffers that have never been
saved.

## Versioning

Semantic, with the usual `0.x` caveat made explicit: **the format itself may
change between minor versions.** Until `1.0`, treat a minor bump as potentially
breaking for `.hmd` sources, not only for the Python API. What each release
changed, and what is deliberately not implemented, is in
[CHANGELOG.md](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd/CHANGELOG.md).

## Development

This tool is `tools/hmd/` in the
[HyperMarkDown monorepo](https://github.com/ewiger/hypermarkdown), whose root
is a uv workspace:

```bash
git clone https://github.com/ewiger/hypermarkdown
cd HyperMarkDown
uv sync --locked
uv run python -m pytest
```

Build the wheel with `uv build --package HyperMarkDown` — the `--package` flag
is load-bearing, since a bare `uv build` at a workspace root produces an empty
`unknown-0.0.0` and exits zero.

- **[tools/hmd/DEVELOP.md](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd/DEVELOP.md)**
  — this tool's own guide: the test loop, the gates, dependency policy,
  packaging, and how a release is cut.
- **[DEVELOP.md](https://github.com/ewiger/hypermarkdown/blob/main/DEVELOP.md)**
  — the repository's: the layout, how the documentation tree is organised, where
  progress is tracked, and how the site is published.

## License

MIT — see [LICENSE](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd/LICENSE).
