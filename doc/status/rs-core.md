# STATUS — `hypermarkdown` (Rust)

`tools/hmd-rs-core` — the resolver as a Rust library crate: the scanner that
finds a card's references, the reference and import grammars, the two
frontmatter keys and three configuration settings that steer resolution, vault
loading behind a host trait, and the resolver itself. It is a **third
implementation**, and a narrower one than the other two: it resolves, and it
neither lints nor renders. It exists so a Rust program can resolve a reference
exactly as `hmd` does by calling a library, and it is held to the canonical
implementation by the shared corpus of cases, with every difference written
down.

Beside this file: the format itself in [`lang.md`](lang.md), the canonical
implementation in [`hmd.md`](hmd.md), the TypeScript implementation in
[`ts-core.md`](ts-core.md), its editor in [`vsc-ext.md`](vsc-ext.md), and the
website in [`pages.md`](pages.md).

## Status

**Written, passing every corpus case, and published as `hypermarkdown` 0.1.0.** The crate loads a
vault, finds its references, and resolves them by path, named import, spine,
imported directory and autodiscovery, with ambiguity and a climb above the root
as outcomes of their own. All seven corpus cases produce the resolutions the
canonical implementation wrote, and the list of differing cases in the ledger
is empty. 96 tests.

It is on crates.io as `hypermarkdown`, published by hand at 0.1.0. No workflow
publishes it yet.

Its first consumer is HQL, which is required by its own record to resolve
references through this crate and keep no resolution code of its own.

## Open

| Status | Work | Notes | References |
| --- | --- | --- | --- |
| todo | **Resolve in-card addresses.** Parse a fragment into steps, and resolve one against a card to a byte span: headings, anchors, the shared block segmentation, sentences, words and lines. The crate resolves and does not lint, so a failure is a typed error rather than a diagnostic; the corpus spans are what it is compared against | Follows the TypeScript port. Lifts the limitation that a fragment is parsed and never checked | [[hmd-0006#the-address-after-the-hash]], [[hmd-0027#non-goals]] |
| todo | **A release workflow.** `0.1.0` was published by hand. A tag of the crate's own, in the style of the other tools' tags, should run the gates and publish through a trusted publisher on crates.io, so that no token is stored | Nothing blocks it: crates.io accepts a trusted publisher now that the crate exists | [[hmd-0027#deployment--activation]] |
| backlog | **A comparison suite that asks the canonical implementation.** The corpus pins seven cases. The TypeScript implementation also compares itself with `hmd` over the wiki and two example vaults; this crate was compared with `hmd` by hand, over those trees and over nine thousand generated ones, with every reference, position and outcome equal, and nothing in the repository repeats that | Needs Python in the crate's CI job, which today installs none | [[hmd-0027#conformance]] |

## Broken

Nothing known.

## Limitations (known gaps)

Every lint rule the canonical implementation defines is listed in
`conformance-xfail.json` as not emitted, each with what the crate does in the
situation the rule reports, and the corpus runner fails when the canonical
implementation gains a rule the ledger does not name.

| Limitation | Why it stands | References |
| --- | --- | --- |
| No diagnostics, no rendering, no embed expansion | The crate is a resolver. What a linter would say about a reference is visible in the outcome it returns | [[hmd-0027#non-goals]] |
| A fragment is parsed and never checked | Headings, their slugs and block anchors are not read, so `[[tokens#Rotation]]` resolves to the card whether or not the heading exists | [[hmd-0027#non-goals]] |
| What an import statement got wrong is not reported | A malformed statement, a directory that does not exist and a name that binds nothing are skipped, as the canonical resolver skips them; only its linter reports them | [[hmd-0027#what-the-crate-does]] |
| A relative reference that leaves the root and comes back in through the root directory's own name is `Escapes` | The canonical implementation works on absolute paths, so from a root directory named `wiki` it resolves `[[../wiki/card]]`. A host has no name for its root, and the TypeScript implementation answers as this crate does | [[hmd-0027#the-programming-interface]] |
| `[[notes.]]`, a name ending in a dot, binds `notes.hmd` | The canonical implementation takes this from `pathlib`, which changed it: Python 3.14 answers `notes.hmd` and Python 3.12 and 3.13 answer `notes..hmd`. The crate follows the newest | [[hmd-0027#what-the-crate-does]] |
| Frontmatter that defines one YAML anchor twice is read | The canonical YAML reader refuses a repeated anchor, so the card's `use` and `import` keys are dropped there and honored here | [[hmd-0027#what-the-crate-does]] |
| A symbolic link to a directory is not walked by the `std::fs` host | A link must not make the walk loop or leave the tree. A linked file is a card | [[hmd-0027#security-considerations]] |
| Vault discovery looks for `.hmd/` only | The canonical command-line tool falls back to the nearest `.git` when no marker is found. A library that is handed a path has no use for a guess | [[hmd-0027#the-programming-interface]] |
| The corpus does not pin every rule | No case covers an absolute or relative reference, a wildcard import, `recursive` mode, or the `use` key. Those are held by this crate's unit tests, written from the canonical code | [[hmd-0020#10-conformance-canonicity-and-the-drift-ledger]] |

## Done

- **Markdown cards** — `.md` and `.markdown` files load as `Kind::Markdown`
  cards, bind after `.hmd`, a written extension binds only itself, and a
  shadowed card is named by `Vault::shadowed_by`; released as 0.2.0
  [HMD-0029].

- **Published to crates.io** — `hypermarkdown` 0.1.0, so a consumer that is
  itself on crates.io, HQL among them, can depend on it by version
  [`tools/hmd-rs-core/Cargo.toml`].
- **The resolver** — by path, named import, spine, imported directory and
  autodiscovery, with folder notes, ambiguity, and a climb above the root as
  their own outcomes [[hmd-0027#what-the-crate-does]].
- **Vault loading behind a host trait**, with a `std::fs` host and an in-memory
  one, hidden entries skipped and nested vaults left out.
- **The scanner and the grammars** — references outside fences, comments and
  code spans with their lines and columns, the reference grammar, and the import
  statement.
- **Frontmatter and configuration** — the `use` and `import` keys, and `wiki`,
  `autodiscovery` and `mode` with the canonical defaults.
- **Vault discovery** — the nearest directory at or above a path that holds
  `.hmd/`.
- **The corpus runner and its ledger** — every case compared exactly on
  resolutions; a ledgered case that passes fails the test.

- **A CI job** — format, lints as errors, the tests against the committed
  lockfile, and a build on the minimum supported Rust version.

## Gates

```bash
cd tools/hmd-rs-core
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --locked
```

## Open questions

None.

## Changelog

- 2026-11-15: the question of whether `Vault::open` keeps honoring `wiki` is
  closed: it does. `wiki` is the cards location, where inside a vault the cards
  start, and stays in the format (issue 0011).
- 2026-11-15: `0.1.0` published to crates.io as `hypermarkdown`, by hand, on
  the owner's decision. The manifest no longer refuses a publish.
- 2026-11-15: created with the crate.
