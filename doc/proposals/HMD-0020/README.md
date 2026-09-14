# HMD-0020: `@hypermarkdown/core` — the TypeScript document model

**Status**: drafted
**Created**: 2026-08-06
**Source**: [HyperMarkDown in the editor — Requirements](../../models/requirements/vscode-extension.md)

## Companion notes

- [HMD-0021](../HMD-0021/README.md) — the VS Code extension that consumes this
  package. Everything editor-shaped lives there; this record stops at the
  package boundary.

## Abstract

This proposal defines `@hypermarkdown/core`, a TypeScript implementation of
the HyperMarkDown parser, resolver, and renderer that runs with no Python
present. It pins a three-stage pipeline — a markdown-it front end extended with
rules for the six constructs HMD-0001 owns, a port of the HMD-0001 §5 resolver
behind an injectable filesystem port, and a renderer emitting a **document IR**
in which ordinary GFM content is opaque HTML and every HyperMarkDown construct
survives as a typed node carrying its source span. It retires principle P5
(*one implementation*) and replaces it with a language-neutral conformance
corpus at `examples/conformance/`, a canonical-implementation rule naming
Python as the reference, and an expected-failure ledger that makes divergence
explicit and bounded. No language server, no editor API, and no new lint rule IDs.

## Motivation

Sketch §15 routes every semantic feature of the editor through `hmd lsp`, on
the strength of P5: semantics live in Python, editors are thin clients. Three
things have changed since that was written.

- **P5 is already spent.** The project expects parsers in more than one
  language; a Rust implementation is a live possibility. A principle that the
  roadmap intends to violate is not protecting anything — it is deferring the
  moment the protection has to be designed. Designing it now, while there is
  exactly one implementation to measure a second against, is the cheap moment.
- **A Python runtime dependency is the extension's largest onboarding cost.**
  Interpreter discovery, version matrices, virtualenv detection, and a
  "Python not found" first-run experience are all avoidable, and avoiding them
  is worth more than the drift they were buying protection against.
- **The flat-markdown intermediate is wrong for a preview.** The obvious way to
  reuse the Python semantics — resolve and expand in Python, emit flat
  markdown, render it in JavaScript — destroys the structure the preview exists
  to display. Once `![[token#^definition]]` has become an anonymous paragraph,
  no renderer downstream can draw it as an embedded card with its own
  provenance and its own jump-to-source. Preview is the product (sketch §14),
  and the intermediate representation has to carry the hyper layer intact.

**Risk this proposal must not defer.** Two implementations of one grammar drift
silently unless something fails loudly. The corpus of §10 is not a test-suite
nicety here; it is the entire replacement for P5, and it MUST exist before the
second implementation ships anything a user can depend on.

## Goals

- One TypeScript package that parses, resolves, and renders HyperMarkDown with
  no Python, no network, and no VS Code API.
- A document IR precise enough that a renderer can draw embeds as embeds and a
  graph view can consume the same data.
- A conformance contract that makes Python-vs-TypeScript divergence visible in
  CI on the day it appears.
- Positional fidelity: every rendered element traces to a source line, which is
  what makes scroll sync and click-through possible at all.

## Non-goals

- **A language server.** Sketch 68 and §15. Deferred without prejudice; §11
  states the one constraint that keeps the option open.
- **Rendering parity with MkDocs.** The Python renderer targets a static site;
  this one targets a sandboxed webview under a strict CSP. §3 pins where they
  deliberately differ.
- **Write access.** Nothing in this package modifies a workspace.
- **Queries, templates, inline properties, and tags** — sketch 10, 34–41,
  56–61, 79–86. Out of scope in HMD-0001, out of scope here.
- **New lint rules.** See §9: rule ID allocation stays with the canonical
  implementation.

## Specification

### 1. Package layout and boundaries

The repository gains a JavaScript half that never touches the Python half.

```text
package.json                 npm workspaces root, private
tools/hmd-ts-core/           @hypermarkdown/core
tools/hmd-vsc-ext/           the extension (HMD-0021)
doc/status/ts-core.md        implementation status, JS side
examples/conformance/cases/  the shared corpus (§10)
```

- `tools/hmd-ts-core` MUST NOT import `vscode`, and MUST NOT import
  `node:fs`, `node:path`, or any other Node builtin. All filesystem access goes
  through the `WorkspaceHost` port of §6. This is what makes the package usable
  from a browser playground, from a web extension, and from an in-memory test
  without a temporary directory.
- The published package name is `@hypermarkdown/core`. It targets **ES2022**,
  ships ESM with type declarations, and declares `"sideEffects": false`.
- Toolchain is pinned: **TypeScript 5.x**, **esbuild** for bundling, **vitest**
  for unit and corpus tests, **Node 20 or later** for development. `strict` is
  on in `tsconfig.json`, including `noUncheckedIndexedAccess`.
- Nothing under `tools/hmd/`, `doc/proposals/HMD-0001`, or
  `doc/proposals/HMD-0002` is modified by work under this proposal. The Python
  and TypeScript halves are developed on separate branches and merged in both
  directions; keeping the file sets disjoint is what makes that cheap.

### 2. Pipeline

Three stages, separately testable, with the IR as the only contract a consumer
sees.

```text
source text
  │  mask HTML comments (§3.1)
  ▼
markdown-it + hmd rules        →  token stream (GFM tokens + hmd tokens)
  │
  ▼
resolver (§6)                  →  bindings: token → resolved path | unresolved
  │                                          | ambiguous
  ▼
IR builder (§7)                →  Document IR (JSON-serialisable)
  │
  ▼
consumer                          webview renderer, graph view, diagnostics
```

- Each stage MUST be a pure function of its input plus the `WorkspaceHost`
  snapshot. No stage consults a clock, a random source, the network, or
  filesystem iteration order (P1).
- The IR MUST be JSON-serialisable, because the consumer that matters most
  reaches it across a `postMessage` boundary.

### 3. Parser front end

markdown-it is the GFM baseline, configured for parity with the Python
extension stack rather than for its own defaults.

```text
markdownIt({ html: false, linkify: false, typographer: false, breaks: false })
  .disable("code")
```

- `html: false` — raw HTML in a card is escaped rather than passed through.
  Python-Markdown passes it through; this is a **deliberate divergence**,
  recorded in the ledger of §10, because a webview that renders workspace HTML
  is a script-injection surface reachable from any cloned repository.
- `linkify`, `typographer`, and `breaks` are off, because the Python-Markdown
  extension list of HMD-0001 §9 enables no equivalent.
- **`code` MUST be disabled.** markdown-it treats a four-space indent as a code
  block; HMD-0001 §1 deliberately does not mask indented blocks, because under
  `admonition` and `footnotes` a four-space indent marks a callout body or a
  footnote continuation. Leaving the rule enabled would silently drop real
  links from ordinary prose — the exact failure HMD-0001 rejected.

#### 3.1 Masking

Fenced code and code spans need no masking: markdown-it never runs inline rules
inside them. HTML comments do, because `html: false` turns them into ordinary
text.

- Before tokenisation, every HTML comment region MUST be replaced
  character-for-character with U+0020, preserving newlines and therefore
  preserving every byte offset in the file. Offsets are how diagnostics and
  scroll sync stay correct; a masking pass that shifts them is worse than none.
- Comments are absent from the output, which matches Python-Markdown.

#### 3.2 Construct rules

The six constructs of HMD-0001 §2 are added as markdown-it rules. Rule
ordering is normative because `[[` and `![[` both collide with builtin rules.

| Rule | Registration | Produces |
| --- | --- | --- |
| `hmd_embed` | `md.inline.ruler.before("image", …)` | `hmd_embed` token |
| `hmd_wikilink` | `md.inline.ruler.before("link", …)` | `hmd_wikilink` token |
| `hmd_anchor` | `md.core.ruler.after("inline", …)` | strips a trailing `^id`, records an anchor |

- The grammar accepted MUST be exactly HMD-0001 §2, including the reserved
  character set `[ ] | # ^` and newline, the optional redundant `.hmd` suffix,
  the rejection of `[[Page|]]`, and the `block_id` shape
  `ALPHA / DIGIT *63( ALPHA / DIGIT / "_" / "-" )`.
- A malformed construct MUST produce `HMD010` and MUST render as its literal
  source text. Swallowing it would hide the defect from the very preview whose
  job is to surface it.
- Every produced token MUST carry a `Span` (§7). Block tokens take their line
  range from markdown-it's `token.map`, converted from 0-based-exclusive to
  1-based-inclusive. Inline tokens carry no map, so the rules MUST record the
  absolute source offset themselves and convert it through a line index built
  once per parse.

#### 3.3 Free syntax

The "free" half of the format (sketch 11–17) is bought, not built, on this side
too. The mapping is pinned so a gap is a known gap:

| HMD-0001 §9 extension | markdown-it equivalent | v1 |
| --- | --- | --- |
| `tables` | builtin | yes |
| `pymdownx.superfences` | builtin `fence` | yes |
| `pymdownx.tasklist` | `markdown-it-task-lists` | yes |
| `pymdownx.tilde` | builtin `~~` strikethrough | partial — subscript `~x~` unsupported |
| `footnotes` | `markdown-it-footnote` | yes |
| `admonition` | `markdown-it-admonition` | yes |
| `pymdownx.details` | none | **gap** — `???` renders as a plain admonition, not collapsible |
| `pymdownx.arithmatex` | `markdown-it-texmath` + KaTeX | yes |
| `toc` | own slugger (§4) | yes |
| `mkdocs-d2-plugin` | none | **gap** — a `d2` fence renders as a labelled code block |

- KaTeX and its fonts MUST be bundled locally. A webview under the CSP of
  HMD-0021 cannot fetch them, and a preview that silently loses its math on an
  offline machine is worse than one that never had it.
- Every row marked *gap* or *partial* MUST appear in the ledger of §10.

### 4. Heading slugs

A heading link resolves against a slug, so the slugger is a conformance
surface, not an implementation detail. HMD-0001 §3 delegates to
Python-Markdown's `toc`; this reproduces it exactly.

```text
slug(text):
  1. NFKD-normalise text
  2. drop every code point above U+007F
  3. delete every character not matching [A-Za-z0-9_\s-]
  4. strip leading and trailing whitespace, then lowercase
  5. collapse every run of [-\s]+ to a single "-"
```

- Collisions within one page MUST be deduplicated in document order by
  appending `_1`, `_2`, … — so `[[Page#Section]]` addresses the first and
  `[[Page#Section_1]]` the second, and a collision also raises `HMD011`.
- A heading fragment MUST be matched by slugging it and comparing, so
  `[[Page#My Section]]` and `[[Page#my-section]]` are the same link.
- The slugger MUST be covered by corpus cases carrying non-ASCII headings,
  punctuation, and collisions. It is the single most likely place for two
  implementations to disagree without anyone noticing.

### 5. Frontmatter and configuration

- Frontmatter MUST be a `---` fence beginning at byte 0, closed by a `---`
  line, parsing as a YAML mapping (`HMD009` otherwise). It is removed before
  markdown-it sees the source, with offsets preserved as in §3.1.
- YAML MUST be parsed with `js-yaml` under `JSON_SCHEMA` or a schema no broader
  than YAML 1.2 core. The default schema resolves custom tags and is the
  JavaScript analogue of `yaml.load` over `yaml.safe_load`.
- The reserved keys are exactly `tags`, `use`, and `import`, with the shapes of
  HMD-0001 §5.3. Every other key stays user-owned and is carried into the IR
  unexamined (P3).
- `.hmd/config.toml` MUST be read for `wiki`, `[discovery] autodiscovery`, and
  `[discovery] mode`, and for nothing else. TOML parsing uses `smol-toml`.
- The project root is the nearest ancestor holding `.hmd/`, falling back to the
  nearest holding `.git`; the namespace root defaults to `doc/wiki`. An
  explicit root passed by the host overrides both.

### 6. Resolver

A port of HMD-0001 §5, phase for phase: the explicit import table, then the
non-recursive spine walk toward the root, then the single whole-tree sweep.

- The algorithm MUST NOT be re-derived. Where this document and HMD-0001 §5
  disagree, HMD-0001 wins and this document is wrong.
- All filesystem access goes through one port:

```text
interface WorkspaceHost {
  readFile(path: string): Promise<string>
  listDirectory(path: string): Promise<DirEntry[]>
  readonly root: string
}
```

- `listDirectory` results MUST be sorted by the core before use. Depending on
  host iteration order would make resolution vary by platform, which is P1's
  first casualty.
- A resolved target MUST be normalised and then checked for containment in the
  namespace root before any read (`HMD003`), and symlinks MUST NOT be followed
  out of the root.
- The workspace index maps every card path to its parsed document, its
  headings, its anchors, and its outbound edges, and maintains the reverse edge
  map that backlinks and the graph view consume. Invalidation is per card: an
  edit re-parses one document and re-resolves the cards whose bindings could
  have changed — the edited card and its inbound neighbours — never the tree.

### 7. The document IR

The IR carries GFM as opaque HTML and the hyper layer as typed nodes. That
split is the whole design: the renderer needs no markdown knowledge, and no
consumer can accidentally lose an embed boundary by treating it as text.

```text
Document := {
  irVersion:   1
  path:        string        // root-relative, POSIX separators
  breadcrumb:  string[]      // namespace segments, root first
  frontmatter: object
  headings:    Heading[]     // { level, text, slug, span }
  anchors:     Anchor[]      // { id, span }
  blocks:      Block[]
  diagnostics: Diagnostic[]
}

Block := HtmlBlock | EmbedBlock

HtmlBlock := {
  kind: "html"
  html: string               // rendered fragment, inline constructs already
  span: Span                 // rendered as <a data-hmd-*> elements
}

EmbedBlock := {
  kind:       "embed"
  target:     TargetRef
  resolution: Resolution
  document:   Document | null    // expanded child; null when unresolved
  depth:      number             // 0 at the top level
  span:       Span
}

TargetRef  := { raw, form: "absolute"|"relative"|"bare",
                page, fragment: Fragment|null, display: string|null }
Fragment   := { kind: "heading"|"block", value: string, slug: string|null }
Resolution := { state: "resolved"|"unresolved"|"ambiguous",
                path: string|null, candidates: string[] }
Span       := { line, endLine, column, offset, endOffset }
```

- `line` and `column` are **1-indexed**; `offset` is a 0-indexed UTF-16 code
  unit offset, because that is what a VS Code `Position` is built from.
- `irVersion` MUST accompany every serialised document. A consumer receiving an
  unknown version MUST refuse to render rather than guess — a stale webview
  after an extension update is the ordinary case, not an exotic one.
- An embed that occupies its paragraph alone is an `EmbedBlock`. An embed
  appearing mid-sentence renders inline inside an `HtmlBlock` instead, since a
  card cannot sit inside a sentence.
- Every block-level element inside `HtmlBlock.html` MUST carry `data-line` with
  its 1-indexed source line. This is the sole mechanism behind scroll sync and
  click-through (VSX-014, VSX-021).
- Every `Block` MUST carry a `key`: a stable identity derived from the block's
  content and its position among its siblings, not from its line number. Two
  parses of a buffer differing only by an edit elsewhere MUST produce the same
  `key` for an untouched block. This is what lets a renderer patch a live
  preview instead of rebuilding it, which is what preserves scroll position and
  embed collapse state while the author types (VSX-019).
- The parser MUST NOT fail on partial input. An unterminated construct, an
  unclosed fence, and frontmatter with no closing `---` each yield a document —
  the incomplete region as literal text, everything else parsed normally. A
  buffer captured mid-keystroke is the *ordinary* input to this package, not an
  error case, and a parser that throws on it makes live preview impossible
  (VSX-018).
- Inline constructs render to a pinned shape, which is the contract HMD-0021's
  renderer binds to:

```text
resolved    <a class="hmd-link" data-hmd-path="specs/auth/tokens.hmd"
               data-hmd-fragment="rotation" data-line="12">display</a>
unresolved  <a class="hmd-link hmd-redlink" data-hmd-target="idempotency"
               data-line="12">idempotency</a>
ambiguous   <a class="hmd-link hmd-ambiguous" data-hmd-target="tokens"
               data-line="12">tokens</a>
```

- Class names and `data-hmd-*` attributes are a stable interface. Renaming one
  is a breaking change to `@hypermarkdown/core`.

### 8. Embed expansion

Expansion follows HMD-0001 §6 and shares its constants.

- `![[Page]]` expands to the target's body with frontmatter removed;
  `![[Page#Section]]` to the heading and everything up to the next heading of
  the same or higher level; `![[Page#^id]]` to the anchored block with its
  trailing marker stripped.
- Expansion is recursive and builds a child `Document` per level, so the
  renderer receives a tree and can collapse, label, and navigate each level.
- The expander MUST maintain a stack of `(resolvedPath, fragment)` pairs;
  re-entering a pair on the stack is `HMD007`.
- Maximum depth is **16**, exceeding it is `HMD008`, and the limit MUST be one
  exported constant shared with any future template engine rather than a
  literal repeated at each call site.
- Heading levels MUST NOT be shifted in expanded content, matching HMD-0001.

### 9. Diagnostics

- Diagnostics MUST use the rule IDs, severities, positions, and message
  intent of HMD-0001 §8 — `HMD001` through `HMD016`.
- Each diagnostic carries `rule`, `severity`, `path` (root-relative, POSIX
  separators), `line`, `column`, `message`, and for `HMD002` the sorted
  candidate list.
- Diagnostics MUST be emitted sorted by `(path, line, column, rule)`.
- **The TypeScript implementation MUST NOT allocate new `HMD` rule IDs.** Rule
  ID allocation belongs to the canonical implementation (§10). A condition only
  this implementation can detect — a document too large to index, a host read
  failure — is reported through the consumer's own channel, never as a rule.

### 10. Conformance, canonicity, and the drift ledger

This section replaces principle P5.

**Canonicity.** The Python implementation under `tools/hmd/src/hypermarkdown/` is
canonical. Where the two disagree on a case the corpus covers, Python defines
the correct answer and TypeScript carries the bug. Canonicity is about
arbitration, not quality: it exists so that "which one is right?" is never a
discussion.

**Corpus layout.** Cases are language-neutral data, and live outside both
implementations' test trees:

```text
examples/conformance/
  cases/<case-name>/
    tree/                 the input namespace, .hmd files and directories
    config.toml           optional; the case's .hmd/config.toml
    expected.json         { diagnostics: [...], resolutions: [...] }
  README.md               the case-authoring convention
```

- `expected.json` MUST record diagnostics in the sorted order of §9 and
  resolutions as `(sourcePath, rawTarget) → resolvedPath | null`, sorted.
  Both are plain data, so neither implementation's object model leaks into the
  contract.
- Each implementation MUST ship a runner that executes every case in
  `examples/conformance/cases/` and is part of its default test command.
- This **supersedes** HMD-0001's Test Plan, which places the corpus at
  `tests/corpus/<case>/`. The corpus was unbuilt when this proposal was
  written, so the move costs nothing; a corpus living inside one
  implementation's test tree would have quietly become that implementation's
  property.

**The ledger.** Divergence is permitted, silence is not.

- Known divergences live in `tools/hmd-ts-core/conformance-xfail.json`, each
  entry naming the case, the reason, and an issue reference.
- A ledger entry that **passes** MUST fail the build. An expected failure that
  starts succeeding and is not removed is how a ledger rots into a lie.
- The rendering divergences of §3 (`html: false`, `pymdownx.details`, D2,
  `pymdownx.tilde` subscript) are ledger entries from day one.

### 11. Determinism and resource bounds

- No stage performs network access, consults a clock, or reads a random source
  (P1).
- Parsing and resolving one document MUST be independent of which other
  documents happen to be indexed, except through the resolver's own declared
  phases.
- Expansion is bounded by the depth limit of 16 and by cycle detection; there
  is no other unbounded recursion in the package.
- The one constraint kept for a possible future language server: every
  entry point MUST be callable with a document's *text* rather than its path,
  so an in-memory buffer is a first-class input. An implementation that can
  only read from disk cannot serve an unsaved editor buffer, and retrofitting
  that is a rewrite.

## Backwards Compatibility

Nothing is released on the JavaScript side, so there is no API to break. Three
project-level effects:

- **Principle P5 is retired.**
  [`initial_sketch.md`](../../models/requirements/initial_sketch.md) §2 states
  it, and §15 builds the editor architecture on it. Both should be annotated
  once this proposal is accepted; the sketch's status as a v0.1 draft means the
  annotation is cheaper than a rewrite.
- **The conformance corpus moves** from HMD-0001's `tests/corpus/` to
  `examples/conformance/cases/`, per §10. HMD-0001's Test Plan should be
  amended when it is next revised.
- **The Python implementation is unaffected.** No file under `tools/hmd/` or
  the HMD-0001 and HMD-0002 proposal folders changes under this proposal,
  which is what lets the two branches merge in either direction without
  conflict.

## Security Considerations

The package parses untrusted content — a cloned repository is untrusted input —
and its output is injected into a webview.

- **Raw HTML is escaped, not passed through** (§3). This is the primary
  mitigation for script injection through workspace content, and the reason the
  divergence from Python-Markdown is accepted rather than resolved in favour of
  parity.
- **Path traversal.** Every resolved path is normalised before the containment
  check, and symlinks are not followed out of the root (§6). An `import`
  statement's `ref` is a second traversal surface and takes the same treatment.
- **YAML.** `js-yaml` with a schema no broader than YAML 1.2 core (§5); the
  default schema is the analogue of the `yaml.load` this project already
  forbids.
- **Resource exhaustion.** Expansion is bounded by depth 16 and cycle
  detection. The construct rules operate on bounded slices rather than
  backtracking regular expressions, so no input yields super-linear matching.
- **No network access from the package**, in any stage, ever. CSP enforcement
  for the webview is HMD-0021's concern; this package's contribution is having
  nothing to fetch.

## Deployment / Activation

1. Scaffold the workspace root, `tools/hmd-ts-core`, and CI for the JavaScript
   half, with no behaviour beyond a passing empty test run.
2. Land the parser front end (§3, §4, §5) with unit coverage, before any
   resolver work.
3. Extract the corpus (§10) from the existing Python suite and add the Python
   runner, on the Python branch. **This gates everything after it** — the
   resolver port without the corpus is the drift this proposal exists to
   prevent.
4. Land the resolver port (§6) against the corpus, ledger entries and all.
5. Land expansion (§8) and the IR builder (§7).
6. Publish `@hypermarkdown/core` at `0.1.0` only once the ledger is empty of
   entries that are not deliberate design divergences.

Steps 2 and 4 are the ones that can be usefully parallelised with the Python
branch's M4/M5 work, since they touch disjoint files.

## Reference Implementation

```text
tools/hmd-ts-core/src/
  index.ts            public API surface
  host.ts             WorkspaceHost port and DirEntry
  config.ts           .hmd/config.toml, root discovery
  frontmatter.ts      the --- fence, js-yaml, reserved keys
  mask.ts             HTML-comment masking, offset-preserving
  parse/
    markdownit.ts     configured instance, plugin wiring
    constructs.ts     hmd_wikilink, hmd_embed, hmd_anchor rules
    slug.ts           the §4 slugger and collision dedup
  resolve/
    index.ts          the three phases of HMD-0001 §5
    imports.ts        from … import … as … bindings
    workspace.ts      the index and its invalidation
  expand.ts           embed expansion, depth 16, cycle stack
  ir.ts               IR types, the builder, irVersion
  diagnostics.ts      HMD001–HMD016 construction and ordering
tools/hmd-ts-core/test/
  corpus.test.ts      the conformance runner
  conformance-xfail.json
```

## Test Plan

Unit tests (vitest) MUST include:

- Masking: `[[x]]` inside a fence, a code span, and an HTML comment yields no
  link; a four-space-indented `[[x]]` **does** yield one, per §3.
- Grammar: each production of HMD-0001 §2 at its boundaries — empty display,
  each reserved character, a 64-character `block_id` and a 65-character one, a
  redundant `.hmd` suffix.
- Slugs: non-ASCII headings, punctuation, and collisions producing `_1`/`_2` in
  document order; heading fragments matching both raw text and slug form.
- Spans: every construct's `Span` maps back to the exact source substring, on
  input containing CRLF line endings and astral-plane characters.
- Resolution: absolute, relative, and bare forms; a nearer spine entry beating
  a distant one; ambiguity producing `HMD002` with sorted candidates; a target
  outside the root producing `HMD003`.
- Expansion: a section embed stopping at the next same-or-higher heading; a
  two-page cycle producing `HMD007`; a 17-deep chain producing `HMD008`; a
  nested embed appearing as a nested `Document` in the IR.
- IR: every block carries `data-line`; an unresolved link renders with
  `hmd-redlink`; an unknown `irVersion` is refused.
- Determinism: parsing the same tree twice, and with `listDirectory` returning
  entries in reverse order, produces byte-identical IR.
- Partial input: a buffer truncated at every byte offset of a fixture card
  parses without throwing, and each result is a renderable document. This is
  the cheapest possible fuzz test for live editing and it covers every
  mid-keystroke state the format admits.
- Key stability: inserting a paragraph at the top of a document leaves every
  following block's `key` unchanged; editing one block changes only its own.

Integration tests MUST include:

- The full corpus of §10, with the ledger honoured and an unexpectedly-passing
  ledger entry failing the run.
- `examples/small/` parsed and resolved by the TypeScript implementation,
  producing exactly the diagnostics the Python implementation produces — zero
  errors and the one deliberate red-link warning.

```bash
npm ci
npm run -w @hypermarkdown/core test
npm run -w @hypermarkdown/core lint
```

## Open Questions

- Should `pymdownx.details` (`???` collapsible callouts) be implemented as a
  markdown-it plugin in this package, or dropped from the format? A ledger
  entry that never closes is a spec decision in disguise.
- How exactly is a `Block.key` (§7) derived, and what happens when two adjacent
  blocks have identical content? A content hash alone collides on repetition; a
  hash plus sibling ordinal is stable under edits elsewhere but changes for
  every block after an insertion. The requirement — untouched blocks keep their
  key — is settled; the derivation is not.
- Should `HtmlBlock.html` be sanitised a second time in the package, or is
  `html: false` plus the renderer's own escaping the whole mitigation?
- Should the corpus include expected **IR** as well as diagnostics and
  resolutions? It would catch renderer drift, but the Python implementation
  produces no IR, so those cases would be TypeScript-only fixtures living in a
  shared directory.
- When a Rust implementation appears, does canonicity (§10) move to it, and
  what is the procedure for moving it?
- Is `@HyperMarkDown` an available npm scope, and who owns it?

## Changelog

- 2026-08-06: drafted
- 2026-08-06: §7 gains `Block.key` and the partial-input rule; live-on-type
  editing (VSX-013, VSX-018, VSX-019) promoted from a consequence of the
  architecture to a constraint the parser and IR are designed against
- 2026-08-08: the corpus moves from `conformance/` to `examples/conformance/`,
  under the layout HMD-0024 records. Only the path changes: the cases are the
  same data, still outside both implementations' test trees, and every rule of
  §10 stands
