# Developing `hmd-semantics`

The builder of a vault's semantic index. This file is the loop for *this* tool.
[The repository's `DEVELOP.md`](../../DEVELOP.md) covers what is shared, and
[`tools/hmd/DEVELOP.md`](../hmd/DEVELOP.md) is the canonical implementation's.

## Prerequisites

[uv](https://docs.astral.sh/uv/) and Python 3.11 or later. Run every command
from this directory.

The tool is its own Python project with its own committed `uv.lock`. It is
**not** a member of the uv workspace at the repository root. uv locks every
extra of every workspace member, so membership would write `torch`,
`transformers` and everything they depend on into the root `uv.lock`, which
the canonical tool's CI installs from. The root's `uv run python -m pytest`
does not run this tool's tests.

## The loop

```bash
uv sync --locked
uv run python -m pytest
```

`uv sync` installs the tool and `pytest`, and nothing else: the `dev`
dependency group holds `pytest`, and `torch` and `transformers` are the extra
`local`, which a bare sync leaves out. The tests need no model and no network.
A fake transport answers the `http` provider and a fake model fills an index,
so the tests cover the tool's own arithmetic and refusals.

The command, from a checkout:

```bash
uv run hmd-semantics build   --vault tests/fixtures/birds --out /tmp/index.sqlite
uv run hmd-semantics verify  --vault tests/fixtures/birds
uv run hmd-semantics inspect --index tests/fixtures/birds/.hmd/index.sqlite
```

`build` with the default `local` provider needs the extra, and the checkpoint
either downloaded or already cached:

```bash
uv sync --locked --extra local
```

## Constraints that are easy to break

- **`vault.py` is a copy of HQL's loader, on purpose.** The text this tool
  embeds and the text HQL hashes must be byte-identical, so `vault.py`
  reimplements `src/document.rs` of [HQL](https://github.com/ewiger/hql),
  including its frontmatter parser. Do not replace the parser with a YAML
  library and do not change which files load or how they are named. A change
  to the text contract is a change to both repositories, made together.
  `tests/test_vault.py` holds the agreement on this side: every card of the
  fixture vault must hash to what the committed index recorded.
- **No dependency.** `http` reaches an endpoint with `urllib`, the
  configuration is read with `tomllib`, and the index is written with
  `sqlite3`. `torch` and `transformers` are imported inside the `local`
  provider only, so importing the package never imports them.
- **Every stored vector is unit length.** `embed.py` normalises whatever a
  provider returned and `store.write` refuses a vector that is not unit
  length. A reader scores with a dot product and trusts `normalized = 1`.
- **A key is never read from the file.** `config.py` refuses a literal
  `api_key`, and the refusal must not print its value.
- **An unknown key in `[semantics.embedder]` is refused,** and so is an unknown
  provider.

## The fixture vault

`tests/fixtures/birds/` is a vault of 56 cards with a committed index at
`.hmd/index.sqlite`. The index was built with the default `local` model before
the tool moved here, so its `tool_version` reads `hql-semantics 0.1.0`.
Rebuilding it needs the model. Rebuild it only when the text contract or the
schema changes, with the stamp pinned so the file is reproducible:

```bash
uv run hmd-semantics build --vault tests/fixtures/birds \
    --built-at 2026-09-18T00:00:00+00:00 \
    --query "night hunting birds" \
    --query "birds swimming underwater catching fish" \
    --query "birds weaving hanging nests"
```

The index records the vault as the path `--vault` was given, so run that
command with the same relative path each time. HQL keeps a copy of this vault
and its index as its own test fixture.

## The files this tool owns

[`README.md`](README.md), [`CHANGELOG.md`](CHANGELOG.md), and
[`LICENSE`](LICENSE) are this tool's own files and none of them is a symlink.
The README is the long description of the distribution, so its links are
absolute. Work is tracked in
[`doc/status/semantics.hmd`](../../doc/status/semantics.hmd), against
[HMD-0028](../../doc/proposals/HMD-0028/README.md).

## Releasing

There is no release. The tool is not published to PyPI and no workflow
publishes it. A distribution name on PyPI cannot be changed after the first
upload, so that upload is the owner's decision; the tracker carries it as a
blocked row.
