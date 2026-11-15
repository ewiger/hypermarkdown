# HMD-0027: `hypermarkdown` — the resolver as a Rust crate

**Status**: drafted
**Created**: 2026-11-15
**Source**: [HQL's record of projects, vaults and its `hmd` package](https://github.com/ewiger/hql/blob/main/doc/proposals/HQL-0059/index.hmd),
which requires HQL to resolve every document reference through HyperMarkdown's
own resolver

## Abstract

The repository gains a third implementation: a Rust library crate named
`hypermarkdown`, in `tools/hmd-rs-core/`. The crate is a resolver. It loads the
cards of one vault, finds the `[[references]]` in each card, reads the
frontmatter keys and the configuration settings that steer resolution, and
resolves a reference from the card that holds it to one card, to no card, or to
an ambiguity with its candidates. It does not lint and it does not render. It
reads a vault through a host trait, so a consumer can supply documents from
memory. It is held to the canonical Python implementation by the conformance
corpus, through a runner that compares resolutions exactly and a ledger of
known differences in which a listed case that passes fails the build. The crate
is not published to crates.io.

## Motivation

HQL, the query language in a sibling repository, is written in Rust and reads a
vault's cards and the links between them. A link between two cards exists only
once a reference is resolved, so HQL needs the resolver, and until now it had to
carry resolution code of its own. That is a second place where the format's
rules live outside this repository, written by reading the specification and
checked against nothing.

- **One behavior.** HQL's own record forbids it from implementing resolution
  independently and requires it to call HyperMarkdown's resolver. That resolver
  has to exist as a Rust library for the requirement to be met.
- **The corpus has to reach it.** A resolver in another repository cannot be
  held by this repository's conformance corpus without copying the corpus and
  letting the copy age. A crate in this repository runs the cases in place.
- **Python cannot be linked.** The canonical implementation is a Python
  package. A Rust program cannot call it without embedding an interpreter or
  starting a process for each vault, and HQL ships as one binary.

The risk is the one every further implementation carries: drift. Two
implementations already answer to the corpus, and the decision that Python is
canonical and that a difference must be written down was taken when the second
one was added. This proposal applies the same arrangement to a third, and
narrows it: the crate implements resolution only, so there is less of it to
drift.

## Goals

- A Rust program resolves a reference exactly as `hmd` does, by calling a
  library.
- The crate runs without a filesystem, over documents the caller holds.
- A difference between the crate and the canonical implementation on any corpus
  case is either absent or written down, and a written-down difference that
  disappears fails the build.

## Non-goals

- **Linting.** The crate emits no diagnostic. What a linter would report about
  a reference is visible in the outcome the resolver returns, and reporting it
  is the caller's work.
- **Rendering.** No heading slugs, no embed expansion, no HTML, no document
  model for a preview.
- **Checking fragments.** A heading or block fragment on a reference is parsed
  and returned. Whether the resolved card has that heading or block is not
  checked, because the crate does not read headings or block anchors.
- **The publication model.** The `nav` frontmatter key is not read, and no card
  is public or private to the crate.
- **References into another vault.** A reference resolves within one vault.
  The format reserves a way to address a card in another namespace and
  specifies no mechanism for it; neither does the canonical implementation, and
  neither does the crate.
- **A command-line tool.** The crate is a library only.
- **Publishing.** No release workflow is added.

## Specification

### The package

The crate is one more tool of the monorepo, and it follows the rules every tool
follows.

- The crate MUST live in `tools/hmd-rs-core/` and MUST be named
  `hypermarkdown`, the project's name in identifiers. It is the name a Rust
  program writes in `use hypermarkdown::Vault`.
- The crate MUST be its own Cargo package with its own committed `Cargo.lock`.
  It MUST NOT be a member of the uv workspace or of the npm workspace at the
  repository root, because neither tool builds Rust.
- The crate MUST carry its own `README.md`, `CHANGELOG.md`, `DEVELOP.md` and
  `LICENSE`, as real files. The license is the MIT text every tool carries,
  byte for byte.
- The crate MUST be a library only, in Rust edition 2024, with a minimum
  supported Rust version of `1.95`. That is the floor of its first consumer.
- The crate root MUST carry `#![forbid(unsafe_code)]`, and the crate MUST NOT
  depend on anything that needs a C toolchain to build, so that it builds
  wherever its consumer does.
- The crate SHOULD depend on as little as possible. Its dependencies are a TOML
  parser for the configuration file and a YAML parser for frontmatter;
  everything else is the standard library.
- Fallible work MUST return a `Result` carrying the crate's error type. Code
  outside tests MUST NOT call `unwrap` or `expect`.

### What the crate does

The crate implements the resolution rules of the format, and nothing here
restates a rule differently from the language specification.

- **Finding references.** A card's references are every `[[...]]` and
  `![[...]]` outside fenced code blocks, HTML comments and inline code spans.
  An indented block is not code. The text between the brackets is split into a
  page reference, an optional heading fragment after `#` or block fragment
  after `#^`, and optional display text after the first bar. A malformed
  reference is not a reference and is left out.
- **Frontmatter.** The `use` key turns autodiscovery on or off for the card,
  and the `import` key holds statements of the form `from <directory> import
  <names>`, where the names are a list, each optionally followed by `as` and an
  alias, or `*`. Frontmatter that is not a YAML mapping contributes nothing, and
  a malformed entry is skipped.
- **Configuration.** Three settings of `.hmd/config.toml` are read: `wiki`, the
  namespace root relative to the vault's root, `doc/wiki` when absent;
  `autodiscovery` in the `[discovery]` table, `true` when absent; and `mode` in
  the same table, `"both"` or `"recursive"`, `"both"` when absent.
- **The namespace root.** Opening a vault from its root on disk takes the
  directory the `wiki` setting names as the namespace root, as the canonical
  implementation does. Loading through a host does not consult `wiki`: the host
  is the namespace root, wherever the caller rooted it.
- **Loading.** Every file whose name ends in `.hmd` under the namespace root is
  a card, except under a file or directory whose name starts with a dot, and
  except in a nested vault. A directory below the root that holds its own
  `.hmd` directory is the root of another vault, and none of its cards load.
- **Resolving.** A reference is resolved from the card that holds it, and the
  rules are tried in this order:

```text
1. by path         a reference opening with "/" binds from the namespace root;
                   one opening with "./" or "../" binds from the card's
                   directory; neither is looked up anywhere else, and a
                   relative one that climbs above the root escapes
2. named import    a single-segment reference bound by one of the card's
                   import statements is the card that statement bound
3. the spine       the card's directory, then each directory above it up to
                   the root; the nearest directory that binds the reference
                   wins
4. search paths    the directories the card imported with "*", in the order
                   written; the first that binds the reference wins
5. autodiscovery   when it is on for the card, every card whose path ends
                   with the reference; one match resolves, and more than one
                   is ambiguous and nothing is chosen
```

- **Binding.** In a directory, a name binds the card `name.hmd`, and failing
  that the folder note `name/index.hmd`. When both exist the card wins.
- **Whether autodiscovery is on.** The card's own `use` key decides; failing
  that, the `use` key of the nearest folder note at or above the card's
  directory; failing that, the configuration. In `recursive` mode the sweep
  covers only the cards beneath the directory of the card holding the
  reference.

### The outcome of a resolution

A caller has to be able to tell every outcome apart without a convention.

- Resolving MUST return one of four outcomes: resolved, with the card's path
  and the rule that found it; unresolved; ambiguous, with the candidates sorted
  by path; or escaping the namespace root.
- Ambiguity MUST NOT be encoded as an absent result. A caller that treats an
  ambiguous reference as unresolved has lost the list of cards the author has
  to choose between.

### The programming interface

The interface is small enough to state in outline; the crate's own
documentation is the reference.

```text
Host                 trait: list a directory, read a file; paths are relative
                     to the namespace root, "/"-separated, "" is the root
FsHost               a Host over a directory, read with std::fs
MemoryHost           a Host over documents held in memory
Config               wiki, autodiscovery, mode; parsed from config.toml text
find_vault_root      the nearest directory at or above a path holding ".hmd"
Vault::load          host and configuration to a loaded vault
Vault::open          a vault root on disk to a loaded vault
Vault::pages         the cards, ordered by path
Vault::page          one card by path
Vault::resolve       source path and page reference to a Resolution
Vault::autodiscovery whether autodiscovery is on for a card
Page                 path, links, the use and import keys as read
Link                 raw text, page reference, fragment, display text, embed,
                     line, column
Reference::parse     the text between the brackets to its parts
Resolution           Resolved, Unresolved, Ambiguous, Escapes
Error                a host failure with its path, or unusable configuration
```

- The resolver MUST reach a vault only through `Host`. This is what lets a
  consumer resolve documents it holds in memory, and it is the property the
  TypeScript implementation has for the same reason.
- A path in the interface MUST be relative to the namespace root with `/`
  between components, on every platform, so that a path means the same card to
  every implementation.
- Parsing a card MUST NOT fail. A card caught half-written is ordinary input.
- A line and a column MUST count as the canonical implementation counts them:
  from 1, the column in characters, in text whose `\r\n` and lone `\r` have
  been read as `\n`.

### Conformance

The corpus holds the crate, and the ledger keeps the corpus honest about it.

- The crate MUST ship a runner, `tests/corpus.rs`, that is part of `cargo
  test` and runs every case under `examples/conformance/cases/`. A case's
  `config.toml`, when present, is that case's `.hmd/config.toml`.
- For each case the runner MUST build every `(source, raw, target)` of every
  reference, with a null target for a reference that did not resolve, sort them
  as the corpus sorts them, and compare them with the `resolutions` of the
  case's `expected.json` for exact equality.
- The runner MUST NOT compare `diagnostics`. The crate emits none.
- Known differences MUST live in `tools/hmd-rs-core/conformance-xfail.json`, in
  the shape the TypeScript ledger has: `cases`, the corpus cases whose
  resolutions the crate gets wrong, each with a reason; and `rules`, the lint
  rules the crate does not emit, each with what the crate does in the situation
  the rule reports.
- A case listed in the ledger that **passes** MUST fail the test. An expected
  failure that starts succeeding and is not removed is how a ledger stops being
  true.
- The `rules` list MUST name every rule the canonical implementation defines.
  The runner reads the canonical rule set and fails when the two differ, so a
  rule added to the canonical implementation cannot go unrecorded here.
- Where the crate and the canonical implementation differ, the canonical
  implementation is right. An `expected.json` or a case's tree MUST NOT be
  edited to make the crate pass.

## Backwards Compatibility

Nothing existing changes. The crate is new, the Python and TypeScript
implementations are untouched, and no corpus case is added or edited. The
repository's guard over the MIT license files gains a fifth file.

## Security Considerations

The crate reads files and parses three formats, on input it does not control.

- **A reference cannot leave the namespace.** Path arithmetic is done on
  strings and follows no symbolic link, and a relative reference that climbs
  above the root is its own outcome and never a path. The `std::fs` host does
  not walk into a symbolic link to a directory, so a link cannot make the walk
  loop or carry it out of the tree.
- **No `unsafe` code** in the crate. The YAML parser it depends on contains
  `unsafe` of its own, as a translation of the reference C parser.
- **Resource bounds.** Loading reads every card under the root into memory
  once. The scanner's search for the end of a code span is quadratic in the
  length of a card in the worst case, which a card made of unmatched backtick
  runs reaches. A consumer that loads vaults it did not write should bound the
  size of a card before handing it to the crate.

## Deployment / Activation

1. The crate lands in `tools/hmd-rs-core/` with its tests, the corpus runner
   and the ledger.
2. CI gains a job that runs `cargo fmt --check`, `cargo clippy --all-targets --
   -D warnings` and `cargo test --locked` in the crate's directory.
3. A consumer depends on the crate from this repository, by git or by path.
4. The crate is not published to crates.io, and its manifest refuses a
   publish. A crate name on crates.io cannot be changed once published, so the
   first publish is the repository owner's decision and is not part of this
   proposal. Until it is taken, a consumer that is itself published to
   crates.io cannot publish a version that depends on the crate.

## Reference Implementation

- `tools/hmd-rs-core/Cargo.toml` and `Cargo.lock` for the package.
- `tools/hmd-rs-core/src/host.rs` for the host trait and its two
  implementations.
- `tools/hmd-rs-core/src/config.rs` for the configuration and vault discovery.
- `tools/hmd-rs-core/src/scan.rs`, `page.rs`, `frontmatter.rs` and `imports.rs`
  for finding references and reading the reserved keys.
- `tools/hmd-rs-core/src/vault.rs` for loading and the resolver.
- `tools/hmd-rs-core/src/text.rs` and `paths.rs` for the string and path
  semantics the canonical implementation takes from Python.
- `tools/hmd-rs-core/tests/corpus.rs` and `conformance-xfail.json` for the
  runner and the ledger.
- `.github/workflows/ci.yml` for the job.

## Test Plan

Unit tests MUST include:

- each resolution rule and its boundaries over an in-memory host: absolute and
  relative references, escaping, named imports and aliases, wildcard imports
  and their order, the spine, autodiscovery in both modes, ambiguity, folder
  notes and the collision with a card, nested vaults, and the three places
  autodiscovery is turned on or off;
- the scanner's masking of fences, comments and code spans, and the positions
  it reports;
- the reference grammar, the import statement grammar, and the reading of
  frontmatter and configuration, each with its malformed inputs.

Integration tests MUST include:

- every corpus case, compared exactly, and the rejection of a ledgered case
  that passes with the reason `<case> is in conformance-xfail.json but now
  passes: remove the ledger entry`;
- the `std::fs` host, vault discovery, and loading a vault from its root over a
  real directory.

```bash
cd tools/hmd-rs-core
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --locked
```

## See also

- [HMD-0020](../HMD-0020/README.md), which specifies the TypeScript
  implementation, establishes that Python is canonical, and defines the
  conformance corpus and the first ledger.
- [HMD-0024](../HMD-0024/README.md), which fixes the repository as a monorepo of
  tools and says what each tool owns.
- [HMD-0001](../HMD-0001/README.md), which specifies the grammar and the
  resolver.
- [`examples/conformance/README.md`](../../../examples/conformance/README.md),
  the corpus and its runners.
- [`doc/status/rs-core.md`](../../status/rs-core.md), where the crate's work is
  tracked.
- [Issue 0011](../../issues/0011-vault-and-namespace-drift-between-hmd-and-hql.md),
  on where the namespace starts in this project and in HQL.

## Changelog

- 2026-11-15: drafted
