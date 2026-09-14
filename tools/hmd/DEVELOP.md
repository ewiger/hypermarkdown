# Developing `tools/hmd`

The Python tool: the `hmd` command, the library under it, the MkDocs plugin, and
the `pygls` language server to come. This file is the loop for *this* tool.
[The repository's `DEVELOP.md`](../../DEVELOP.md) covers what is shared — the
layout, the `doc/` conventions, how the site reaches the web, and the accounts a
release needs.

This implementation is **canonical**. A change here that the TypeScript
implementation has not caught up with is a divergence the conformance corpus is
supposed to make visible, so read the ledger note at the bottom before changing
resolution or a diagnostic.

## Prerequisites

Python 3.11–3.14 and [uv](https://docs.astral.sh/uv/). The
[`d2`](https://d2lang.com) binary is optional: without it a diagram degrades to
its labelled source rather than failing a build.

## Setup

```bash
uv sync --locked          # from the repository root
```

The repository root is a **uv workspace root**, not a project, and this directory
is the distribution. One `.venv` and one `uv.lock` serve the whole checkout, so
`uv run hmd`, `uv run mkdocs`, and `uv run python -m pytest` work from the root
with no arguments and no `--directory`. `--locked` installs the exact versions CI
and the published site are built from, and fails rather than re-resolving when
the lock has drifted.

## The loop

```bash
uv run python -m pytest tools/hmd/tests     # this tool's suite
uv run python -m pytest                     # plus the repository's own guards
uv run hmd lint --root examples/small       # the fixture, by hand
uv run hmd info --root doc/wiki             # what root and policy resolved
```

The suite has two roots on purpose. `tools/hmd/tests` belongs to this tool and
moves with it; `tests/` at the repository root holds guards that answer for the
repository — one walks every tracked `*.md` and `*.hmd`, the other builds the
real site — and neither would survive being filed under a tool. `testpaths` names
both, so a bare `pytest` still runs everything.

## Before you open a pull request

The gates CI applies, in the order they are cheapest to run:

```bash
uv run python -m pytest
uv run hmd lint --root doc/wiki --strict            # this repo's own wiki
uv run hmd lint --root examples/small               # exactly one warning
uv run hmd lint --root examples/cs-alg-sorting --strict
uv run mkdocs build --strict                        # the second consumer
uv build --package HyperMarkDown && uvx twine check --strict dist/*
```

The `hmd lint` calls are dogfooding gates. `examples/small` is deliberately *not*
run under `--strict` — it carries one expected warning, the red link in
`glossary/` that demonstrates what an unwritten page looks like.

`mkdocs build --strict` is a gate rather than a convenience: the plugin is the
second consumer of the resolver, so a build that goes red means the model works
for `lint` and not for rendering.

**A green build is not evidence of correct output.** Two issues have now been
green builds with wrong pages — Pygments 2.20 silently stopped matching code
fences, and strikethrough rendered as its own source. Both slipped because no
test looked at rendered HTML. New rendering work asserts on the HTML, never on
the configuration.

## The library's shape

```text
src/hypermarkdown/
  scan.py          masking, fences, offsets — text in, spans out
  parse.py         the grammar of HMD-0001; never throws on partial input
  frontmatter.py   `tags`, `use`, `import`, `nav`; HMD013 for a bad value
  imports.py       the two import forms
  resolve.py       the four phases, the spine walk, and the workspace index
  embed.py         expansion, depth cap, cycle detection, `can_embed`
  urls.py          source-relative link rewriting
  lint/            HMD001–HMD017, plus text and JSON reporters
  render/          flat markdown and HTML
  diagram.py       d2 fences
  mkdocs_plugin.py the only file that imports MkDocs
  cli.py           argument parsing and formatting, nothing else
```

Two invariants worth preserving:

- **The library does not import MkDocs.** `parse`, `resolve`, `embed`, `urls`,
  and `lint` are renderer-agnostic, so swapping the renderer is one file plus a
  `mkdocs.yml` rather than a re-specification.
- **Entry points take text, not only paths.** A language server's ordinary input
  is a buffer that has never been saved. The leaf functions honour this already;
  `Workspace` is the one layer that still reads from disk, tracked as a
  limitation in
  [the Python tracker](../../doc/status/hmd.md#limitations).

## Dependencies

Edit the ranges in [`pyproject.toml`](pyproject.toml), run `uv lock`, and commit
the lockfile in the same change: an upgrade should be a diff somebody approved,
not whatever the index happened to serve that morning.

Every bound is capped at the next major — the point at which a dependency is
allowed to break its own contract — and every non-obvious one carries its reason
inline. Two are load-bearing rather than tidy: `mkdocs>=1.6,<2`, because "MkDocs
2.0" is a ground-up rewrite with no plugin system, under which every card would
vanish from the build rather than merely render worse; and
`pymdown-extensions>=10.21.2`, below which `superfences` stops matching fences at
all under Pygments 2.20 and every code block silently becomes running text.

The wheel smoke test in CI is the one job deliberately left **unlocked**. It
resolves fresh against these ranges, because its whole purpose is to exercise
what a stranger gets from `pip install`, and a bad bound is invisible to a run
that installs from the lock.

## Packaging

```bash
uv build --package HyperMarkDown
uvx twine check --strict dist/*
```

`--package` is not optional. A bare `uv build` at a workspace root with no
`[project]` table builds an empty `unknown-0.0.0` distribution and **exits zero**,
and that artifact passes a metadata check — on the release path it would travel
as far as PyPI will take it.

What travels: the package, `README.md`, `LICENSE`, and `CHANGELOG.md`. What does
not, deliberately — `examples/`, because the fixture is a repository fixture with
exactly one copy at the root, and `tests/`, because gates are run from a checkout
and shipping a suite invites someone to run it as if it were one. The reasons are
inline in [`MANIFEST.in`](MANIFEST.in).

An editable install can never tell you whether the distribution is correct: it
resolves through `src/`, so a package that would ship without its entry points
still passes every test. That is what the clean-environment wheel smoke test in
CI is for, and any change to the package layout needs it run.

## The files this tool owns

- **[`README.md`](README.md)** is the PyPI long description. Its links must be
  **absolute** — a relative link in a long description resolves against
  `pypi.org`, not against the repository.
- **[`CHANGELOG.md`](CHANGELOG.md)** is where a release cuts its notes from, and
  `tests/test_cli.py` fails if it has no section for the current `__version__`.
  The root `CHANGELOG.md` is only an index of the three tools' changelogs.
- **[`LICENSE`](LICENSE)** is this tool's own copy. None of the three is a
  symlink.

## Cutting a release

1. Promote `Unreleased` in [`CHANGELOG.md`](CHANGELOG.md) to the new number and
   date it.
2. Bump `__version__` in
   [`src/hypermarkdown/__init__.py`](src/hypermarkdown/__init__.py) — the only
   place a version literal exists. `pyproject.toml` derives its own from it, and
   `tests/test_cli.py` fails if the two disagree or if the changelog has no
   section for the number.
3. Merge, with CI green.
4. Tag `main` and push the tag; the tag is what publishes.

```bash
git tag -a v0.2.0 -m "HyperMarkDown 0.2.0"
git push origin v0.2.0
```

[`release.yml`](../../.github/workflows/release.yml) rebuilds from the tagged
tree, refuses to continue if the tag and `__version__` disagree, uploads to PyPI,
and cuts a GitHub release whose notes are that version's changelog section.
Running the workflow by hand builds and verifies without publishing, or publishes
to TestPyPI if you ask it to.

Versions are semantic with the `0.x` caveat stated in the changelog: **a minor
release may be the one that implements a breaking language change**, not only an
API change. The language carries its own version, declared in
[the spec card](../../doc/wiki/hmd-lang-spec.hmd) — this number is an
implementation's, and the two move independently
([the four versions](../../DEVELOP.md#the-four-versions)).

Two things must be configured outside the repository before the first publish, and
neither can be done from a commit:

- **A PyPI trusted publisher** for the project, pointing at owner `ewiger`,
  repository `HyperMarkDown`, workflow `release.yml`, environment `pypi`.
  Publication authenticates by OIDC rather than with a stored API token, so there
  is no secret to leak — and no upload at all until the publisher exists. A
  missing one shows up as a `403` on an otherwise green run.
- **The `pypi` environment** in the repository settings, which is worth an
  approval rule: it is the last point at which a release can be stopped.

## Staying the arbiter

The format's contract between implementations is the language-neutral corpus at
[`examples/conformance/cases/`](../../examples/conformance/), whose
`expected.json` files are
generated from this implementation and never written by hand. Today only the
TypeScript side runs the corpus, and its `test/parity.test.ts` shells out to
`hmd lint --format json` and requires byte-identical diagnostics on
`examples/small`, `examples/cs-alg-sorting`, and `doc/wiki`.

So a change here can break a gate in another tool's suite, in a direction this
tool's own tests cannot see. When you change resolution behaviour, a rule ID, or
a message, regenerate the affected cases and expect the ledger at
[`tools/hmd-ts-core/conformance-xfail.json`](../hmd-ts-core/conformance-xfail.json)
to need an entry — a divergence that is written down is fine, and a silent one is
not. A Python runner for the corpus, which would enforce the contract in both
directions, is specified and unwritten.
