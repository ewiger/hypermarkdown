# Changelog — `hypermarkdown` (the `hmd` command)

Notable changes to the Python tool, newest first. This file covers **this
distribution only** — the version on PyPI, the `hmd` CLI, the library, and the
MkDocs plugin. The other tools in the monorepo version themselves and keep their
own changelogs; [the repository's index](../../CHANGELOG.md) lists them.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with
the usual `0.x` caveat: **the format itself may change between minor versions.**
Until `1.0`, treat a minor bump as potentially breaking for `.hmd` sources, not
only for the Python API.

## [Unreleased]

### Added
- **`hmd init`** — create `.hmd/config.toml` at a project root, with every
  setting written at its default and commented. A blank file, or one with the
  defaults commented out, teaches nothing that no file at all does not; the
  written file is where an author finds out which keys exist. `--wiki` names
  the namespace root, and the command creates that directory too, because
  `load()` rejects a `wiki` setting pointing at nothing — writing the config
  and stopping there would leave a project whose next command fails about a
  directory nobody asked for. A missing project directory is created; an
  existing config is never replaced without `--force`. Initialising inside an
  existing project succeeds and says so on stderr, since the nearer marker wins
  and that silently changes where cards resolve.
- **`[namespace]` in the written config** — `name` and `provider`. A project's
  own namespace is otherwise unnamed, and naming it is what lets another
  project bind to it and address a card as `name:card`. `--name` defaults to
  the project directory's own name and is *repaired* into that address form
  when it has to be (`My Notes` → `My-Notes`); a `--name` passed explicitly is
  validated and refused instead, because a name somebody typed is a request
  and answering a different one is worse than an error. `provider` is `folder`
  — a local tree — and no other value is accepted yet.

  **Nothing reads either key.** The specification pins the MVP to exactly two
  settings, `wiki` and `[discovery]`, and requires the rest of the file to be
  ignored; `init` writing a section is not the resolver reading one. The
  section exists so binding has somewhere to land when it is implemented.

## [0.2.0] — 2026-08-10

**The distribution is renamed.** `pip install hypermarkdown` replaces
`pip install hyper-markdown`, and the import package is `hypermarkdown` rather
than `hyper_markdown`. PyPI has no rename, so this is a new project: `0.1.1`
stays installable under the old name, receives no further release, and is
retired deliberately later.

A minor bump rather than a patch, for two reasons that are about `.hmd` sources
and about the library rather than about the name: `nav` becomes a mapping, and
the import package moves. Under this project's `0.x` rule a minor release is
where the format is allowed to move, so that is where these belong.

### Added
- **`nav.visibility` gates publication, and the default is private.** A card
  reaches a built site only with `nav: {visibility: public}`; absent that there
  is no page and no URL. Visibility inherits the way `use` does — the card, then
  the nearest ancestor `index.hmd`, then the default — so a folder note
  publishes its whole subtree and a card inside opts out with its own `private`.
  Both errors are possible, but they are not symmetric: a page that should have
  shipped and did not is visible to its author on the next build, while one that
  shipped and should not have is a leak nobody looks for.
- **`HMD017`**, a warning when a published card links to or embeds one that is
  not published. Expansion copies the target's bytes into the host page, so
  `expand` takes a `can_embed` predicate rather than learning what visibility
  is — publication is the caller's policy, and `hmd render` on a card you named
  yourself is not a site build. A blocked embed degrades to the same red link a
  blocked link gets.

### Changed
- **The MkDocs plugin key is `hypermarkdown`.** The old `hyper-markdown` key is
  retained as an alias resolving to the same class, so an existing `mkdocs.yml`
  keeps building untouched — that key is the one renamed identifier that appears
  inside files this project does not own, and dropping it would be a hard build
  failure whose cause the site's author never saw. `hypermarkdown` is the
  supported spelling; the alias is a compatibility measure with an end date yet
  to be set.
- **`import hyper_markdown` becomes `import hypermarkdown`.** No alias is
  provided here. The library API was never the documented interface — the `hmd`
  command and the plugin key were — and the package is `0.x`.
- The project's name is written **HyperMarkDown** in prose and `hypermarkdown`
  in identifiers, its site is `hypermarkdown.org`, and its repository is
  `github.com/ewiger/hypermarkdown`.

- **`nav` is a mapping, not an integer.** `nav: 10` becomes
  `nav: {order: 10}`; the known keys are `order` and `visibility`. Ordering was
  simply the dimension that existed first, and a scalar would have needed a
  second spelling the moment `visibility` was wanted. The old form is reported
  as `HMD013` rather than quietly accepted — a card carrying it is asking to be
  ordered, and the silent outcome, falling into the unkeyed bucket and sorting
  last, is exactly the failure its author would not look for.
- **The distribution has its own README, changelog, and license.** All three
  were symlinks into the repository root, which made the PyPI long description
  the monorepo's front page — an install page that opened by explaining the
  format and closed by naming three tools, two of which you cannot `pip
  install`. Each tool under `tools/` now carries its own set of these files, and
  this one is about the `hmd` command: install, the commands, the linter's
  severities, the MkDocs plugin, and the library. Nothing installed by name
  changed.
- **Every link in the long description is absolute.** A relative link in a PyPI
  description resolves against `pypi.org`, not against the repository, so the
  old symlinked README's links to `examples/small/` and `DEVELOP.md` were dead
  on the page most users read first.
- **`hmd lint` is described as `HMD001`–`HMD017`.** Seventeen rules are
  implemented; the README and the changelog had both been saying sixteen since
  `nav` visibility and HMD017 landed.

## [0.1.1] — 2026-08-08

A dependency-correctness release. No behaviour of the format, the CLI, or the
plugin changed.

### Fixed

- **`hmd render --to html` was unprotected against the Pygments 2.20 defect.**
  `pymdownx.superfences` is loaded by the HTML renderer, so it is a *base*
  dependency — but 0.1.0 carried its `pygments<2.20` guard in the `mkdocs`
  extra. A plain `pip install hyper-markdown` could therefore resolve a
  combination in which every fenced code block rendered as running text, with
  nothing raised and no site involved.
- **The README told a `pip install` user to lint `examples/small`**, which
  travels in the repository and the source archive but not in the wheel. The
  quickstart now lints your own tree, and points at a clone for the fixture.
- **The card that teaches the format taught resolution wrongly.**
  `doc/wiki/hyper-markdown.hmd` described a bare name as matching "by filename
  alone", predating the spine walk. It now states the real order — beside the
  card, then each folder above without recursion, nearest winning, a whole-tree
  sweep only if that fails, and two matches in the sweep an error rather than a
  tie-break.

### Changed

- **`pygments<2.20` is gone; `pymdown-extensions>=10.21.2` replaces it.** The
  defect was never Pygments' own: 10.21.2, published the same day as Pygments
  2.20.0, restores fence matching. Bisected against 2.20.0 — 10.20.1 and 10.21
  broken, 10.21.2, 10.21.3, and 11.0.1 correct. The constraint now sits in the
  base dependencies, with the code that needs it.
- **Every dependency range is capped at the next major**, the bound a dependency
  is allowed to break its own contract at: `typer>=0.12,<1`, `pyyaml>=6,<7`,
  `markdown>=3.6,<4`, `pymdown-extensions>=10.21.2,<12`, `pytest>=8,<10`. The
  existing `mkdocs>=1.6,<2` and `mkdocs-material>=9,<10` are unchanged.
- **`uv.lock` is committed**, and CI and the Pages deploy install with
  `uv sync --locked` rather than resolving fresh on every run. The published
  site is now built from the same versions the tests ran against, and a
  dependency upgrade arrives as a reviewable diff. The wheel smoke test stays
  deliberately unlocked, since its job is to exercise what `pip install` gives a
  stranger.

Contributor setup is now `uv sync --locked --all-extras`; see
[DEVELOP.md](../../DEVELOP.md).

## [0.1.0] — 2026-08-08

First public release. Everything below is new; there is nothing to compare it
against.

### The format

- **Six owned constructs** on top of GitHub-flavored markdown: wikilinks,
  aliased links, heading links, block anchors, block references, and the three
  embed forms. Everything else is ordinary GFM.
- **Deterministic resolution.** A bare name is resolved against explicit imports
  first, then the *spine* — this folder, then each folder above it, probed
  without recursion — then imported search paths, then a whole-tree sweep. A
  spine lookup never reaches sideways; the final sweep may find a unique card
  elsewhere in the namespace.
- **Autodiscovery does not tie-break.** Multiple matches in the final sweep are
  an error. Ordered wildcard imports use declaration precedence and report
  shadowing as HMD016.
- **Frontmatter** carries `tags`, `use`, `import`, and `nav`. Both import forms
  are supported: named with an alias, and star, which contributes a search path.
- **Folder notes.** `[[a/b]]` and `[[a/b/index]]` address the folder note at
  `a/b/index.hmd`. A sibling `a/b.hmd` would collide with that address (HMD012).

### The `hmd` command

- `hmd lint` — parse, resolve, and report. Sixteen rules with stable IDs, text
  or JSON output, `--strict` to count warnings as errors. Exit codes are pinned
  for CI: `0` clean, `1` diagnostics, `2` usage error.
- `hmd render PATH --to markdown|html` — expand embeds and rewrite resolved
  links. Embed depth is capped at 16 (`HMD008`) and cycles are reported
  (`HMD007`).
- `hmd graph` — the resolved link graph as JSON.
- `hmd info` — the resolved root and the discovery policy in force.
- `hmd --version`.
- Every command takes `--root` to override the namespace root, which otherwise
  comes from the `wiki` setting in `.hmd/config.toml` and defaults to
  `doc/wiki`. A `.hmd/` directory doubles as a project-root marker, so any
  subtree can be self-contained.

### Publishing

- A **MkDocs plugin**, registered through the `mkdocs.plugins` entry point and
  installed with the `mkdocs` extra. It registers `.hmd` files as pages, derives
  the nav from the namespace tree, expands embeds, and rewrites every wikilink
  to a source-relative link that MkDocs resolves and validates itself.
- A card at `a/b.hmd` serves at `a/b/`; cards sort by path, or by a `nav:`
  integer in their frontmatter.
- **A book with a wiki in it.** Point `docs_dir` at a documentation tree and the
  plugin's `root` at the subtree that is a namespace. An authored `nav` is used
  verbatim except where it names `hmd://wiki`, which is replaced by the derived
  wiki section.
- An unresolved link renders as a **red link** rather than failing the build, so
  a wiki stays publishable while it is still being written.
- `mkdocs serve` picks up `.hmd` edits — the plugin watches the namespace root,
  which MkDocs would otherwise ignore.
- Math, callouts, footnotes, and **D2 diagrams**. Diagrams render through the
  `d2` binary, which is not a Python dependency: without it a diagram degrades
  to its labelled source instead of failing the build. Rendered SVG reaches the
  page as a `data:` URI.

### Distribution

- Published to PyPI as `hyper-markdown`; `pip install "hyper-markdown[mkdocs]"`
  adds the site extra. Python 3.11 through 3.14.
- Two dependency ceilings, both deliberate and both carrying their reasons
  inline in `pyproject.toml`: `mkdocs>=1.6,<2`, because "MkDocs 2.0" is a
  ground-up rewrite with no plugin system — under it every card would vanish
  from the build rather than merely render worse — and `pygments<2.20`, which
  silently stops `pymdownx.superfences` from matching fences at all, turning
  every code block on every page into inline text while the build stays green.

### Known limitations

Deliberate, and tracked per proposal under `doc/proposals/HMD-NNNN/STATUS.md`:

- `hmd render --to markdown` is **one-way**. Erasure drops the embed boundary
  and the provenance of every link; it is a build product, not an interchange
  format.
- Indented code blocks are not masked, so a `[[link]]` inside one is seen as a
  link. `admonition` and `footnotes` both overload the four-space indent.
- The scanner is a hand-written masker rather than a CommonMark block parser, so
  divergence from CommonMark is possible and currently undetectable. A
  conformance corpus is the planned way to expose it.
- Links out of the namespace root are ordinary markdown links and are not
  checked by `hmd lint`. MkDocs reports them at `info`.
- There is no lint suppression syntax. A finding must be fixed or tolerated at
  the call site.

Both specifications — the format and the site — are still `drafted`. Expect the
format to move before `1.0`.

[Unreleased]: https://github.com/ewiger/hypermarkdown/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ewiger/hypermarkdown/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/ewiger/hypermarkdown/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/ewiger/hypermarkdown/releases/tag/v0.1.0
