# Changelog — `hmd-semantics`

Notable changes to the semantic index builder, newest first. This file covers
**this tool only**; the other tools in the monorepo version themselves and keep
their own changelogs, and [the repository's index](../../CHANGELOG.md) lists
them.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with
the usual `0.x` caveat: **the index schema may change between minor versions.**

The tool is [`hypermarkdown-semantics`](https://pypi.org/project/hypermarkdown-semantics/)
on PyPI, tagged `semantics-vX.Y.Z`. Implementation state is tracked in
[`doc/status/semantics.md`](../../doc/status/semantics.hmd), against
[HMD-0028](../../doc/proposals/HMD-0028/index.hmd).

## [Unreleased]

## [0.2.0] — 2026-11-25

### Changed

- **The namespace root is `location_path`, and defaults to the vault itself.**
  The key was called `wiki`, with the default `doc/wiki`. A vault that still
  sets `wiki` is refused, and nothing is built: the error names both keys.

## [0.1.0] — 2026-11-15

The first release on PyPI.

### Changed

- **Cards come from the namespace root.** `--vault` names the vault root, the
  directory holding `.hmd/`; the cards are read from the directory its `wiki`
  setting names, `doc/wiki` by default, and a card's path in the index is
  relative to it. A vault whose cards sit directly under the vault root sets
  `wiki = "."`. This is HQL's rule from 0.7 on (its issue 0079), and the two
  must agree, since the index hashes the text HQL hashes.
- **A nested vault's cards are left out.** A directory below the namespace root
  that holds its own `.hmd/` is another vault.

### Added

- **The tool, moved here from HQL.** The builder was `contrib/semantics/` in
  [HQL's repository](https://github.com/ewiger/hql), run as `python3 cli.py`
  under the name `hql-semantics`. It is now the distribution
  `hypermarkdown-semantics`, the import package `hypermarkdown_semantics`, and
  the command `hmd-semantics`. Its behavior is unchanged.
- **`hmd-semantics build`** embeds every card of a vault, and each `--query`,
  and writes the index: schema version 1, one vector for each card.
- **`hmd-semantics verify`** exits 1 when an index no longer describes its
  vault: a stale card, a card missing from either side, a vector of the wrong
  length, or a vector that is not unit length.
- **`hmd-semantics inspect`** prints what an index says about itself.
- **Two embedder providers.** `local` runs a checkpoint in the tool's process;
  `http` calls an OpenAI-shaped embeddings endpoint with the standard library.
  A vault declares its embedder in `[semantics.embedder]` of
  `.hmd/config.toml`, and `build` flags override it key by key.
- **The extra `local`** holds `torch` and `transformers`. The tool itself has
  no dependency.

### Changed

- An index's `tool_version` is `hmd-semantics <version>`. An index built before
  the move holds `hql-semantics 0.1.0`; no reader compares the string.
