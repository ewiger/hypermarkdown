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

- **Addresses inside a card** (HMD-0006). `Address::parse` reads the steps
  after `#` and checks every static rule; `Card::read` and `Card::locate`
  resolve an address against one card to a UTF-8 byte span, its text, and any
  warnings; `locate` does both. Heading slugs, block anchors, the block
  segmentation, sentences, words, and lines follow the canonical
  implementation, and the corpus compares every span. A failure is an
  `AddressError` and a warning a `Warning`, each naming the rule it stands for.
  Depends on `unicode-normalization`, for heading slugs.

### Changed

- **`Fragment::Address`** holds a fragment of more than one step, which was
  read as heading text, or dropped when it began with `^`. Exhaustive matches
  on `Fragment` need the new arm.

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
