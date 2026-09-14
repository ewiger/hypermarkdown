# Project instructions

Every tool lives in its own directory under `tools/`:

- `tools/hmd/` — the Python line, published to PyPI as `HyperMarkDown`. Owns
  its own `pyproject.toml`; the repository root is a uv workspace root, not a
  distribution. Build the wheel with `uv build --package HyperMarkDown` —
  a bare `uv build` at the root silently produces an empty `unknown-0.0.0`.
- `tools/hmd-ts-core/` — `@hypermarkdown/core`, the TypeScript half of the
  conformance contract. A second implementation, not extension code.
- `tools/hmd-vsc-ext/` — the VS Code extension.

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
- `.grem/` contains dormant grem control data and copyable prompts.

Keep L0, L1, and L2 lens files directly under `doc/models/`.

Track progress **per tool**, in `doc/status/`: `lang.md` for the format itself,
`hmd.md`, `ts-core.md`, and `vsc-ext.md` for the three tools, and `pages.md` for
the website. Those files are the only place work is tracked: Done, then a TODO
split into planned work, broken, limitations, and open questions/blockers, with
every row carrying a state (`done`, `ready`, `blocked`, `parked`, `open`,
`deferred`, `standing`). A proposal is a record and carries no tracker; its rows
go to whichever tracker owns the code, citing the proposal. Never record
progress in `doc/memory/`, in `doc/wiki/` cards, in a proposal's `README.md`, or
in a tool's `README.md` — a decision that needs discussion becomes an open
question in the tracker.

At the start of every agent invocation, read every file under `doc/memory/` and
include that context in the work.

Ignore `.grem/**` during ordinary work. Do not inspect, summarize, follow, or
modify its contents unless the user explicitly asks to execute a grem workflow
or supplies a grem prompt for execution.
