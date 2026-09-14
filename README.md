<div align="center">

<img src="https://raw.githubusercontent.com/ewiger/hypermarkdown/main/doc/wiki/assets/logo.png" width="76" height="76" alt="">

# HyperMarkDown

**Build your own local wiki knowledge base**

[![Documentation](https://img.shields.io/badge/docs-hypermarkdown.org-ffb300)](https://hypermarkdown.org/)
[![Spec](https://img.shields.io/badge/spec-0.1-blue)](https://hypermarkdown.org/wiki/hmd-lang-spec/)
[![CI](https://github.com/ewiger/hypermarkdown/actions/workflows/ci.yml/badge.svg)](https://github.com/ewiger/hypermarkdown/actions/workflows/ci.yml)
[![Code: MIT](https://img.shields.io/badge/code-MIT-yellow.svg)](LICENSE)
[![Docs: CC BY 4.0](https://img.shields.io/badge/docs-CC%20BY%204.0-ef9421.svg)](LICENSE-DOCS)

</div>

📖 **[hypermarkdown.org](https://hypermarkdown.org/) — the documentation.**
What the format is, why it exists, and every construct in it. Start there.

HyperMarkDown (`.hmd`) is ordinary markdown plus links to knowledge graph: you
write the *name* of a card and it is resolved for you, a card can be built out of
other cards, and a linter checks the whole graph. Every `.md` file is already
valid `.hmd`, so a tree is adopted one rename at a time.

```markdown
See [[tokens#Rotation|the rotation window]], and say it once rather than twice:

![[tokens#^definition]]
```

This repository is both halves of the project: 
- the **language** — its
specification, the records that argue it, and the website they are published as 
- and the **tools** that implement it, one package each under `tools/`.

## The tools

Each carries its own version, README, changelog, and license.

### [`hmd`](tools/hmd/) — the CLI, the library, the MkDocs plugin

[![PyPI](https://img.shields.io/pypi/v/hypermarkdown.svg)](https://pypi.org/project/hypermarkdown/)
[![Python versions](https://img.shields.io/pypi/pyversions/hypermarkdown?color=blue&label=python)](https://pypi.org/project/hypermarkdown/)
[![Changelog](https://img.shields.io/badge/changelog-tools%2Fhmd-informational)](tools/hmd/CHANGELOG.md)

The Python line, published to PyPI as
[`hypermarkdown`](https://pypi.org/project/hypermarkdown/): the `hmd` command
(`lint`, `render`, `graph`), the library under it, and a MkDocs plugin that
builds a tree of cards into a website. **Canonical** — where two implementations
disagree, this one defines the answer. It will also host the language server.

### [`@hypermarkdown/core`](tools/hmd-ts-core/) — the TypeScript implementation

[![npm](https://img.shields.io/npm/v/%40hypermarkdown%2Fcore.svg?color=cb3837&label=npm)](https://www.npmjs.com/package/@hypermarkdown/core)
[![Node](https://img.shields.io/badge/node-%3E%3D20-5fa04e)](tools/hmd-ts-core/DEVELOP.md)
[![Changelog](https://img.shields.io/badge/changelog-tools%2Fhmd--ts--core-informational)](tools/hmd-ts-core/CHANGELOG.md)

A second implementation of the format, not extension code. It answers to the
same [conformance corpus](examples/conformance/) the canonical tool does.

### [VS Code extension](tools/hmd-vsc-ext/) — live preview for `.hmd`

[![Open VSX](https://img.shields.io/open-vsx/v/hypermarkdown/hmd?color=c160ef&label=open%20vsx)](https://open-vsx.org/extension/hypermarkdown/hmd)
[![VS Marketplace](https://img.shields.io/badge/marketplace-hypermarkdown.hmd-007acc?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=hypermarkdown.hmd)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.90-007acc)](https://hypermarkdown.org/tools/vscode/)
[![Changelog](https://img.shields.io/badge/changelog-tools%2Fhmd--vsc--ext-informational)](tools/hmd-vsc-ext/CHANGELOG.md)

Live preview that keeps the embed boundary visible, backlinks, red links, and
diagnostics. Today it is the preview and the viewer, rendered in TypeScript, so
there is nothing to install to see a card. Completion and the rest of the
language-server features arrive with the Python server.

Install from the [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=hypermarkdown.hmd)
in VS Code, or from [Open VSX](https://open-vsx.org/extension/hypermarkdown/hmd)
in Cursor, Windsurf, and VSCodium. One build is published to both, and the ID is
the same either way:

```
ext install hypermarkdown.hmd
```

![The VS Code extension previewing a card: source on the left, rendered card on
the right, with resolved links, a table, a callout, and a d2
diagram.](https://raw.githubusercontent.com/ewiger/hypermarkdown/main/doc/assets/hmd-vsc-ext-screenshot-1.png)

## What else is in here

- [`examples/`](examples/) — runnable fixture wikis, linted by both, and
  [`examples/conformance/cases/`](examples/conformance/) — the language-neutral
  corpus that arbitrates between the two implementations
- [`doc/`](doc/) — the knowledge base the website is built from: the book, the
  `.hmd` wiki, and the numbered proposals that specify everything
- [`tests/`](tests/) — the repository's own guards, for its prose and its site

## Contributing

- **[DEVELOP.md](DEVELOP.md)** — the language and the website: how the
  documentation tree is organised, the four versions, and how
  hypermarkdown.org is published. Read this first.
- **A tool's own guide** for its code — [the Python
  tool](tools/hmd/DEVELOP.md), [the TypeScript
  core](tools/hmd-ts-core/DEVELOP.md), [the
  extension](tools/hmd-vsc-ext/DEVELOP.md). Each carries that tool's test loop,
  gates, and release.
- **[`doc/proposals/`](doc/proposals/)** — numbered specifications. A change to
  the format or the tooling starts as one; reserve its number in
  [`doc/proposals/README.md`](doc/proposals/README.md).
- **[`doc/status/`](doc/status/)** — progress, tracked per tool: `lang.md` for
  the format, `hmd.md`, `ts-core.md`, and `vsc-ext.md` for the three tools, and
  `pages.md` for the site. Updated in the same commit that changes the code, and
  the only place work is tracked.
- **Kanban board** - in `doc/issues/**`, for the repository's own work, and for the language and the
  website, as well as the tools. The board is public, but the issues are owned by the contributors team.
- **[CONTRIBUTORS.md](CONTRIBUTORS.md)** — add yourself in the same commit as
  your first merged change. Every license file here names *HyperMarkDown
  Contributors* and points at that list, so this is where credit lives.

### Getting set up

Most contributions are to the language and the site — the prose, the proposals,
the `.hmd` wiki — and that work needs Python even though none of it is Python:
this repository's documentation *is* a wiki, built by the MkDocs plugin the
Python tool ships. The sync installs that toolchain; the serve gives you a local
preview on `127.0.0.1:8000` that rebuilds as you edit.

```bash
git clone https://github.com/ewiger/hypermarkdown
cd hypermarkdown
uv sync --locked      # MkDocs, the plugin, and the `hmd` command
uv run mkdocs serve   # preview the book and the wiki as you write
```

Writing `.hmd` in a tree of your own needs none of that today — the [VS Code
extension](tools/hmd-vsc-ext/) previews a card beside the file you are typing
in, and the preview is TypeScript end to end. Install it from the [VS
Marketplace](https://marketplace.visualstudio.com/items?itemName=hypermarkdown.hmd)
or [Open VSX](https://open-vsx.org/extension/hypermarkdown/hmd), or build the
VSIX from this clone: [its README](tools/hmd-vsc-ext/README.md#install).

Before opening a PR, run whichever half you touched:

```bash
uv run python -m pytest    # the Python tool and the site
npm install && npm test    # the TypeScript tools
```

## Feature requests, issues and PRs
Feature requests, issues and PRs are welcome at
[GitHub issues](https://github.com/ewiger/hypermarkdown/issues).
Once accepted, a PR should be merged into the `main` branch, and the issue closed. Again, **Kanban board** - in `doc/issues/**`, for the contributors (or agents) to track the progress of the issue and the PR internally.

## License

Two licenses, split on the one boundary this repository already has.

- **The code is MIT** — see [LICENSE](LICENSE). The three tools under
  [`tools/`](tools/), the fixture wikis and the conformance corpus under
  [`examples/`](examples/), the guards under [`tests/`](tests/), and the
  configuration at the root. Each tool carries its own identical copy.
- **The documentation is [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**
  — see [LICENSE-DOCS](LICENSE-DOCS). Everything under [`doc/`](doc/): the book,
  the `.hmd` wiki, the language specification, and the numbered proposals.

The specification exists to be quoted, translated, and reimplemented — the
conformance corpus is an invitation to write a third implementation. MIT is a
software license and asks for nothing when prose is reused; CC BY asks for
credit and nothing else, which is the right trade for a document. The corpus
itself stays MIT deliberately, because it gets vendored into implementations and
an attribution clause on fixture data is friction with no upside.

Attribute the documentation as:

> HyperMarkDown documentation, © 2026 HyperMarkDown Contributors, CC BY 4.0 —
> https://hypermarkdown.org/

The copyright holder is the project rather than a person; the people are named
in [CONTRIBUTORS.md](CONTRIBUTORS.md).
