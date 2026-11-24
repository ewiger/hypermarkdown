# Changelog — `hypermarkdown` (Rust)

Notable changes to the Rust resolver crate, newest first. This file covers
**this crate only**; the other tools in the monorepo version themselves and keep
their own changelogs, and [the repository's index](../../CHANGELOG.md) lists
them.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with
the usual `0.x` caveat: **the format itself may change between minor versions.**

The crate is [`hypermarkdown`](https://crates.io/crates/hypermarkdown) on
crates.io. Implementation state is tracked in
[`doc/status/rs-core.md`](../../doc/status/rs-core.md), against
[HMD-0027](../../doc/proposals/HMD-0027/README.md).

## [Unreleased]

### Added

- **A file that is not valid UTF-8 is not a card.** A file with a card
  extension that does not decode is not loaded and no reference resolves to
  it, where it used to fail `Vault::load` with `Error::Io`.
  `Vault::undecodable` lists such files, in path order; the canonical
  implementation reports each as HMD019. A `Host` signals one by failing
  `read` with `io::ErrorKind::InvalidData`, as `FsHost` does.

### Changed

- **`Import::parse` takes only spaces and tabs as whitespace**, between a
  statement's words and on either side of a comma, as the grammar's `WS`
  says, and refuses a name or alias holding `:` or a reserved character.
- **Breaking: `EntryKind` has a third variant, `LeavesRoot`**, for a symbolic
  link whose target lies outside the namespace root. Neither the entry nor
  anything through it is part of the namespace. `FsHost` reports one instead
  of reading the file it points at, and `Entry::leaves_root` builds one. A
  `match` over `EntryKind` that names every variant no longer compiles.
- **Resolution follows the specification's corrected algorithm.** `.` and
  `..` belong to relative references alone, and are normalised there. In an
  absolute or unqualified reference, such as `/a/../b`, `Reference::parse`
  fails with the new `ReferenceError::DotSegment`, a card leaves such a
  reference out of its links, and `Vault::resolve` returns `Unresolved` for
  it. A relative reference whose last component is `.` or `..` names that
  directory, and binds only its folder note. A path that leaves
  the namespace is `Resolution::Escapes` in every phase: one that climbs above
  the root, enters a nested vault, or meets a symbolic link out of the root.
  It used to be `Unresolved` everywhere but in a relative reference. `./` and
  `../` alone bind only the directory's folder note, the root's included. A
  reference that writes an extension reaches a shadowed card in
  autodiscovery too. A named import whose card has another extension does not
  apply to it. In autodiscovery, a folder note matched by its directory's name
  gives way to a card beside the directory, which claims the same name; the
  note stays reachable by its `index` path.
- **`:` is reserved in a link target**, for namespace-qualified references
  such as `[[namespace:article]]`. `Reference::parse` returns
  `ReferenceError::ReservedCharacter` for one, and the link is left out of
  the card's links.
- **A leading byte-order mark is ignored**, so frontmatter after one is
  frontmatter, and line 1, column 1 is the character after it.
- **A line ends at `\n`, `\r\n` or a lone `\r`, and nowhere else.** A form
  feed, U+2028 and the other boundaries of Python's `str.splitlines` no longer
  end a line, so they no longer open or close a fence or frontmatter, and no
  longer move the line of a reference after them.
- **Names compare in Unicode NFC.** A reference and a name on disk match
  whether either is stored composed or decomposed, and so do an import's
  directory, the names it imports and their local names. Of two files whose
  paths are one path in NFC, the first in path order is the card and the other
  is not loaded. This adds `unicode-normalization` as a dependency.

## [0.2.0] — 2026-11-15

### Added

- **Markdown cards** ([HMD-0029](../../doc/proposals/HMD-0029/README.md)). A
  `.md` or `.markdown` file below the namespace root loads as a card of kind
  `Kind::Markdown`: a reference resolves to it, and it has no links, imports or
  `use` key, since a Markdown card is not scanned. `Page::kind` says which
  kind a card is.
- `Vault::shadowed_by` names the card that shadows a card of the same name in
  the same directory with a later card extension.

### Changed

- **Binding tries `.hmd`, `.md`, `.markdown`**, then the folder note `index`
  with the same extensions in the same order. A shadowed card is never found
  by autodiscovery.
- **A reference that writes a card extension binds only that extension.**
  `[[owl.md]]` reaches `owl.md` beside `owl.hmd`, where 0.1.0 replaced the
  extension with `.hmd`; `[[notes.md]]` no longer binds `notes.hmd`.
- **A name with a dot binds whole.** `[[v1.2]]` binds `v1.2.hmd`, where 0.1.0
  bound `v1.hmd` by replacing what followed the last dot.
- `Page` has a public `kind` field, so a `Page` written as a struct literal
  must name it.

## [0.1.0] — 2026-11-15

### Added

- **The resolver.** `Vault::resolve` resolves a page reference from the card
  that holds it: by path for a reference opening with `/`, `./` or `../`, then
  by named import, the spine, the directories imported with `import *`, and
  autodiscovery. The outcome is a `Resolution`: resolved to one card with the
  rule that found it, unresolved, ambiguous with its candidates, or escaping
  the namespace root.
- **Loading a vault.** `Vault::load` walks a namespace through a `Host`, skips
  hidden entries, and does not enter a directory below the root that holds its
  own `.hmd/`. `Vault::open` loads a vault on disk from its root, reading its
  `.hmd/config.toml`.
- **The host port.** `Host` lists a directory and reads a file; `FsHost` does
  both with `std::fs`, and `MemoryHost` holds documents in memory.
- **Cards.** `Page::parse` finds a card's references outside fenced code
  blocks, HTML comments and inline code spans, with the line and column of
  each, and reads the `use` and `import` frontmatter keys. `Reference::parse`
  splits the text between the brackets into page reference, heading or block
  fragment, and display text.
- **Configuration and discovery.** `Config::parse` reads `wiki`,
  `[discovery] autodiscovery` and `[discovery] mode` with the canonical
  defaults, and `find_vault_root` finds the nearest directory at or above a
  path that holds `.hmd/`.
- **The conformance runner and its ledger.** `tests/corpus.rs` runs every case
  under `examples/conformance/cases/` and compares resolutions exactly;
  `conformance-xfail.json` lists no differing case, and lists every lint rule
  as not emitted.
