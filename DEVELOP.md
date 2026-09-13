# Developing the HyperMarkDown language and its website

This repository's root is the **language**: the numbered records that specify it,
the models beside them, and [hypermarkdown.org](https://hypermarkdown.org/),
which is what those records are published as. The software that implements the
language lives under `tools/`, one directory per package, and each carries its own
development guide.

So this file covers the specification and the site. For a *tool* — its test loop,
its dependencies, how it is built and released — go straight to its guide:

| Tool | Its development guide |
| --- | --- |
| `tools/hmd/` | [tools/hmd/DEVELOP.md](tools/hmd/DEVELOP.md) — the Python loop, dependency policy, packaging, the PyPI release |
| `tools/hmd-ts-core/` | [tools/hmd-ts-core/DEVELOP.md](tools/hmd-ts-core/DEVELOP.md) — build, the host port, the conformance ledger |
| `tools/hmd-vsc-ext/` | [tools/hmd-vsc-ext/DEVELOP.md](tools/hmd-vsc-ext/DEVELOP.md) — the two bundles, the development host, the VSIX |

The book under [`doc/public/`](doc/public/) explains the format to a reader. This
file explains how the format's record and its website are worked on.

## The four versions

Four things version independently, and each has exactly one literal:

| What | Where the version is declared | Its history |
| --- | --- | --- |
| **the language** | [`doc/wiki/hmd-lang-spec.hmd`](doc/wiki/hmd-lang-spec.hmd) — currently **0.1**, against CommonMark 0.31.2 | [`CHANGELOG.md`](CHANGELOG.md) |
| `hypermarkdown` (PyPI) | `__version__` in [`tools/hmd/src/hypermarkdown/__init__.py`](tools/hmd/src/hypermarkdown/__init__.py) | [`tools/hmd/CHANGELOG.md`](tools/hmd/CHANGELOG.md) |
| `@hypermarkdown/core` | `version` in [`tools/hmd-ts-core/package.json`](tools/hmd-ts-core/package.json) | [its changelog](tools/hmd-ts-core/CHANGELOG.md) |
| `hmd-vsc-ext` | `version` in [`tools/hmd-vsc-ext/package.json`](tools/hmd-vsc-ext/package.json) | [its changelog](tools/hmd-vsc-ext/CHANGELOG.md) |

A fifth number is pinned rather than declared here:
[`toolchain.json`](toolchain.json) names the
[`hypermarkdown-toolchain`](https://github.com/ewiger/hypermarkdown-toolchain)
release every native binary comes from — today just `d2`. That repository owns
the d2 version; this one owns only which toolchain release it consumes, and the
two move independently. See **The pinned toolchain** below.

**A tool release never implies a language version, and a language version never
waits for one.** The language number moves when a construct changes and nothing
else moves it; a `HyperMarkDown` release on PyPI is an implementation shipping.

The `0.x` caveat in the Python tool's changelog is easy to misread as a second
format version. It is not. It says a *minor* release of that tool may be the one
that implements a breaking language change — the change itself is the language's,
and carries the language's number.

The language version is declared in prose, in the spec card's opening sentence,
because that card *is* the specification and a number in a second file would be a
number that can disagree with it. `tests/test_docs.py` reads it from there and
fails if the root changelog has no section for it.

## The pinned toolchain

`d2` is the project's only native dependency, and it is acquired in exactly one
way: the release named in [`toolchain.json`](toolchain.json), fetched and
digest-checked by [`scripts/toolchain.mjs`](scripts/toolchain.mjs).

```bash
node scripts/toolchain.mjs                      # this host; prints the bin/ path
export PATH="$(node scripts/toolchain.mjs):$PATH"
node scripts/toolchain.mjs --platform windows-x86_64 --dest build/win
```

It downloads the archive for a platform, checks it against the digest committed
here — not against a checksum file fetched from beside the archive, which would
prove only that the two agree — unpacks it under `.toolchain/`, and prints where
`bin/` landed. `--github-path` also appends that directory to `PATH` for the rest
of a workflow job, which is how `ci.yml` and `pages.yml` use it.

Three consumers, one pin:

| Consumer | How it gets `d2` |
| --- | --- |
| [`ci.yml`](.github/workflows/ci.yml) | `node scripts/toolchain.mjs --github-path` |
| [`pages.yml`](.github/workflows/pages.yml) | the same line, so the site is built with the binary CI tested |
| [`tools/hmd-vsc-ext`](tools/hmd-vsc-ext/) | staged into each platform-specific VSIX at package time; the extension downloads nothing |

Before this there were three unpinned acquisitions — `docker create
terrastruct/d2:latest` in CI, the same lines copy-pasted into the deploy, and
whatever was on `PATH` in the editor. `:latest` is not a pin: identical cards
could render differently in two runs and nothing recorded why. **Do not
reintroduce a direct download, a Docker image, or a package-manager install of
`d2` anywhere in this repository.**

**To move d2**, bump it in the toolchain repository and cut a release there, then
change `version` and every digest in `toolchain.json` together, in one commit.
The digests come from that release's `SHA256SUMS`.

## Working on the specification

`doc/` is a modular knowledge base, and its parts have different jobs:

| Path | What it holds |
| --- | --- |
| `doc/index.md`, `doc/public/` | **The book** — hand-ordered chapters, ordinary markdown |
| `doc/wiki/` | **The wiki** — `.hmd` cards, the namespace, generated nav |
| `doc/proposals/HMD-NNNN/` | Numbered specifications, ADR/RFC style |
| `doc/models/` | The system through requirements, data, domain, behavior lenses |
| `doc/issues/` | A kanban board of work items, indexed by `kanban.yaml` |
| `doc/vsc-ext/` | The editor line's shared tracker — the one exception below |
| `doc/memory/` | Small real-time decisions that the code and git history do not record |

Three conventions that are easy to get wrong:

- **Progress is tracked per proposal**, in `doc/proposals/HMD-NNNN/STATUS.md`,
  and nowhere else — not in `doc/memory/`, not in a wiki card, not in a
  proposal's own `README.md`. Update the tracker in the same commit that changes
  the code. A decision that needs discussion becomes an open question in the
  tracker. One standing exception:
  [`doc/vsc-ext/STATUS.md`](doc/vsc-ext/STATUS.md) covers `HMD-0020`+ in a
  single file, because those milestones interleave across `tools/hmd-ts-core`
  and `tools/hmd-vsc-ext` and neither tool owns half a row.
- **A proposal is a complete text**, readable start to finish by someone who has
  opened no other file. Do not thread prose with identifiers standing in for the
  claim (`F21`, `Q7`, `§5.3`); restate the constraint instead, and put surviving
  pointers in one *See also* section at the end.
- **The book is not the wiki.** A chapter under `doc/public/` is plain markdown
  outside the namespace, so wikilinks and embeds written there are *not*
  resolved — they pass through as literal brackets. Show the constructs in code
  spans and let the wiki be the live demonstration.

Proposal numbers are allocated in fixed ranges so two lines of work can reserve
them without coordinating: `HMD-0002`–`HMD-0019` for the Python and MkDocs line,
now merged and continuing on `main`; `HMD-0020`–`HMD-0099` for the editor and
TypeScript line on `feat/vsc-ext`; and `HMD-0100`+ when the first range is
exhausted. Reserve the number in
[`doc/proposals/README.md`](doc/proposals/README.md) before creating the folder.

A change to the *language* is a change to
[`doc/wiki/hmd-lang-spec.hmd`](doc/wiki/hmd-lang-spec.hmd), an entry in the root
[`CHANGELOG.md`](CHANGELOG.md), and — where it needs argument rather than
statement — a numbered record. It is not finished until the canonical
implementation and the conformance corpus agree with it; that part is
[the Python tool's guide](tools/hmd/DEVELOP.md).

## Publishing hypermarkdown.org

The site is this repository's documentation tree built by the plugin the Python
tool ships, which is the project walking its own talk: a specification that made
the site unbuildable would be caught by its own publication.

```bash
uv sync --locked        # the site needs the Python tool and its `mkdocs` extra
uv run mkdocs serve     # the book and the wiki together
```

The plugin watches the namespace root, which MkDocs would otherwise ignore — a
`.hmd` edit that triggered no rebuild would leave the preview quietly stale.

Two gates guard the site, and both are the *content's* rather than a tool's:

```bash
uv run hmd lint --root doc/wiki --strict   # this repo's own wiki must be clean
uv run mkdocs build --strict               # what the deploy will run
```

**A green build is not evidence of correct output.** Two issues have now been
green builds with wrong pages — Pygments 2.20 silently stopped matching code
fences, and strikethrough rendered as its own source. Both slipped because no
test looked at rendered HTML. That is why `tests/` holds guards that assert on
the built site's markup rather than on `mkdocs.yml`, and why new rendering work
does the same.

Publication goes to GitHub Pages from a workflow rather than from a branch: CI
runs `mkdocs build --strict` and hands `site/` straight to the Pages CDN as an
artifact, so the rendered HTML never enters version control and there is no
`gh-pages` branch to keep in sync. The workflow is
[`.github/workflows/pages.yml`](.github/workflows/pages.yml), and the repository
must have **Settings → Pages → Source** set to *GitHub Actions* — with the older
*Deploy from a branch* setting the workflow runs green and publishes nothing.

`--strict` is the same gate the test workflow applies. A build that warns is not
published, which keeps the site and the lint result describing the same tree.

The site is `doc/`, and `doc/` is CC BY 4.0 while the tools it documents are
MIT, so the footer states both. That does not fit in `copyright:`, which is one
string — it lives in
[`overrides/partials/copyright.html`](overrides/partials/copyright.html), the
only Material template this site shadows. Treat it as a fork of the theme's own
partial: re-diff it against
`site-packages/material/templates/partials/copyright.html` when the theme is
upgraded, because a partial that is renamed upstream stops being included and
takes the license claim off every page without failing `--strict`. That is what
the footer guard in `tests/test_docs.py` is for.

**When a deploy fails, dispatch a fresh run — do not re-run the failed one.**
`upload-pages-artifact` writes an artifact named `github-pages`, and a re-run
adds a *second* one to the same run rather than replacing it; `deploy-pages`
then refuses with `Multiple artifacts named "github-pages"`, so the run can
never go green again no matter how often it is retried. `workflow_dispatch` on
`pages.yml` gets a clean artifact namespace. The failure worth retrying this way
is the transient one where deploy queries for the artifact before the metadata
has propagated and reports `Found 0 artifact(s)` moments after a successful
upload.

One dependency pin is worth knowing about here, because it is the site's
existence rather than its polish: the MkDocs name is being reused for a
ground-up rewrite with no plugin system. A HyperMarkDown site *is* a MkDocs
plugin, so that release would not degrade the site — it would remove the wiki
from it. The dependency is held at `mkdocs>=1.6,<2` for that reason; the full
reasoning and every other bound live in
[the Python tool's guide](tools/hmd/DEVELOP.md#dependencies).

## The repository layout

Every tool lives in its own directory under `tools/`, and the repository root
carries only what is shared between them.

```text
tools/hmd/                the Python tool, published as `HyperMarkDown`
  pyproject.toml          the distribution; also where dependency bounds live
  src/hypermarkdown/     the library — parse, resolve, embed, urls, lint, render
    mkdocs_plugin.py      the only file that imports MkDocs
  tests/                  the tool's own suite
tools/hmd-ts-core/        @hypermarkdown/core — the TypeScript implementation
tools/hmd-vsc-ext/        the VS Code extension
tests/                    repository guards: this repo's prose and its built site
examples/small/           a runnable fixture wiki, exercised by both lines
examples/cs-alg-sorting/  a larger fixture wiki, exercised by both lines
examples/conformance/     the language-neutral corpus both implementations run
doc/                      the documentation tree — also the site's docs_dir
mkdocs.yml                the site
overrides/                Material templates this site shadows — the footer
pyproject.toml            uv workspace root and pytest config; not a distribution
README.md                 the front page: what this is, and the three tools
CHANGELOG.md              the language's history — not any tool's
LICENSE                   MIT — the code
LICENSE-DOCS              CC BY 4.0 — everything under doc/
CONTRIBUTORS.md           the copyright holder, named once
```

**The four `LICENSE` files are byte-identical MIT and must stay that way** —
the root's, and one copy in each tool, because a wheel, an npm tarball, and a
VSIX each ship their own and travel without the rest of this repository. All
four name *HyperMarkDown Contributors* rather than a person and link
[`CONTRIBUTORS.md`](CONTRIBUTORS.md) by absolute URL, on a single line. That
last detail is load-bearing: GitHub identifies a license with `licensee`, which
strips the copyright line and scores the remainder against the canonical text
at a 98% threshold, so a holder's name is free but a second line is not —
splitting the attribution note onto its own line measures 93.9% and costs the
repository its detected license entirely. A new tool copies the file unchanged;
`tests/test_docs.py` fails if any of the four drifts.

**Every tool carries its own `README.md`, `CHANGELOG.md`, `LICENSE`, and
`DEVELOP.md`, and none of them is a symlink.** The first three were symlinks into
the repository root until 2026-08-08, which made the PyPI long description the
monorepo's front page — a page that opened by explaining the format and closed by
naming three tools, two of which cannot be `pip install`ed. Each file now belongs
to the thing it describes, and the per-tool guide is authoritative for that tool's
commands.

Two consequences worth knowing before editing a tool's front matter. A tool
README is read on PyPI or the marketplace rather than on GitHub, so **its links
must be absolute** — a relative link in a PyPI long description resolves against
`pypi.org`. And a release cuts its notes from `tools/hmd/CHANGELOG.md`; the root
[`CHANGELOG.md`](CHANGELOG.md) is the language's and nothing is released from it,
while `tools/hmd/tests/test_cli.py` fails if the tool's changelog has no section
for the current `__version__`.

The two test roots answer for different things. `tools/hmd/tests` is the tool's,
and moves if the tool moves. `tests/` holds `test_docs.py`, which walks every
tracked `*.md` and `*.hmd` in the checkout and guards the language version
against the changelog, and `test_mkdocs.py`, which builds the real site from the
root `mkdocs.yml` — repository guards that happen to be written in Python.
`testpaths` in the root `pyproject.toml` names both, so a bare
`python -m pytest` still runs everything.

The library's independence from MkDocs is deliberate and worth preserving:
`parse`, `resolve`, `embed`, `urls`, and `lint` do not import it, so swapping the
renderer is one file plus `mkdocs.yml` rather than a re-specification.

## Everything, before you push

The site and the specification:

```bash
uv run python -m pytest                     # the tool's suite and this repo's guards
uv run hmd lint --root doc/wiki --strict
uv run mkdocs build --strict
```

Each tool's own gates are in its guide, and CI runs the two halves as independent
jobs ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) so neither blocks
the other's merge.
