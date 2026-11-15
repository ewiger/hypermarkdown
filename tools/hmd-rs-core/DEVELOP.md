# Developing `hypermarkdown` (Rust)

The HyperMarkdown resolver as a Rust library crate. This file is the loop for
*this* crate. [The repository's `DEVELOP.md`](../../DEVELOP.md) covers what is
shared, and [`tools/hmd/DEVELOP.md`](../hmd/DEVELOP.md) is the canonical
implementation's.

This crate is a third implementation of resolution, beside the Python and the
TypeScript ones. Where it and the Python implementation disagree, Python is
right and this one carries the bug.

## Prerequisites

Rust 1.95 or later, with `rustfmt` and `clippy`. Nothing else: the crate is its
own Cargo package with its own committed `Cargo.lock`, and it is part of neither
the uv workspace nor the npm one. Run every command from this directory.

## The loop

```bash
cargo fmt
cargo clippy --all-targets -- -D warnings
cargo test --locked
```

CI runs the same three, with `cargo fmt --check`.

## What the crate is, and is not

It resolves. It does not lint and it does not render: no diagnostics, no heading
slugs, no embed expansion, no HTML. A change that adds one of those is a change
to [HMD-0027](../../doc/proposals/HMD-0027/README.md) first.

## Constraints that are easy to break

- **No filesystem outside `host.rs` and `config.rs`.** The resolver reaches a
  vault through the `Host` trait, which is what lets a consumer resolve
  documents it holds in memory. `FsHost`, `Config::read`, `find_vault_root` and
  `Vault::open` are the only code that touches `std::fs`.
- **No `unsafe`, and no dependency that needs a C toolchain.** The crate root
  carries `#![forbid(unsafe_code)]`. The two dependencies are `toml` for the
  configuration file and `serde_yaml_ng` for frontmatter; everything else is
  `std`. A new dependency needs a reason a reviewer can check.
- **No `unwrap` or `expect` outside tests.** Loading returns `Result<_, Error>`;
  parsing a card never fails, because a card caught half-written is ordinary
  input.
- **Python's string semantics, not Rust's.** The canonical implementation
  counts offsets in characters, ends a line at every boundary
  `str.splitlines` knows, treats U+001C to U+001F as whitespace, and replaces a
  file name's suffix the way `pathlib` does. `src/text.rs` and `src/paths.rs`
  restate those; reaching for `str::lines` or `str::trim` in the scanner
  changes an answer on some card.
- **Every module opens with a `//!` comment and every public item carries a
  `///` comment.** The crate warns on a missing one, and CI turns warnings into
  errors.

## Conformance is the point

- **`tests/corpus.rs`** runs every case in
  [`examples/conformance/cases/`](../../examples/conformance/). A case's
  `config.toml`, when present, is the case's `.hmd/config.toml`. The crate's
  resolutions, every `(source, raw, target)` sorted as the corpus sorts them,
  must equal the `resolutions` of the case's `expected.json` exactly. The
  `diagnostics` are not compared.
- **`conformance-xfail.json`** is the ledger of known differences. `cases`
  names corpus cases this crate resolves differently, each with a reason; it is
  empty. `rules` names every lint rule the canonical implementation defines,
  because this crate emits none of them. A ledgered case that **passes** fails
  the test, and so does a rule the canonical implementation defines that the
  ledger does not name.

Never edit an `expected.json` or a case's `tree/` to make this crate pass. The
corpus is generated from the canonical implementation; a case this crate cannot
satisfy goes in the ledger with its reason.

The unit tests beside the code cover each resolution rule over a `MemoryHost`,
and `tests/fs.rs` covers the `std::fs` host, vault discovery and `Vault::open`
over a real directory.

## The files this crate owns

[`README.md`](README.md), [`CHANGELOG.md`](CHANGELOG.md), and
[`LICENSE`](LICENSE) are this crate's own, and `Cargo.toml` lists all three in
`include` so they travel in a package. None of them is a symlink. Work is
tracked in [`doc/status/rs-core.md`](../../doc/status/rs-core.md), against
[HMD-0027](../../doc/proposals/HMD-0027/README.md).

## Releasing

The crate is `hypermarkdown` on crates.io, and `0.1.0` was published by hand
on 2026-11-15, as a first publish has to be: crates.io accepts a trusted
publisher only for a crate that exists. No workflow publishes it yet, and a
version on crates.io cannot be changed or reused. Until a workflow exists, a
release is the changelog section, the version in `Cargo.toml`, then:

```sh
cargo fmt --check && cargo clippy --all-targets --locked -- -D warnings
cargo test --locked
cargo publish --dry-run --locked    # read what the package holds
cargo publish --locked
```
