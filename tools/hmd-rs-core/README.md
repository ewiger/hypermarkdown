# hypermarkdown

[![Rust](https://img.shields.io/badge/rust-1.95%2B-b7410e)](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd-rs-core/DEVELOP.md)
[![Documentation](https://img.shields.io/badge/docs-hypermarkdown.org-ffb300)](https://hypermarkdown.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd-rs-core/LICENSE)

The [HyperMarkdown](https://github.com/ewiger/hypermarkdown) resolver as a Rust
library: given a tree of cards, which card a `[[reference]]` names.

It is a resolver. It finds the references in each card, reads the frontmatter
keys and the `.hmd/config.toml` settings that steer resolution, and resolves a
reference to one card, to none, or to an ambiguity with its candidates. It
reports no diagnostics and renders nothing.

Specified by [HMD-0027](https://github.com/ewiger/hypermarkdown/blob/main/doc/proposals/HMD-0027/index.hmd).
The Python package under [`tools/hmd/`](https://github.com/ewiger/hypermarkdown/tree/main/tools/hmd)
is **canonical**: where the two disagree, Python is right and this crate carries
the bug. One of the tools in the
[HyperMarkdown monorepo](https://github.com/ewiger/hypermarkdown); the format
itself is documented at [hypermarkdown.org](https://hypermarkdown.org/).

The crate is [`hypermarkdown`](https://crates.io/crates/hypermarkdown) on
crates.io:

```sh
cargo add hypermarkdown
```

## Use

```rust
use hypermarkdown::{Config, MemoryHost, Resolution, Vault};

fn main() -> Result<(), hypermarkdown::Error> {
    let host = MemoryHost::new([
        ("shared/tokens.hmd", "# Tokens\n"),
        ("specs/login.hmd", "see [[tokens#Rotation]] and ![[glossary]]\n"),
    ]);
    let vault = Vault::load(&host, Config::default())?;

    for page in vault.pages() {
        for link in &page.links {
            match vault.resolve(&page.path, &link.page) {
                Resolution::Resolved { path, via } => println!("{} -> {path} ({via:?})", link.raw),
                Resolution::Unresolved => println!("{} names no card", link.raw),
                Resolution::Ambiguous { candidates } => println!("{} matches {candidates:?}", link.raw),
                Resolution::Escapes => println!("{} leaves the namespace", link.raw),
            }
        }
    }
    Ok(())
}
```

A vault on disk is opened by its root, the directory that holds `.hmd/`. Its
cards are read from the cards location, the `wiki` setting of its
`.hmd/config.toml`: where inside the vault the cards start.

```rust
use std::path::Path;
use hypermarkdown::{Vault, find_vault_root};

fn open(card: &Path) -> Option<Vault> {
    Vault::open(&find_vault_root(card)?).ok()
}
```

## What it covers

| | |
| --- | --- |
| Absolute references | `[[/shared/tokens]]`, from the namespace root |
| Relative references | `[[./tokens]]`, `[[../shared/tokens]]`, from the card's directory |
| Leaving the namespace | any reference that leaves the namespace root, by `..`, through a symbolic link out of the root, or into a nested vault, is `Resolution::Escapes`, in every phase |
| Named imports | `import: from ../shared import tokens`, and `tokens as shared-tokens` for an alias |
| Wildcard imports | `import: from /shared import *`, searched after the spine, in the order written |
| The spine | the card's own directory, then each directory above it; the nearest wins |
| Autodiscovery | a sweep of the namespace for a card whose path ends with the reference; `use: no_autodiscovery` on a card or a folder note, and `[discovery]` in the configuration, turn it off or narrow it |
| Ambiguity | two sweep matches are `Resolution::Ambiguous`, never a tie-break |
| Markdown cards | a `.md` or `.markdown` file is a card a reference can name; it is not scanned, so it holds no references |
| Card extensions | a name binds `.hmd`, then `.md`, then `.markdown`; `[[owl.md]]` binds only `owl.md`, and a later extension sharing a name is shadowed (`Vault::shadowed_by`) |
| Folder notes | a directory's name binds its folder note, `index` with a card extension; a card of the same name wins |
| Nested vaults | a directory below the root that holds its own `.hmd/` is another vault, and none of its cards load |
| Fragments | a heading (`#Heading`), a block (`#^block`) and the display text after a bar are split off a reference and reported with it |
| Configuration | `wiki`, `[discovery] autodiscovery` and `[discovery] mode` of `.hmd/config.toml` |
| Encoding | a card is UTF-8, and a file with a card extension that is not is no card (`Vault::undecodable`); one leading byte-order mark is ignored; a line ends at `\n`, `\r\n` or a lone `\r`; names compare in NFC |

A fragment is parsed and not checked: the crate does not read headings or block
anchors, so it cannot say whether `[[tokens#Rotation]]` names a heading that
exists.

## The host

The resolver reads a vault through one trait, so it runs over a directory, over
documents held in memory, or over whatever a consumer supplies:

```rust
pub trait Host {
    fn list(&self, dir: &str) -> std::io::Result<Vec<Entry>>;
    fn read(&self, path: &str) -> std::io::Result<String>;
}
```

Paths are relative to the namespace root, with `/` between components and the
empty string for the root. `FsHost` reads a directory with `std::fs`;
`MemoryHost` holds documents in memory.

## Conformance

The crate runs every case of the repository's
[conformance corpus](https://github.com/ewiger/hypermarkdown/tree/main/examples/conformance)
and must produce the resolutions the canonical implementation wrote. Known
differences are written down in
[`conformance-xfail.json`](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd-rs-core/conformance-xfail.json);
the list of differing cases is empty.

## License

MIT. See [`LICENSE`](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd-rs-core/LICENSE).
