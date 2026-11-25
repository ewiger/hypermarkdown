# Changelog — `hmd-lsp`

Notable changes to the HyperMarkDown language server, newest first. This file
covers **this tool only**; the other tools in the monorepo version themselves
and keep their own changelogs, and
[the repository's index](../../CHANGELOG.md) lists them.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The package is
[`hypermarkdown-lsp`](https://crates.io/crates/hypermarkdown-lsp) on crates.io,
and each release carries the program for five platforms on
[its GitHub release](https://github.com/ewiger/hypermarkdown/releases).

Implementation state is tracked in
[`doc/status/lsp.hmd`](../../doc/status/lsp.hmd), against
[HMD-0033](../../doc/proposals/HMD-0033/index.hmd).

## [Unreleased]

### Changed

- **The release workflow publishes the package.** An `lsp-vX.Y.Z` tag now
  publishes `hypermarkdown-lsp` to crates.io through a trusted publisher,
  after every platform has built. 0.1.0 was published by hand.

## [0.1.0] — 2026-11-25

The first release. The program is `hmd-lsp`. The package on crates.io is
`hypermarkdown-lsp`, because the name `hmd-lsp` there belongs to an unrelated
project.

### Added

- **The server.** `hmd-lsp` speaks the Language Server Protocol over standard
  input and output, and resolves references through the `hypermarkdown` crate.
- **Semantic tokens** for the page, the fragment, and the display text of each
  reference. A reference that names no card carries the modifier
  `unresolved`, one that names several cards carries `ambiguous`, one whose
  path leaves the namespace carries `outside`, and an embed carries `embed`.
- **Go to definition** on a reference. An ambiguous reference leads to every
  card it could name.
- **Hover** on a reference: the card it names and the rule that found it.
- **Diagnostics** for a reference that does not resolve, with the canonical
  linter's codes and messages: HMD001, HMD002, and HMD003. A client turns
  them off with the `diagnostics` initialization option.
- **Unsaved documents.** The server reads the text in the editor in front of
  the text on disk, so a reference to a card that is not saved yet resolves.
- **A release workflow.** An `lsp-vX.Y.Z` tag builds one program for each of
  Linux x86-64 and ARM64, macOS x86-64 and ARM64, and Windows x86-64, and
  attaches the archives and their SHA-256 digests to the GitHub release.
- **Changes on disk.** The server asks a client that allows it to watch cards
  and vault configurations, and reads a vault again when one changes.
