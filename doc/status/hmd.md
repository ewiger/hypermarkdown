# STATUS — the Python line

`tools/hmd` — the canonical implementation: the `hmd` command, the resolver and
linter behind it, the MkDocs plugin, and the distribution published to PyPI as
`HyperMarkDown`. What the *format* owes an answer for is in
[`lang.md`](lang.md); what the *site* says is in [`pages.md`](pages.md); the
second implementation and its editor are in [`ts-core.md`](ts-core.md) and
[`vsc-ext.md`](vsc-ext.md).

**This file is the only place work on the Python tool is tracked.** Not the
memos under `doc/memory/`, not the cards under `doc/wiki/`, not the proposals
themselves. A decision that needs discussion is named here as an open question
and argued wherever it belongs; nothing else may hold a task list. Update the
row in the same commit that changes the code.

A row cites the proposal it came from — HMD-0001 (the MVP), HMD-0002 (book-mode
rendering), HMD-0005 (the rename), HMD-0024 (the `tools/` layout and the
language server).

**States** — `done` shipped and gated by a test · `ready` specified, unblocked,
not started · `blocked` waiting on a decision · `parked` started and set aside ·
`open` undecided · `deferred` deliberately not being decided now ·
`part-resolved` half answered, with the rest named in the row · `standing` an
accepted limitation · `lifted` no longer true.

**Snapshot** (2026-09-14) — the canonical implementation is complete against
HMD-0001 and HMD-0002 and nothing is known broken. `hypermarkdown` is on PyPI
through a trusted publisher; the three tools each own their README, changelog,
license, and development guide, with no symlinks in the packaging; and the
repository root is a uv workspace rather than a distribution. Gated by 236
Python tests plus three `hmd lint` runs and `mkdocs build --strict`. What
remains: the conformance corpus is run from the TypeScript side only, so the
cross-implementation contract is enforced in one direction; the language server
is decided and unbuilt, and the one thing it needs — text overrides on the
workspace index — is a patch to a single class rather than a rewrite.

## Done

### The `hmd` command (HMD-0001)

| ID | Work point | Spec |
| --- | --- | --- |
| M1 | `scan.py`, `parse.py` — masking, the grammar, heading slugs from `markdown.extensions.toc` | §1–§4 |
| M2 | `resolve.py` — two-phase spine walk, root sweep, folder-note binding, both import forms | §5 |
| M3 | `hmd lint` — sixteen rules with stable IDs, JSON output, CI exit codes | §8 |
| M4 | `embed.py` and `render/flat.py` — expansion, the shared depth constant, `hmd render PATH --to markdown\|html` | §6–§7 |
| M6 | `hmd init` — writes `.hmd/config.toml` with every setting at its default, creates the namespace root it names, refuses to replace an existing config without `--force`, and reports an enclosing project on stderr | §4, §7 (an amendment) |
| M6.7 | A `[namespace]` section written but **not read**, with both facts gated — the tempting next commit is the one that reads it | HMD-0004 |

Gated by `tools/hmd/tests/`: `test_scan.py`, `test_parse.py`, `test_resolve.py`,
`test_imports.py`, `test_embed.py`, `test_render.py`, `test_init.py`.

### The MkDocs plugin (HMD-0002)

| ID | Work point | Spec |
| --- | --- | --- |
| M5.1 | `urls.py` — `a/b.hmd` → `a/b/`, folder notes collapse, source-relative hrefs | §1 |
| M5.2 | Nav derivation, default order, the `nav` frontmatter key with HMD013 validation | §2 |
| M5.3 | `mkdocs_plugin.py` — `on_files` registration of `.hmd` | §5 |
| M5.4 | Expansion and link rewriting at `on_page_markdown` | §3 |
| M5.5 | Red links render as `<a class="hmd-redlink">`, build stays green | §4 |
| M5.6 | Plain `.md` files build as ordinary pages, unlinkable | §4 |
| M5.7 | Expansion-introduced slug collisions dedupe via `toc` and report HMD011 | §3 |
| M5.8 | `on_serve` watcher so `mkdocs serve` livereloads on `.hmd` edits | §5 |
| M5.10 | `[project.entry-points."mkdocs.plugins"]` in `pyproject.toml` | Reference Impl. |
| M5.11 | `use_directory_urls: false` fails the build with a usage error | §1 |
| M5.13 | Namespace root may be a subtree of `docs_dir`; cards serve under its prefix | §2 |
| M5.14 | `hmd://wiki` nav placeholder splices the derived section into an authored nav | §2 |
| M5.18 | `diagram.py` — D2 fences render to a `data:` URI and degrade to a placeholder without the binary | §5 |
| M5.24 | `nav.visibility` gates publication: opt-in, defaulting to private, inherited from folder notes; an unpublished card is not registered at all; HMD017 warns on a published card linking to or embedding one, and such an embed is not expanded | §2 |

Gated by `tests/test_mkdocs.py`.

### Distribution and layout (HMD-0005, HMD-0024)

| ID | Work point | Spec |
| --- | --- | --- |
| W1.1 | Three tools under `tools/` with history preserved | HMD-0024 |
| W1.3 | Conformance corpus at `examples/conformance/`, belonging to every implementation rather than to one | HMD-0024 |
| W2.1 | `tools/hmd/pyproject.toml` builds the `HyperMarkDown` distribution | HMD-0024 |
| W2.2 | Root `pyproject.toml` is a uv workspace root with no `[project]` table | HMD-0024 |
| W2.3 | Every tool carries its own `README.md`, `CHANGELOG.md`, `LICENSE`, and `DEVELOP.md`, none a symlink | HMD-0024 |
| W2.4 | `uv build --package HyperMarkDown` on the release path and the pull-request package check | HMD-0024 |
| W2.5 | The root's three files are the language's, not an index of the tools | HMD-0024 |
| W2.6 | The language's version is read out of the specification card and must have a section in the root changelog | HMD-0024 |
| W3.1 | Python suite split: unit files and the CLI suite under the tool, prose and site guards at `tests/` | HMD-0024 |
| R1 | The rename: `hypermarkdown` is the distribution, import package, plugin key, npm scope, extension publisher, Open VSX namespace, and domain, with a compatibility entry-point alias verified from an installed wheel | HMD-0005 |
| R2 | Published to PyPI through a trusted publisher, verified by installing from the registry | HMD-0005 |

## TODO

### Planned work

| ID | State | Work point | Blocked on |
| --- | --- | --- | --- |
| C5.3 | ready | **The Python corpus runner.** The corpus is written and the TypeScript side runs it. Until Python runs it too, the contract is enforced in one direction only, and the parity suite is doing the real work by shelling out to `hmd lint` | nothing |
| W5 | ready | Text overrides on the workspace index: per-path text supplied by a caller, consulted ahead of any read | nothing — see L1 |
| W6 | ready | Per-card invalidation on the workspace index, replacing the whole-tree load performed once at construction | W5 |
| W7 | blocked | `pygls` server in `tools/hmd`, and where it is declared as a dependency | W5, W6, Q2 |
| W9 | ready | **Determinism test**: the same tree linted twice, and with its files created in a different order, produces byte-identical JSON | nothing |
| W3 | blocked | Configure the path-preserving redirect from `hyper-markdown.org` to `hypermarkdown.org` | registrar configuration, not a commit |
| W8 | parked | Rename the package in the parked integration suite on `feat/vsc-ext-1`, which still says `packages/vscode-HyperMarkDown` | that branch being unparked |

### Broken

| ID | State | Defect | Impact |
| --- | --- | --- | --- |
| B4 | open | `hyper-markdown.org` answers 404 rather than redirecting. Its records point at a forwarding service, so the registrar side is half-configured, but neither address redirects | Every link published under the old host is dead. W3 is the fix, and it is a web form rather than a commit |

### Limitations

| ID | State | Limitation | Why it stands |
| --- | --- | --- | --- |
| L1 | standing | The workspace index reads every card from disk and offers no way to inject an unsaved buffer | Audited against the "text, not paths" requirement: the leaf functions already honour it — `parse(path, text, rel)` takes text, and `Document` carries its own text — so the gap is exactly one layer, `Workspace.__init__` calling `_load`. That is W5 and W6, a patch to one class rather than the rewrite the requirement warns about |
| L2 | standing | The TypeScript side already solved that and this one has not | Not a defect, an asymmetry: the TypeScript core reads through an injectable host port. The Python side has never had a caller that needed it |
| L3 | standing | The sdist does not carry `examples/`, so `hmd lint --root examples/small` does not work from an unpacked archive | Deliberate. The fixture is a repository fixture that both implementations lint, with exactly one copy at the root; carrying it into the tool would mean a duplicate tree or a directory symlink |
| L4 | standing | The same claim is written in more than one place — gates in the repository's `DEVELOP.md` and in each tool's | The cost of per-tool guides, which removed the worse problem: one guide describing tools it did not live beside. Each per-tool guide is authoritative for its own commands. Nothing gates the duplication, and a stale command is a silent defect |
| L5 | standing | `pip install hyper-markdown` keeps installing 0.1.1 forever, and the `hyper-markdown` MkDocs entry-point key survives as an alias | PyPI has no rename. The alias appears in `mkdocs.yml` files this project does not own, where removing it is a hard build failure whose cause is invisible to the site's author. Withdrawal is Q6 |
| L6 | standing | The old Marketplace publisher and the unregistered `@hyper-markdown` npm scope are left as-is rather than tidied | Releasing a publisher name back into the pool lets an impostor take it. Deliberate inaction |
| L7 | standing | Changelog entries keep the old name where they record what a release was actually called | A changelog is a historical record |

### Open questions and blockers

| ID | State | Question |
| --- | --- | --- |
| Q1 | open | Is the language server a subcommand of the existing CLI (`hmd lsp`), or its own console script? |
| Q2 | open | Is `pygls` a base dependency or an `lsp` extra? An extra keeps `pip install HyperMarkDown` small; a base dependency means the server exists wherever the CLI does |
| Q3 | part-resolved | Which language features move to the server first, and how does the editor report an absent server without implying the preview failed? The larger question — whether the extension becomes a client of the Python server — was answered yes on 2026-08-08 |
| Q4 | open | Does canonicity move if a third implementation appears, and what is the procedure? |
| Q5 | open | Should `hmd graph` record each card's resolved search path, so a consumer can see what a card reaches without replaying the algorithm? |
| Q6 | open | When is the `hyper-markdown` entry-point alias withdrawn, and what announces it — a major version, a build-time deprecation warning, or nothing? |
| Q7 | open | Does pruning the abandoned PyPI project mean yanking its releases or deleting it outright? Deletion frees the name for anyone to register and serve to a stale pin |
| Q8 | open | Does `hyper-markdown.org` redirect permanently, or for a fixed window after which the registration is allowed to lapse? |
| Q9 | open | Should `hmd init` seed a starter `index.hmd` in the root it creates? It creates an empty directory today, which lints clean and shows an author nothing — but a card written by a tool is a card somebody has to delete |
| Q10 | open | Should `init` grow `--mode` and `--no-autodiscovery`, or is editing the file it just wrote the right affordance? |
| Q11 | open | Should `hmd lint` report a `[namespace] name` that does not match the address form, or does an unread key stay unchecked until something reads it? |
| Q12 | open | Should the specification's version sentence stop being the parse target for the repository guard, now that a rename has demonstrated the sentence can move? |

## Gates

```bash
uv sync --locked
uv run python -m pytest
uv run hmd lint --root doc/wiki --strict
uv run hmd lint --root examples/small              # exit 0, exactly 1 warning (HMD001)
uv run hmd lint --root examples/cs-alg-sorting --strict
uv run mkdocs build --strict
uv build --package HyperMarkDown
```

The `examples/small` warning is the deliberate red link that shows what an
unwritten page looks like. A clean run there is a regression, not an
improvement.

## Changelog

- 2026-09-14: created, by folding the HMD-0001, HMD-0002, HMD-0005, and
  HMD-0024 trackers into one file about the Python tool. Language-level
  questions moved to [`lang.md`](lang.md) and the site's own rows to
  [`pages.md`](pages.md); `C5.3`, the Python corpus runner, moved *in* from the
  editor line's tracker, where it had been filed next to the TypeScript rows
  that cannot deliver it.
