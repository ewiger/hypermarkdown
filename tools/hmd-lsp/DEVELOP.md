# Developing `hmd-lsp`

The HyperMarkDown language server, as a Rust program. This file is the loop
for *this* tool. [The repository's `DEVELOP.md`](../../DEVELOP.md) covers what
is shared, and [`tools/hmd-rs-core/DEVELOP.md`](../hmd-rs-core/DEVELOP.md) is
the resolver crate's.

## Prerequisites

Rust 1.95 or later, with `rustfmt` and `clippy`. Nothing else: the tool is its
own Cargo package with its own committed `Cargo.lock`, and it is part of
neither the uv workspace nor the npm one. Run every command from this
directory.

The resolver is a path dependency on `../hmd-rs-core`. A change to the
resolver is visible here on the next build, with no release in between.

## The loop

```bash
cargo fmt
cargo clippy --all-targets -- -D warnings
cargo test --locked
```

CI runs the same three, with `cargo fmt --check`.

## What the server is, and is not

The server tells an editor what a reference resolves to. It asks the
`hypermarkdown` crate, and it keeps no resolution code of its own. When an
answer needs something the crate does not offer, add it to the crate and call
it from here.

The server does not lint. It reports the three outcomes the resolver has for
a reference that does not resolve, and no other rule. A change that adds one
is a change to [HMD-0033](../../doc/proposals/HMD-0033/index.hmd) first.

## The modules

| Module | Holds |
| --- | --- |
| `server.rs` | The capabilities, the message loop, and which function answers each message |
| `workspace.rs` | The open documents, the loaded vaults, and the host that puts a document in front of its file |
| `tokens.rs` | Semantic tokens, their types, and their modifiers |
| `features.rs` | Definition, hover, and diagnostics |
| `links.rs` | Where the page, the fragment, and the display text lie inside a reference |
| `lines.rs` | Positions, converted between code points and UTF-16 units |
| `uri.rs` | `file:` URIs and the paths they name |

## Constraints that are easy to break

- **Positions are converted, always.** The resolver counts a column in
  Unicode code points from 1. The protocol counts from 0 in UTF-16 units. A
  position crosses that boundary only through `lines.rs`. A card with an
  emoji before a link is the test.
- **The text in the editor wins.** Every answer comes from the documents the
  client sent, placed in front of the files on disk. Reading a card with
  `std::fs` anywhere outside the resolver's host breaks this.
- **Standard output belongs to the protocol.** A `println!` corrupts the
  stream and the client drops the connection. Write to standard error.
- **A broken request never ends the server.** A request with parameters the
  server cannot read gets an error response, and the loop goes on.
- **No `unsafe`.** The crate root carries `#![forbid(unsafe_code)]`.
- **Every module opens with a `//!` comment and every public item carries a
  `///` comment.** The crate warns on a missing one, and CI turns warnings
  into errors.

## Tests

- **`tests/protocol.rs`** runs a server on a thread of the test process and
  speaks the protocol to it over a channel. Each test sends the messages an
  editor sends and reads the answers an editor reads. A new request gets its
  tests here.
- **`tests/binary.rs`** starts the built program and runs one session over
  its standard input and output, so the framing and the exit code are
  checked on the real thing.
- The unit tests beside the code cover positions, URIs, and the parts of a
  reference.

## Trying it in an editor

Build the program and point an editor at it. [`README.md`](README.md) has the
configuration for Neovim and for Helix. In VS Code, the HyperMarkDown
extension is the client.

## The files this tool owns

[`README.md`](README.md), [`CHANGELOG.md`](CHANGELOG.md), and
[`LICENSE`](LICENSE) are this tool's own. None of them is a symlink. Work is
tracked in [`doc/status/lsp.hmd`](../../doc/status/lsp.hmd), against
[HMD-0033](../../doc/proposals/HMD-0033/index.hmd).

## Releasing

The server is released as one program for each platform, by
[`release-lsp.yml`](../../.github/workflows/release-lsp.yml). The archives are
attached to the GitHub release, with a `SHA256SUMS` file beside them. The
package is also published to crates.io as `hypermarkdown-lsp`. The name
`hmd-lsp` there belongs to an unrelated project, so the package and the
program have different names. A release is:

1. the changelog section for the version, and the version in `Cargo.toml`;
2. a release of the resolver crate first, when the server needs a version of
   it that crates.io does not have, because a published package cannot depend
   on a path;
3. a run of the workflow by hand (`workflow_dispatch`), which runs every gate
   and builds all five archives, and cuts no release;
4. the tag `lsp-vX.Y.Z` pushed, which builds the archives again, publishes
   the package to crates.io, and cuts the GitHub release.

The package's trusted publisher on crates.io names repository
`ewiger/hypermarkdown`, workflow `release-lsp.yml` and environment
`crates-io`; renaming any of the three breaks publication. 0.1.0 was
published by hand, because crates.io allows a trusted publisher only on a
crate that exists.

The platforms are the five the pinned toolchain serves, and a test in
`tests/test_release.py` holds the two lists together:

| Platform | Archive |
| --- | --- |
| Linux x86-64 | `hmd-lsp-vX.Y.Z-x86_64-unknown-linux-musl.tar.gz` |
| Linux ARM64 | `hmd-lsp-vX.Y.Z-aarch64-unknown-linux-musl.tar.gz` |
| macOS x86-64 | `hmd-lsp-vX.Y.Z-x86_64-apple-darwin.tar.gz` |
| macOS ARM64 | `hmd-lsp-vX.Y.Z-aarch64-apple-darwin.tar.gz` |
| Windows x86-64 | `hmd-lsp-vX.Y.Z-x86_64-pc-windows-msvc.zip` |

Each archive holds one directory, named as the archive is, with the program,
`LICENSE` and `README.md`. The Linux programs link the C library statically,
and the Windows program links the C runtime statically, so each is one file
with nothing to install beside it.

The release profile in `Cargo.toml` strips symbols and optimises the program
as one unit. The program is about 1.5 MB.
