# Project instructions

Every tool lives in its own directory under `tools/`:

- `tools/hmd/` — the Python implementation, published to PyPI as `HyperMarkDown`. Owns
  its own `pyproject.toml`; the repository root is a uv workspace root, not a
  distribution. Build the wheel with `uv build --package HyperMarkDown` —
  a bare `uv build` at the root silently produces an empty `unknown-0.0.0`.
- `tools/hmd-ts-core/` — `@hypermarkdown/core`, the TypeScript half of the
  conformance contract. A second implementation, not extension code.
- `tools/hmd-vsc-ext/` — the VS Code extension.
- `tools/hmd-rs-core/` — `hypermarkdown`, the resolver as a Rust library crate.
  A third implementation, and a narrower one: it resolves, and neither lints
  nor renders. Its own Cargo package with its own `Cargo.lock`, outside both
  the uv and the npm workspace; published to crates.io as `hypermarkdown`.
- `tools/hmd-lsp/` — `hmd-lsp`, the language server, as a Rust program. It
  resolves through the crate in `tools/hmd-rs-core/`, by path, and keeps no
  resolution code of its own; it does not lint. Its own Cargo package with
  its own `Cargo.lock`; released on an `lsp-vX.Y.Z` tag.
- `tools/hmd-semantics/` — `hmd-semantics`, the builder of a vault's semantic
  index, as the Python distribution `hypermarkdown-semantics`. Its own project
  with its own `uv.lock`, outside the uv workspace, so that `torch` and
  `transformers` stay out of the root lock; published to PyPI on a
  `semantics-vX.Y.Z` tag.

`examples/` stays at the root, and the conformance corpus lives inside it at
`examples/conformance/cases/`: fixture trees belong to every implementation,
not to one. `tests/` at the root holds the repository's own guards; a tool's
own tests live under the tool.

Treat `doc/` as a modular knowledge base:

- `doc/models/` declares the system through requirements, data, domain, and
  behavior lenses.
- `doc/wiki/` contains HyperMarkDown (`.hmd`) cards.
- `doc/issues/` is just a kanban board of work items with cards.
- `doc/status/` holds the trackers, one per tool plus the language and the site.
- `doc/proposals/` holds numbered ADR/RFC-style technical specifications.
- `doc/memory/` holds small real-time decisions.
- `doc/archive/` holds retired records, read on demand.
- `.grem/` contains dormant grem control data and copyable prompts.

Keep L0, L1, and L2 lens files directly under `doc/models/`.

Write every document under `doc/` as a HyperMarkDown card, with the `.hmd`
extension. The page of a directory is its folder note, `index.hmd`, and not a
`README.md`. Three files stay Markdown: the cover, `doc/index.md`; the Tools
section index, `doc/tools/index.md`, until the site plugin can publish a
folder note as a section index; and `doc/proposals/TEMPLATE.md`. A card that the site publishes needs
`nav.visibility: public` in its frontmatter, because a card is private by
default. Run `hmd lint` from `doc/` after any edit there.

Track progress **per tool**, in `doc/status/`: `lang.hmd` for the format itself,
`hmd.hmd`, `ts-core.hmd`, `vsc-ext.hmd`, `rs-core.hmd`, `lsp.hmd`, and
`semantics.hmd` for the six tools, and
`pages.hmd` for the website. `kanban.hmd`, `open.hmd`, and `proposals.hmd`
beside them are generated views, not trackers: HQL queries over the vault
`doc/`, re-rendered with the command in `doc/status/index.hmd`. The eight
trackers are the only place work is tracked, and they
read in one order: **Status** in prose, then **Open**, **Broken**, **Limitations
(known gaps)**, and **Done** last. Open rows carry a state in the board's own
words — `todo`, `doing`, `backlog`, `blocked`, `parked` — and a blocked row says
what unblocks it. Work points have no identifiers: a row is named by its
subject, and anything a reader would look up trails the sentence in brackets. A proposal is a record and carries no tracker; its rows
go to whichever tracker owns the code, citing the proposal. Never record
progress in `doc/memory/`, in `doc/wiki/` cards, in a proposal's `index.hmd`, or
in a tool's `README.md` — a decision that needs discussion becomes an open
question in the tracker.

Do not type into a table that an HQL cell wrote, which is any table between
`hql:output` markers. Change the data the cell reads, run `hql render`, and
commit both. `doc/status/hmd.hmd` keeps its rows in the `work` list of its
frontmatter, and the other trackers will follow. The steps are in
`doc/status/index.hmd`.

At the start of every agent invocation, read every file under `doc/memory/` and
include that context in the work. The folder is included here, so that it
loads with these instructions:

@doc/memory/decisions.hmd

Keep `doc/memory/` short: one sentence for each decision. A longer account of
a decision goes to `doc/archive/memory/`, which is read only on demand.

Ignore `.grem/**` during ordinary work. Do not inspect, summarize, follow, or
modify its contents unless the user explicitly asks to execute a grem workflow
or supplies a grem prompt for execution.
