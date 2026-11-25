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
| [`tools/hmd-ts-core/`](tools/hmd-ts-core/) | [CHANGELOG.md](tools/hmd-ts-core/CHANGELOG.md) | [`@hypermarkdown/core`](https://www.npmjs.com/package/@hypermarkdown/core) on npm, tagged `ts-core-vX.Y.Z` |
| [`tools/hmd-rs-core/`](tools/hmd-rs-core/) | [CHANGELOG.md](tools/hmd-rs-core/CHANGELOG.md) | [`hypermarkdown`](https://crates.io/crates/hypermarkdown) on crates.io, published by hand |
| [`tools/hmd-lsp/`](tools/hmd-lsp/) | [CHANGELOG.md](tools/hmd-lsp/CHANGELOG.md) | not released yet; to be tagged `lsp-vX.Y.Z` |
| [`tools/hmd-semantics/`](tools/hmd-semantics/) | [CHANGELOG.md](tools/hmd-semantics/CHANGELOG.md) | [`hypermarkdown-semantics`](https://pypi.org/project/hypermarkdown-semantics/) on PyPI, tagged `semantics-vX.Y.Z` |
| [`tools/hmd-vsc-ext/`](tools/hmd-vsc-ext/) | [CHANGELOG.md](tools/hmd-vsc-ext/CHANGELOG.md) | [`hypermarkdown.hmd`](https://marketplace.visualstudio.com/items?itemName=hypermarkdown.hmd) on the VS Marketplace and Open VSX, tagged `vsc-ext-vX.Y.Z` |

The dependency runs one way. A tool depends on the specification; the
specification does not depend on a tool, and a decision recorded here is never
"whatever the implementation happens to do". The exception is deliberate and is
the project walking its own talk: this repository's documentation *is* a
HyperMarkDown wiki, published by the MkDocs plugin the Python tool ships, so a
specification that made the site unbuildable would be caught by its own
publication.

**The language's version is declared by the specification itself** — the
*Version* callout at the top of
[`doc/wiki/hmd-lang-spec.hmd`](doc/wiki/hmd-lang-spec.hmd). That callout is the
only place the number is written; the specification builds on CommonMark
0.31.2. The version follows
Semantic Versioning, so it always has three parts. A version
section here is that number; the dated entries inside it record when each decision
landed, because a language is worked on continuously and released rarely.
`tests/test_docs.py` fails if the card names a version this file has no section
for.

A tool release never implies a language version and a language version never waits
for one. Progress is not tracked here either — the trackers under
`doc/status/` are the only place work is recorded, one per tool plus one for the
language itself.

## [0.1.1] — 2026-11-25

A patch release. It changes the wording of a definition, not the behaviour of
any construct, so every implementation of 0.1.0 also implements 0.1.1.

### 2026-11-25

#### Changed

- **What a vault is.** A vault is the directory where a namespace is stored.
  Its `.hmd/` directory holds the vault's configuration, and tools, including
  HQL and its extensions, may store other data about the vault there, such as a
  search index.
- **The body of the specification says "this version"** instead of repeating
  the version number, so the Version callout is the only place it is written.

## [0.1.0] — 2026-11-25

The first released version of the language: the six constructs, resolution,
the severities, and the publication model, frozen as one text and checked by a
conformance corpus that all three implementations pass. The `0.x` says what
this release does not promise: a later minor version may still change a
construct. `1.0` is the later promise of stability.

### 2026-11-24

#### Added

- **The grammars are written in ABNF** (RFC 5234, with RFC 7405 for
  case-sensitive strings). `ALPHA` and `DIGIT` are ASCII; a character is a
  Unicode scalar value.
- **A link candidate, and what HMD010 is.** A candidate starts at `[[` outside
  an excluded region and ends at the first `]]`, unless a `[`, `]`, or line
  ending comes first. A candidate that does not match the grammar is HMD010,
  reported at its first character; an unclosed `[[` is text. Candidates are
  found inside CommonMark link text, link destinations, and emphasis too.
- **`:` is reserved** for references across namespaces, so a
  `namespace:path` target is HMD010 until that form is specified.
- **A backslash anywhere in a wikilink is HMD010**: in the path, the fragment,
  or the display. A backslash is never a path separator, on any platform. A
  backslash before `[[` is text, outside the wikilink.
- **A directory reference.** A page reference ending in `/` names a directory
  and resolves only to its folder note, and never matches a named import.
  `[[/]]` is the folder note of the namespace root.
- **Exact positions for every diagnostic that has one.** HMD009 at line 1,
  column 1; a bad frontmatter value at its key, or at the key inside `nav`; a
  bad list entry at its first character; HMD006 at the later anchor's `^`;
  HMD008 at the embed that would go too deep, counting the starting card as
  depth 0. Identifiers, severities, conditions, and positions are normative;
  message text is not.
- **Frontmatter edges.** An opening `---` with no closing one starts no
  frontmatter, YAML's `...` does not close it, and an empty block is an empty
  mapping. An empty tag is HMD013.

#### Changed

- **Name resolution is stated as rules first, then an algorithm that obeys
  them.** Resolving a reference within a directory is one step used by every
  phase: it carries a written card extension into each phase, has a
  directory-only form for `[[./]]` and `[[../]]`, and checks the namespace
  boundary, so a reference that escapes the root is reported as such wherever
  it is found. The rules now state containment, explicit extensions, folder
  notes, and when two candidates are the same card. A named import whose card
  has another extension falls through to the next phase, and two search paths
  that reach one card are not a collision. The order of the phases is
  unchanged. The corpus gained a case for each rule, run by all three
  implementations.
- **HMD012 is a warning.** A card beside a module's folder note of the same
  name shadows the note in every phase, the recursive search included, and the
  note stays reachable by its `index` path. That is the convention HMD016 and
  HMD018 already follow: shadowing is a warning, and ambiguity is an error.
- **`wiki` is renamed `location_path`, and its default is `.`**, the vault
  itself, instead of `doc/wiki`. A configuration that still sets `wiki` is
  rejected and the vault is not read, with an error naming the replacement:
  an old configuration fails loudly instead of silently moving the root. An
  enclosing vault's `location_path` must not point into a nested vault.
- **Keywords follow BCP 14** (RFC 2119 with RFC 8174): they are normative only
  in capitals, and SHALL, RECOMMENDED, and OPTIONAL join them.
- **Case is significant everywhere.** Names and card extensions compare code
  point by code point on every platform, so `shout.HMD` is not a card, and a
  block-id fragment matches exactly. Candidate lists, the order of diagnostic
  paths, and `nav` ties sort by code point, whatever the locale.
- **`.` and `..` only in explicit relative references**, with Unix
  semantics, normalised before the containment check.
- **`#` and `^` may appear in heading text**, `^` not first, so
  `[[setup#C# tips]]` reaches `## C# tips`. Whitespace around a page reference
  is trimmed. In an import, spaces or tabs may surround a comma, a name has no
  whitespace, and `from`, `import`, and `as` are case-sensitive.
- **A block anchor may follow tabs as well as spaces**, and trailing spaces or
  tabs after it are allowed and not rendered.
- **Resolution, caught up with the corpus.** A folder note shadowed by a
  sibling card is no longer a candidate by its directory's name and stays
  reachable by its `index` path. HMD003 covers a target inside a nested
  vault, and a later wildcard import that escapes reports HMD003 without
  cancelling a match already found. HMD015 covers an existing directory with
  no card of the imported name.
- **A cycle is a repeated resolved target**, not a repeated spelling, so
  `#One` and `#one` reaching one heading are one cycle (HMD007), and the same
  embed in two separate chains is not a cycle. A heading with an empty
  identifier never yields HMD011.
- **A card may turn autodiscovery on**, not only off.
- **Strict mode is a tool's option**, not a rule: it changes no severity.
- **The conformance corpus is not exhaustive**, and a disagreement between it
  and the specification is settled by the specification.

### 2026-11-22

The decisions that held 0.1 back, taken together.

#### Added

- **CommonMark 0.31.2 is the baseline, named by version.** "Markdown" names a
  family, not a standard. The extras a tool may add on top — tables, task
  lists, strikethrough, footnotes, callouts, maths, and diagram cells — are
  listed one by one and marked non-normative, so a reader sees exactly what
  they are.
- **Encoding, line endings, and positions.** A card is UTF-8; a file that is
  not is reported as **HMD019**, an error, and skipped instead of crashing the
  tool. A leading byte-order mark is ignored, because it is invisible and used
  to hide frontmatter. A line ends at `\n`, `\r\n`, or a lone `\r`, as in
  CommonMark. Lines and columns count Unicode code points from 1, and an offset
  counts UTF-8 bytes: the implementations counted differently, and nothing had
  noticed.
- **Card names are compared after NFC normalisation**, so a link resolves the
  same on macOS and Linux.
- **Determinism is a rule.** The same tree gives the same output whatever
  order the files are read in. The format relied on it without saying so.
- **Setext headings are headings.** `Setup` over `===` or `---` is addressable
  like `# Setup`. The site already anchored them; the tools now agree with it.
- **Diagram cells.** `d2#show` and `mermaid#show` are cells, drawn the way an
  HQL cell is run, and a plain `d2` or `mermaid` fence is a listing. The
  specification names the cell kinds and says their bodies are opaque to the
  resolver; how a tool runs or draws them is guidance, not a rule.
  [HMD-0030](doc/proposals/HMD-0030/index.hmd)

#### Changed

- **A heading fragment matches by a stated key.** The fragment and each
  heading's visible text are normalised the same way — NFC, full case folding,
  everything but letters, marks, and numbers dropped, whitespace collapsed —
  and compared. Letters and digits of every script are kept, so `Ошибка 404`
  and `数据` are linkable. The specification states the rule itself: naming a
  Python library had made the other implementations copy its behaviour,
  bugs included.
- **Duplicate headings: the first wins, and the linter warns** (HMD011). The
  remedy is a block anchor on the later heading, which also ends the warning.
- **An embedded card's own `use` toggles govern its links**, as they would if
  it were read on its own. Textual expansion already behaved this way.
- **Imported search paths stay after the spine**, so importing can never break
  a name that already resolved.

#### Removed

- **`.git` no longer marks a project root.** Only `.hmd/` does: one marker,
  one meaning, which the editor already followed.
- **The `_1` suffix for duplicate headings** leaves the language. An anchor is
  the author's controlled name; a generated suffix is not.
- **Suppression comments.** 0.1 has no way to silence a diagnostic. A syntax
  designed before real use is designed wrong.
- **UTF-16 was considered and turned down.** git treats it as binary, and the
  tool chain reads UTF-8.

### 2026-11-15

#### Changed

- **Markdown files are cards** ([HMD-0029](doc/proposals/HMD-0029/index.hmd)).
  A `.md` or `.markdown` file below the namespace root is a Markdown card: a
  link and embed target with heading anchors and exposed frontmatter, whose
  body is CommonMark and is not scanned. Binding tries `.hmd`, `.md` and
  `.markdown`, then the folder note in the same order. A later extension that
  shares a name is shadowed, reachable only by writing its extension, and
  reported as **HMD018**, a warning. A Markdown card is published wherever its
  file is; HyperMarkdown does not gate it. In an existing vault a `.md` file
  inside the namespace now resolves, and a name it shares with a card found by
  the sweep becomes HMD002.

### 2026-11-13

#### Changed

- **A nested `.hmd/` ends the namespace there.** A directory below the
  namespace root that carries its own marker is another project's root, and
  nothing in its subtree is part of the outer namespace: no page, no resolution
  candidate, no import target. Discovery already stopped at the nearest marker
  when walking up from a card; the specification now says the same about
  loading, so a card belongs to exactly one namespace whichever root a tool is
  handed. References still do not cross the boundary in either direction.

### 2026-10-19

#### Changed

- **The query language is no longer reserved here.** HQL shipped as its own
  project, with its own repository, releases, and documentation at
  [hql-lang.org](https://hql-lang.org/). The record that reserved the name and fixed
    constraints for it is superseded: the language that exists was not designed
  from it, and HQL's own documentation is the authority on all of it — the
  language, and the cells by which a card carries it. What the format still
  owes is its tools rendering those cells, which is open.
  [HMD-0003](doc/proposals/HMD-0003/index.hmd)

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
  [HMD-0024](doc/proposals/HMD-0024/index.hmd)

### 2026-08-07

#### Added

- **Diagrams are specified as content, not as a rendering flourish.** A `d2`
  fence becomes its own block kind in the document model, cached by the hash of
  its source, reaching a page as a `data:` URI. The renderer is a binary the
  project depends on rather than a library it links: with no renderer present a
  diagram degrades to its own labelled source, so a missing tool is never a
  failed build. [HMD-0022](doc/proposals/HMD-0022/index.hmd)
- **A name for computed content, and no syntax for it.** HQL — a card that
  computes its content from the graph instead of listing it by hand — is reserved
  with the constraints any grammar must satisfy and deliberately no grammar.
  [HMD-0003](doc/proposals/HMD-0003/index.hmd)
- **The hyper web, as a shape rather than a mechanism.** What a module is, what a
  namespace is, and why the two are not the same thing; the form
  `namespace:path/to/card` names a place to look up front, and what answers for
  that name need not be local, static, or singular. No binding syntax and no wire
  protocol. [HMD-0004](doc/proposals/HMD-0004/index.hmd)

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
  left to the client. [HMD-0020](doc/proposals/HMD-0020/index.hmd),
  [HMD-0021](doc/proposals/HMD-0021/index.hmd)
- **Book-mode rendering.** A tree of cards builds as a site: the output URL for a
  card, the nav order, where embeds expand, and how a wiki sits *inside* a
  hand-ordered book. `nav` joins the reserved frontmatter keys, which amends the
  closed set the grammar had fixed. [HMD-0002](doc/proposals/HMD-0002/index.hmd)

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

- **The language.** Six constructs on top of CommonMark —
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
  job needs. [HMD-0001](doc/proposals/HMD-0001/index.hmd)
