# Changelog — `hypermarkdown` (Rust)

Notable changes to the Rust resolver crate, newest first. This file covers
**this crate only**; the other tools in the monorepo version themselves and keep
their own changelogs, and [the repository's index](../../CHANGELOG.md) lists
them.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with
the usual `0.x` caveat: **the format itself may change between minor versions.**

The crate is not published to crates.io. Implementation state is tracked in
[`doc/status/rs-core.md`](../../doc/status/rs-core.md), against
[HMD-0027](../../doc/proposals/HMD-0027/README.md).

## [Unreleased]

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
