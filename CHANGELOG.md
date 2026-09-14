# Changelog — the HyperMarkDown language

The history of the **format and its design**: what the language gained, what it
deliberately does not have, and which decisions were reversed. The root of this
repository is the language — the numbered records under
[`doc/proposals/`](doc/proposals/), the models beside them, and the site they are
published as. The software that implements the language lives under `tools/`, and
each package keeps its own history:

| Package | Changelog | Released as |
| --- | --- | --- |
| [`tools/hmd/`](tools/hmd/) | [CHANGELOG.md](tools/hmd/CHANGELOG.md) | [`hypermarkdown`](https://pypi.org/project/hypermarkdown/) on PyPI, tagged `vX.Y.Z` |
| [`tools/hmd-ts-core/`](tools/hmd-ts-core/) | [CHANGELOG.md](tools/hmd-ts-core/CHANGELOG.md) | `@hypermarkdown/core` — not published yet |
| [`tools/hmd-vsc-ext/`](tools/hmd-vsc-ext/) | [CHANGELOG.md](tools/hmd-vsc-ext/CHANGELOG.md) | [`hypermarkdown.hmd`](https://marketplace.visualstudio.com/items?itemName=hypermarkdown.hmd) on the VS Marketplace and Open VSX, tagged `vsc-ext-vX.Y.Z` |

The dependency runs one way. A tool depends on the specification; the
specification does not depend on a tool, and a decision recorded here is never
"whatever the implementation happens to do". The exception is deliberate and is
the project walking its own talk: this repository's documentation *is* a
HyperMarkDown wiki, published by the MkDocs plugin the Python tool ships, so a
specification that made the site unbuildable would be caught by its own
publication.

**The language's version is declared by the specification itself** — the opening
sentence of [`doc/wiki/hmd-lang-spec.hmd`](doc/wiki/hmd-lang-spec.hmd), which
currently specifies HyperMarkDown **0.1** against CommonMark 0.31.2. A version
section here is that number; the dated entries inside it record when each decision
landed, because a language is worked on continuously and released rarely.
`tests/test_docs.py` fails if the card names a version this file has no section
for.

A tool release never implies a language version and a language version never waits
for one. Progress is not tracked here either — the trackers under
`doc/status/` are the only place work is recorded, one per tool plus one for the
language itself.

## [0.1] — drafted

The first version of the language: the six constructs, resolution, the severities,
and the publication model. Still `drafted`, which is what the `0.x` means — a
construct may still change before `1.0`.

### 2026-08-08

#### Added

- **Publication is a property of a card, and it is opt-in.** `nav.visibility`
  decides whether a card reaches a built site at all: absent it, there is no page
  and no URL. Visibility inherits the way `use` does — the card, then the nearest
  ancestor folder note, then the default — so a folder note publishes its whole
  subtree and a card inside opts out on its own. The default runs the strict way
  because the two failure modes are not symmetric: a page that should have
  shipped and did not is visible to its author on the next build, while one that
  shipped and should not have is a leak nobody looks for.
- **`HMD017`** — a published card linking to or embedding an unpublished one.
  Expansion copies the target's bytes into the host page, so the guard cannot sit
  after expansion: the embed case is exactly where an unchecked gate would have
  published private prose inside a public card. A blocked embed degrades to the
  same red link a blocked link gets.

#### Changed

- **`nav` is a mapping, not an integer.** `nav: 10` becomes `nav: {order: 10}`.
  Ordering was simply the dimension that existed first, and `visibility` arrived
  the same day to prove the point — a scalar would have needed a second spelling
  within hours. Widening the value once, before the key had users outside this
  repository, is cheaper than carrying two forms forever. The old form is a
  diagnostic rather than a silent default, because a card carrying it is asking to
  be ordered and the quiet outcome — sorting last — is the failure its author
  would not look for.
- **The repository became a monorepo of tools**, one directory per shippable
  unit, and the language server was decided: Python on `pygls`, living with the
  canonical implementation, because a language server is a semantics server and a
  third home for resolution behaviour is a third thing that can disagree with the
  arbiter. VS Code is a client of that server like any other editor; what does not
  depend on Python is the *preview*, which keeps rendering from TypeScript. One
  existing precaution became load-bearing in the process: every entry point must
  accept a document's *text*, since an unsaved buffer is a language server's
  ordinary input.
  [HMD-0024](doc/proposals/HMD-0024/README.md)

### 2026-08-07

#### Added

- **Diagrams are specified as content, not as a rendering flourish.** A `d2`
  fence becomes its own block kind in the document model, cached by the hash of
  its source, reaching a page as a `data:` URI. The renderer is a binary the
  project depends on rather than a library it links: with no renderer present a
  diagram degrades to its own labelled source, so a missing tool is never a
  failed build. [HMD-0022](doc/proposals/HMD-0022/README.md)
- **A name for computed content, and no syntax for it.** HQL — a card that
  computes its content from the graph instead of listing it by hand — is reserved
  with the constraints any grammar must satisfy and deliberately no grammar.
  [HMD-0003](doc/proposals/HMD-0003/README.md)
- **The hyper web, as a shape rather than a mechanism.** What a module is, what a
  namespace is, and why the two are not the same thing; the form
  `namespace:path/to/card` names a place to look up front, and what answers for
  that name need not be local, static, or singular. No binding syntax and no wire
  protocol. [HMD-0004](doc/proposals/HMD-0004/README.md)

#### Changed

- **A proposal is a complete text.** Records are written to be read start to
  finish by someone who has opened no other file: no feature IDs, question IDs,
  or section numbers standing in for the claim itself, and surviving pointers
  collected in one *See also* section. Subsections are titled by what they cover,
  which is also why heading numbers were removed — a numbered heading is what
  makes `§5.3` citable, and a named one survives an edit.

### 2026-08-06

#### Added

- **The format has a second implementation, and a contract between the two.**
  Cards render live in an editor from a TypeScript implementation, with the
  document model, its typed nodes, and the preview surface specified rather than
  left to the client. [HMD-0020](doc/proposals/HMD-0020/README.md),
  [HMD-0021](doc/proposals/HMD-0021/README.md)
- **Book-mode rendering.** A tree of cards builds as a site: the output URL for a
  card, the nav order, where embeds expand, and how a wiki sits *inside* a
  hand-ordered book. `nav` joins the reserved frontmatter keys, which amends the
  closed set the grammar had fixed. [HMD-0002](doc/proposals/HMD-0002/README.md)

#### Removed

- **"One implementation — semantics live in Python" is retired.** It could not
  survive the parsers in other languages this project expects, and a Rust one is a
  live possibility. What replaced it: Python is canonical, a language-neutral
  conformance corpus is the contract, and an expected-failure ledger makes every
  divergence explicit. Slight drift is acceptable in the short term; silent drift
  is not.
- **A flat-markdown intermediate was rejected** as the transport between the
  implementation and a preview. Flattening destroys the embed boundary before the
  UI ever sees it, and a HyperMarkDown preview whose embeds render as anonymous
  prose has given up the only thing it does that a markdown previewer cannot.
  Erasure stays a *shipping* format: one-way, on purpose.

### 2026-07-31

#### Added

- **The language.** Six constructs on top of GitHub-flavored markdown —
  wikilinks, aliased links, heading links, block anchors, block references, and
  the three embed forms — and nothing else owned. Every `.md` file is already a
  valid `.hmd` file.
- **Deterministic resolution in phases**: explicit imports, then the spine — this
  folder, then each folder above it, probed without recursion — then imported
  search paths, then one sweep of the whole tree, stopping at the first hit. A
  bare name means *an import, or here, or a folder above me*, and can never reach
  sideways into a sibling's namespace without being asked to. A folder is closer
  to a module than to a directory.
- **Ambiguity is an error, not a tie-break.** A name that could mean two pages
  stops the build rather than picking one, because a link that silently changes
  meaning is indistinguishable from one that did not.
- **A compiler's severities.** A link to a page not yet written is a warning and
  renders as a red link — writing forward is how a wiki grows — while an ambiguous
  or malformed link is an error. Everything else about the prose is left alone.
- **Rule IDs, `HMD001`–`HMD016`**, stable and citable, plus the exit codes a CI
  job needs. [HMD-0001](doc/proposals/HMD-0001/README.md)
