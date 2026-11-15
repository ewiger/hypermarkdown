# Changelog — `hmd-semantics`

Notable changes to the semantic index builder, newest first. This file covers
**this tool only**; the other tools in the monorepo version themselves and keep
their own changelogs, and [the repository's index](../../CHANGELOG.md) lists
them.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with
the usual `0.x` caveat: **the index schema may change between minor versions.**

The tool is not published to PyPI. Implementation state is tracked in
[`doc/status/semantics.md`](../../doc/status/semantics.md), against
[HMD-0028](../../doc/proposals/HMD-0028/README.md).

## [Unreleased]

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
