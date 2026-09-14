# HMD-0024: The `tools/` layout, and a Python language server

**Status**: drafted
**Created**: 2026-08-08
**Source**: [Developer guide](../../DEVELOPER.md)

## Abstract

This proposal fixes the repository as a monorepo of tools, one directory each
under `tools/`, and decides that the language server will be written in Python
against `pygls` and will live with the Python implementation. `tools/hmd` is
the Python implementation — parser, resolver, linter, graph checker, MkDocs plugin, and
the future language server — and owns the `pyproject.toml` that builds the
`HyperMarkDown` distribution. `tools/hmd-ts-core` is the TypeScript
implementation of the same format. `tools/hmd-vsc-ext` is the VS Code
extension, renamed from `vscode-HyperMarkDown`. The repository root becomes a
uv workspace root that is not itself a distribution, and everything shared by
more than one tool — the example trees, the conformance corpus filed among
them, the documentation, the site, the repository's own test guards — stays at
the root.
The language-server decision reverses an earlier note that left the
implementation language open between TypeScript and Rust, and it promotes one
existing constraint from a precaution to a load-bearing requirement: every
entry point must accept a document's *text*, because a language server serves
buffers that have never been saved.

## Motivation

The layout that existed before this record was `src/` and `tests/` for Python
and `packages/` for JavaScript. It described the languages rather than the
products, and it had three specific costs.

- **It could not say where a third thing goes.** A language server is neither
  "the Python library" nor "a JavaScript package", and a repository whose
  top-level directories are named after languages has no answer for it beyond
  adding a fourth convention.
- **It buried a second implementation inside a client.** `@hypermarkdown/core`
  is not extension code. It is the TypeScript half of the conformance contract
  that replaced the project's old one-implementation principle, and the corpus
  that arbitrates between the two is the only thing keeping the format from
  drifting into two dialects. Filing it under `packages/` next to the extension
  invited exactly the reading this proposal rejects — that it is a detail of
  how the editor happens to be built.
- **The Python half had no project of its own.** Its `pyproject.toml` was the
  repository's, so the distribution's boundary and the repository's boundary
  were the same boundary. Anything added to the repository was, by default,
  inside the package's project directory, and nothing forced the question of
  whether it belonged there.

Naming the units after what they are, and giving each one its own project file,
answers all three at once.

**Risk this proposal must not defer.** A layout change moves the paths that
release automation is written against, and a wrong path on that route does not
always fail — it can succeed at building the wrong thing. The rules below that
look like packaging trivia are there because two of them have exactly that
failure mode.

## Goals

- One directory per tool, named after the tool, with its own project file.
- A repository root that carries only what more than one tool uses.
- A decided implementation language for the language server, and a statement of
  what that decision makes load-bearing elsewhere.
- No change to anything a user installs by name.

## Non-goals

- **Renaming the PyPI distribution.** It stays `HyperMarkDown`.
- **Publishing the extension.** The rename below happens *before* a publish,
  deliberately, and no publish is proposed here.
- **Building the language server.** This record decides its language and its
  home, and states the constraint it depends on. It specifies no protocol
  surface, no capabilities, and no schedule.
- **Changing the format, the resolver, or any diagnostic.** Nothing here is
  visible in a `.hmd` file.

## Specification

### What each tool owns

Three directories, and the rule that decides what may go in one.

```text
tools/hmd/            Python: parse, resolve, embed, urls, lint, graph,
                      the MkDocs plugin, and the language server to come
tools/hmd-ts-core/    @hypermarkdown/core — the TypeScript implementation
tools/hmd-vsc-ext/    the VS Code extension
```

Nothing else sits at `tools/`. The tracker the two TypeScript tools share is
documentation about the work rather than a shippable unit, so it lives at
`doc/status/` with the rest of `doc/`.

- A directory under `tools/` MUST be a single shippable unit with its own
  project file — `pyproject.toml` or `package.json` — and MUST NOT be a
  grouping of unrelated things that happen to share a language.
- `tools/hmd-ts-core` MUST NOT be folded into the extension. It is a second
  implementation of the format, and the conformance corpus arbitrates between
  it and the Python one; a second implementation living inside a client reads
  as an implementation detail of that client, which is precisely what the
  corpus contract denies. This is a statement about meaning, not about build
  convenience — the extension is its only consumer today, and that is expected
  to stay true for a while.
- Anything used by more than one tool MUST stay at the repository root. That is
  `examples/` (both lint the runnable trees, one launches an editor against
  them, and both run the conformance corpus at `examples/conformance/cases/`),
  `doc/`, `mkdocs.yml`, and `tests/`.
- The conformance corpus MUST live under `examples/`, not in a directory of its
  own. It is a set of fixture namespaces like the trees beside it, and its
  authority comes from `expected.json` being generated by the canonical
  implementation and from a ledgered case that starts passing failing the
  build — never from its rank in the tree. Two root directories of fixture
  trees would only make a reader learn which kind goes where.
- **The root owns the language**: its specification, the numbered records that
  argue it, the models beside them, and the website they are published as. No
  tool owns the specification, and a tool MUST NOT be the place a question about
  the format is settled — the dependency runs from tool to specification and
  never back. The one exception is deliberate and is the project exercising its
  own format: this repository's documentation is a HyperMarkDown wiki, built by
  the plugin the Python tool ships, so a specification that made the site
  unbuildable would be caught by its own publication.

### Where tests live, and what they answer for

A test belongs to whatever it makes a claim about.

- A test that exercises a tool's own code MUST live under that tool. The Python
  tool's suite is `tools/hmd/tests`; the TypeScript tools keep theirs beside
  their sources.
- A test that makes a claim about the *repository* MUST stay at the root, in
  `tests/`, even when it is written in the same language as a tool. Two do:
  one walks every tracked `*.md` and `*.hmd` file in the checkout to guard the
  project's own prose, and one builds the real site from the root `mkdocs.yml`.
  Neither would survive being filed under a tool, because neither is about one.
- The root `pyproject.toml` MUST name both roots in `testpaths`, so that a bare
  `python -m pytest` at the root still runs everything. A split that has to be
  remembered as two commands is a split that will be run as one.

### The repository root is a workspace, not a project

- The root `pyproject.toml` MUST NOT declare a `[project]` table. It carries
  the uv workspace, the pytest configuration, and a dependency group naming
  `HyperMarkDown[mkdocs,dev]` so that a bare `uv sync` installs the tool with
  everything the gates need.
- One `.venv` and one `uv.lock` serve the whole checkout, so `uv run hmd`,
  `uv run mkdocs`, and `uv run python -m pytest` all keep working from the root
  with no arguments and no `--directory`.
- Building the distribution MUST be spelled `uv build --package HyperMarkDown`.
  A bare `uv build` at a workspace root with no `[project]` table does not
  fail: it builds an empty distribution named `unknown-0.0.0` and exits zero.
  That artifact passes a metadata check, so on the release path it would travel
  as far as PyPI will take it. The flag is what makes the mistake loud.

### A tool's front matter is its own

A tool under `tools/` is a shippable unit, and the files that introduce it to
whoever installs it are part of the unit rather than repository furniture.

- Every tool MUST carry its own `README.md`, `CHANGELOG.md`, `LICENSE`, and
  `DEVELOP.md`, and none of them MAY be a symlink or a generated copy of another
  file. A tool's README is about that tool: `tools/hmd/README.md` is the `hmd`
  command, `tools/hmd-vsc-ext/README.md` is the extension.
- The repository root MUST NOT be the source of any of them. Its `README.md` is
  a short index of the tools, its `CHANGELOG.md` an index of theirs, and its
  `DEVELOP.md` carries only what no single tool owns.
- A tool README's links MUST be absolute. It is read on PyPI or the marketplace
  rather than in the repository, and a relative link in a long description
  resolves against `pypi.org`.
- The Python tool's `CHANGELOG.md` is the release's notes, so the release
  workflow MUST read `tools/hmd/CHANGELOG.md`, and a test MUST fail when it has
  no section for the current `__version__`. The root index is not a release
  artifact.

This reverses the rule this record originally carried, which was that the three
files MUST be symlinks into the repository root. The reasoning behind it was
one-source-of-truth: setuptools refuses to read a file outside the project
directory — a `readme` of `../../README.md` fails the build outright — and a copy
was expected to drift from the original. What that argument missed is that the
two files were never the same document. A repository front page introduces a
monorepo and its tools; a long description tells someone who is about to run
`pip install` what they are installing. Linking them made the PyPI page open by
explaining a markup format and close by naming three tools, two of which cannot
be installed that way, with every relative link dead. Two documents that differ
in audience are not duplication, and the symlink was enforcing sameness on things
that were only ever adjacent.

Nothing in the reversal requires reading outside the project directory, so the
setuptools constraint is satisfied by construction rather than worked around.

`examples/` remains at the root and is still not in the sdist. That was decided
against a symlinked directory and is unaffected here: the fixture is a repository
fixture that both implementations lint, one copy at the root, and a reader who
wants to run it clones the repository.

### The extension's identity

- The extension's npm and manifest name is `hmd-vsc-ext`, and its publisher
  stays `HyperMarkDown`. Together these form the marketplace identifier
  `hypermarkdown.hmd`.
- The identifier is permanent from the first publish. Renaming afterwards means
  a second listing, and every install of the first one stranded on it. The
  rename is therefore taken now, while nothing is published, and MUST NOT be
  deferred past a publish.
- Only the identity moves. The displayed name, the `hmd` language id, the
  TextMate scope, every command id, and every setting key are unchanged,
  because those are what a user and a theme author see.

### The language server is Python on pygls

- The language server MUST be written in Python against `pygls`, and MUST live
  in `tools/hmd` alongside the implementation it serves.
- It is placed there because the semantics are already there. The Python
  implementation is canonical: where two implementations disagree about a case
  the conformance corpus covers, Python defines the correct answer. A language
  server is a semantics server, and putting it anywhere else would create a
  third place where resolution behaviour lives — one that could disagree with
  the arbiter and be right about nothing.
- Every editor that speaks the protocol — Neovim, Emacs, Helix, Zed — is served
  by it without a second port of the resolver being written, **and so is VS
  Code**. The extension is expected to become a client of this server for the
  language features that live beyond the preview: completion first, then the
  rest of what a semantics server can answer and a renderer cannot.
- **The preview MUST keep rendering without Python.** That is the line, and it
  is narrower than the one this section drew when it was written. Opening a
  `.hmd` file and seeing a card is the extension's first run, and it MUST NOT
  wait on an interpreter being found. Features that need the server are absent
  when the server is absent; they do not take the preview down with them.
- This does **not** revive the retired principle that semantics live in one
  implementation, but it does move the tension inside a single extension: the
  preview's answers will come from TypeScript and the language features'
  answers from Python. Keeping those the *same* answers is precisely the job
  [the conformance corpus](../../examples/conformance/) already has, which is
  why it is the contract and not a convenience.

> **Revised 2026-08-08.** This section first read that the extension MUST NOT
> require Python and MUST NOT gain a dependency on this server — zero-setup
> preview stated as a property of the whole extension. The two lines of work
> evolved in parallel and the conclusion did not survive contact: once the
> canonical semantics are a server, refusing to let VS Code speak to it means
> either a second port of the resolver or an editor permanently short of the
> features every other editor gets. The promise that was worth keeping is
> about the *preview*, and it is kept above. Recorded rather than deleted
> because the narrowing is the substance of the change.

### Text, not paths

The language-server decision promotes an existing precaution into a
requirement, because a language server's ordinary input is a buffer that has
never been written to disk.

- Every entry point that ingests a document MUST accept the document's text,
  not only its path. An implementation that can only read from a filesystem
  cannot answer a question about an unsaved buffer, and retrofitting that
  through a workspace index is a rewrite rather than a patch.
- The workspace index MUST accept per-path text overrides supplied by a caller,
  consulted ahead of any read, and MUST support invalidating and re-parsing a
  single card rather than reloading the tree. An editor edits one card at a
  time and does it on every keystroke.

## Backwards Compatibility

- **Nothing a user installs by name changes.** The distribution stays
  `HyperMarkDown`, the console script stays `hmd`, and the MkDocs plugin entry
  point stays `HyperMarkDown`. A folder name was never any of those.
- **The extension's identifier changes**, which is free exactly once and is
  being spent here, before any publish.
- **Every repository-relative path changes**, so anything pinned to the old
  ones needs updating: the three workflows, the example launcher, the npm
  workspace list, the extension's TypeScript path mapping, and the developer
  documentation. The parked integration test suite on `feat/vsc-ext-1` is not
  updated by this proposal and will need the rename when it is unparked.
- **`uv build` changes meaning at the root** and must gain `--package`, as
  above. This is the one change that fails quietly if missed.

## Security Considerations

The layout moves no trust boundary. Two small notes:

- The build reads nothing outside a tool's own project directory. The packaging
  symlinks that once pointed into the repository root are gone, so there is no
  link for a build to follow at all.
- A language server is a new serving surface, and this record does not open it.
  Its containment rules are the resolver's existing ones — a resolved target is
  normalised and checked against the namespace root before any read, and
  symlinks are not followed out of the root — and a server MUST NOT relax them
  in order to serve a buffer whose path is outside the workspace.

## Deployment / Activation

1. Move the three units under `tools/`, preserving history.
2. Give the Python tool its own project file, give every tool its own README,
   changelog, license, and development guide, and make the root a uv workspace
   root.
3. Split the Python suite into the tool's tests and the repository's guards.
4. Repoint every workflow, script, and document, and rename the extension.
5. Run every gate, including a wheel build and a smoke test, because the
   package layout moved.
6. The language server is separate work and starts from the text-ingestion
   requirement above, not from a protocol surface.

## Reference Implementation

- `tools/hmd/pyproject.toml` — the distribution, with `MANIFEST.in` and the
  tool's own `README.md`, `CHANGELOG.md`, and `LICENSE` beside it.
- `.github/workflows/release.yml` — release notes cut from
  `tools/hmd/CHANGELOG.md`, and `tools/hmd/tests/test_cli.py` asserting that file
  has a section for the packaged version.
- `pyproject.toml` at the root — the uv workspace, the dependency group, and
  `testpaths` naming both test roots.
- `tools/hmd-ts-core/test/repoRoot.ts` — the repository root found by searching
  upward for the fixtures the callers need, replacing a fixed `../../..` that
  resolved somewhere wrong rather than erroring when the nesting depth changed.
- `.github/workflows/release.yml` and `ci.yml` — `uv build --package
  HyperMarkDown`, and the version check reading `tools/hmd/src`.
- `tools/hmd/src/hypermarkdown/resolve.py` — where the text-override
  requirement lands; the workspace is the one layer that ingests from disk.

## Test Plan

The gates are the existing ones, run after the move rather than new ones
written for it. A layout change is verified by the suite continuing to pass
*and by proving it actually ran*, which is the failure mode a move introduces.

```bash
npm run typecheck && npm run build
HMD_REQUIRE_PARITY=1 npm test
uv run python -m pytest
uv run hmd lint --root doc/wiki --strict
uv run hmd lint --root examples/small
uv run hmd lint --root examples/cs-alg-sorting --strict
uv run mkdocs build --strict
uv build --package HyperMarkDown
```

- The cross-implementation parity suite MUST fail rather than skip when
  `HMD_REQUIRE_PARITY` is set, and CI MUST set it. Its "no Python here, skip"
  branch is correct on a contributor's machine and wrong anywhere the Python
  side is installed on purpose; without the guard, a moved project file retires
  the only cross-implementation gate the project has and the run still reports
  green.
- The wheel MUST be built and smoke-tested from a clean environment after any
  change to the package layout, because an editable install resolves through
  the source tree and never exercises the entry points.

## Open Questions

- Does the language server share a process with anything, or is `hmd lsp` a
  subcommand of the existing CLI?
- Is `pygls` added to the base dependencies or to an `lsp` extra? An extra
  keeps `pip install HyperMarkDown` small; a base dependency means the server
  is always there when the CLI is.
- What is the ordering and the fallback when the extension becomes a client of
  the Python server — which features move first, and how does the UI say "the
  server is not here" without implying the preview is broken? The direction is
  settled (it becomes a client; the preview stays independent); the sequencing
  is not.
- Does canonicity move if a Rust implementation ever appears, and what is the
  procedure for moving it? This is inherited unresolved and the `tools/` layout
  does not settle it.
- ~~Should the editor line's shared tracker be split into per-proposal
  trackers?~~ **Answered 2026-09-14: neither.** Tracking moved per tool, to
  `doc/status/`, with one file for the language and one for the site beside the
  three tools. Per-proposal tracking had the same defect from the other
  direction: a reader asking what the extension can do had to visit three
  trackers, and a proposal spanning two tools had to choose one of them.

## See also

- [HMD-0020](../HMD-0020/README.md) — the TypeScript implementation, the
  conformance corpus, and the drift ledger.
- [HMD-0021](../HMD-0021/README.md) — the VS Code extension.
- [`DEVELOP.md`](../../../DEVELOP.md) — the repository's setup and gates.
- [`doc/DEVELOPER.md`](../../DEVELOPER.md) — an index of the four development
  guides; the per-tool build and test commands now live with each tool.

## Changelog

- 2026-08-08: drafted
- 2026-08-08: the conformance corpus moved from `conformance/` to
  `examples/conformance/`. It is a fixture tree like the ones beside it, and
  the contract it carries never depended on the path; HMD-0020 §10 is amended
  to the new location
- 2026-08-08: the packaging symlinks narrowed to files. `examples/` was linked
  into `tools/hmd` for one afternoon so the sdist could carry the fixture, and
  removed the same day: a directory symlink is indistinguishable from a
  duplicate tree in a listing, which is the confusion this layout exists to
  remove. The sdist no longer ships `examples/`
- 2026-08-08: the remaining packaging symlinks removed, and *The packaging inputs
  the tool does not own* replaced by *A tool's front matter is its own*. Every
  tool now carries its own README, changelog, license, and development guide;
  the root's three files became indexes, and the per-tool build and test commands
  left `doc/DEVELOPER.md` for the tools they describe. The rule that a tool's
  README links must be absolute is new, and follows from where it is read
