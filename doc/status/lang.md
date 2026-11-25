# STATUS — the language

HyperMarkDown the *format*, as distinct from anything that implements it: the
grammar, how a name becomes a card, the frontmatter keys, the diagnostics and
their numbering, publication, and the two languages the format reserves names
for but has not designed. Its deliverable is a specification — `hmd-lang-spec`
in the wiki — not a program.

Beside this file: the canonical implementation in [`hmd.md`](hmd.md), the second
implementation in [`ts-core.md`](ts-core.md), the editor in
[`vsc-ext.md`](vsc-ext.md), and the website in [`pages.md`](pages.md).

## Status

**HyperMarkDown 0.1.0 is released, on 2026-11-25**, tagged `spec-v0.1.0`, with
every tool released to follow it the same day: the crate `hypermarkdown`
0.3.0, `hmd` 0.5.0, `@hypermarkdown/core` 0.4.0, the editor 0.6.0, and
`hmd-semantics` 0.2.0, and then HQL 0.8.0 as its own project's release. The
open rows below are the work after 0.1.0.

**The format is specified and implemented twice, and the specification is a
single normative text** rather than something a reader assembles from two
proposals. Everything the first version needs is decided: the grammar, the
resolution search, the four frontmatter keys, nineteen diagnostics, embed
expansion, and publication.

**The questions holding 0.1 back were decided on 2026-11-22, and are written
into the specification and into all three implementations.** The baseline and
its extras, diagram cells, underlined headings, heading matching, the root
marker, the encoding, determinism, suppression, toggles across an embed, import
order, where publication lives, and an anchor on a heading. The shared corpus
grew by six cases to pin them, and every implementation passes it. The
[release card](../issues/archive/0016-prepare-the-0-1-specification-release.md),
now closed, collected the decisions, the readability actions, and the steps to the release
in one place. Still open beyond 0.1: one reserved language — cross-project
namespaces — with a name, constraints, and no syntax at all. The other, the query language, is no longer
this project's to design: [HQL](https://hql-lang.org/) shipped as its own project with its own
grammar and documentation, and the record that reserved it here is superseded.
What this side still owes is how a card carries a query.

**How 0.1 was written.** The specification was restructured
for reading on 2026-11-22 — a contents list, a table of terms, one example vault
followed through the sections, and each section's rules ahead of a short *Why*.
On 2026-11-24 it gained a new introduction, which calls it the language
standard, and the Conformance section was renamed *Conformance to the Standard*
with a new opening paragraph. The rest of that section's normative text is
kept until its replacement is agreed. The same day the language adopted
Semantic Versioning, under *Versioning and Authority*. A card is now defined
first as a unit of knowledge, with the file rules kept under *Documents*. The
split between the language and its extras is gone: what *Extras* listed is now
*Extended Markdown syntax*, part of the standard. Also that day, the
terminology review finished: the terms table defines a namespace and a module
by what they are for, and drops four terms of the specification's own
(*spine*, *sweep*, *key*, and *construct*) in favour of plain language. Name
resolution now opens with its principles, and explains path-suffix matching.
A later pass the same day completed proofreading from the introduction through
the start of *Grammar*. Normative rules now describe observable behaviour, and
implementation guidance and rationale move into informative footnotes. The
*Lexical model* section defines regions excluded from recognition instead of
prescribing a masking scanner. The corpus no longer arbitrates: a discrepancy
between the standard, the test dataset, and an implementation is investigated
and resolved. The formal grammar productions and the permitted divergence from
CommonMark are unchanged and under separate review. Proofreading continues
after *Grammar*, with each
construct described at three levels: a conceptual definition (what it is and
what it is for), a formal definition (syntax, semantics, behaviour, and edge
cases), and executable examples (inputs and expected outputs a test can run).

## Open

| Status | Work | Notes | References |
| --- | --- | --- | --- |
| doing | **Cells, rendered by the tools.** [HQL](https://hql-lang.org/) defines how a card carries a query: cells with an `id`, a `hidden` flag, and output written after the cell behind hashed markers. Which fences are cells is now decided here: `hql#eval` and `hql#query` run, `hql#query` is `hql#eval hidden`, and a bare `hql` fence is a listing and never runs. Diagrams are cells too, and that is decided for 0.1: `d2#show` and `mermaid#show` are diagram cells, and a plain `d2` or `mermaid` fence is a listing, exactly as a plain `hql` fence is. The editor preview renders HQL cells; the specification now names the cell kinds, says their bodies are opaque to the resolver and that a card with cells and saved outputs is a valid card, and suggests a presentation without requiring one. What is left is the site build. How a tool runs or draws a cell is a suggestion in the specification, not a rule; the editor's behaviour is in its records | `hql render` 0.6.0 still runs bare `hql` fences and writes outputs for queries, so the editor masks both; HQL is asked to adopt the rules, and to write `mermaid#show` from its `mermaid` step | [[hmd-0026#which-fences-run]], [[hmd-0030#which-fences-are-diagram-cells]], [[hmd-0003]] |
| todo | **Settle the address grammar before it is built.** Comes after 0.1, decided on 2026-11-22: its branch rebases onto the 0.1 specification, adopts the new heading matching for its heading steps, and renumbers its unreleased rules from HMD020, since 0.1 takes HMD019. Sentence segmentation, how nesting block kinds count, whether a table is addressable below block level, and whether a range may span two named steps. Each one changes what an already-written address means, so all of them are cheaper now than after the first card cites one | Holds the record at drafted rather than accepted; nothing else waits on it | [[hmd-0006#open-questions]] |
| backlog | **Address and quote inside a card.** The fragment becomes a path of steps — a heading or anchor, then a block kind, a sentence, a word span — so a citation names a passage rather than a document, and an embed of one quotes exactly that passage. Needs a fragment parser and block boundaries in both implementations, held together by the shared corpus | Specified and unimplemented; the grammar's open questions come first | [[hmd-0006#the-address-after-the-hash]], [[hmd-0006#quoting-an-address-that-yields-its-text]] |
| backlog | **Carry an integrity digest on a quotation**, so a source that changes under a quote is reported instead of drifting silently. The digest is optional, is not authentication, and a mismatch is a diagnostic rather than a refusal to render | Waits on quoting; the digest is the part that makes a quote checkable rather than merely traceable | [[hmd-0006#the-integrity-digest]] |
| todo | **Clear numeric section references from the documentation.** Roughly seven hundred and seventy places cite a location by section sign and number — unclickable, checked by nothing, and wrong the moment anything is renumbered. Each becomes a reference that names its target | The rule is stated; the sweep is its own pass, and the tree has to become cards before the references resolve | [[hmd-0006#writing-a-reference-instead-of-a-number]], [[hmd-0006#outlook-the-documentation-becomes-a-vault]] |
| todo | **Finish unifying what a vault and a namespace are across the specification, the HMD tools, and HQL.** Decided: a vault is the directory marked by `.hmd/`, the namespace is the tree of cards a reference resolves in, and its namespace root is named by the `location_path` setting, relative to the vault, defaulting to `.`, the vault itself. The key was called `wiki`, with the default `doc/wiki`, until 2026-11-24, and is now banned: a configuration that sets `wiki` is rejected, and the vault is not read, with an error that names `wiki` and `location_path`. It is a refusal to load, not a diagnostic, so it has no rule identifier and no corpus case; each implementation pins it with a unit test. The specification, the Namespaces page and the README say so. Also decided, for 0.1: `.git` does not mark a root, only `.hmd/` does; the specification, the reference command line, the editor, and the Rust crate all agree. Left to decide and correct: the one schema for binding another vault, and the address form for a card in another vault. Left to build: a conformance case whose `location_path` is not `.`, which needs all three corpus runners to read `location_path` instead of taking `tree/` as the namespace root | HQL's side is its own row, below. Comes before cross-project namespaces, which builds on the answer | [the issue card](../issues/0011-vault-and-namespace-drift-between-hmd-and-hql.md), [[hmd-0004#the-address-form]] |
| todo | **Ask HQL to read `location_path`.** HQL 0.7.2 finds a vault's cards through the key's former name, `wiki`, defaults it to `doc/wiki`, and does not read `location_path`. A configuration that sets `wiki` is now rejected by the HMD tools, so no configuration satisfies both: one without `wiki` makes HQL look for `doc/wiki` under the vault and refuse to run when it is missing. HQL tracks reading the namespace root as its own issue 0079; the request is that it read `location_path`, with the default `.`, and reject `wiki` as the HMD tools do | HQL is a separate project; changing it is the user's call | [[hmd-lang-spec#project-configuration]], [the issue card](../issues/0011-vault-and-namespace-drift-between-hmd-and-hql.md) |
| blocked | **Re-render the generated status views.** The three views in this directory are HQL cells over `doc/`, and with the `wiki` line gone from `doc/.hmd/config.toml`, `hql render` refuses: "the cards location `doc/doc/wiki` does not exist; set `wiki`". `--vault` names the directory holding `.hmd/`, not the cards, so no flag avoids it. The views as committed were last rendered on 2026-11-24 before the line was removed, and edits to Open rows since then are not in them | Unblocks when HQL reads `location_path`, the row above | [the views](README.md#generated-views) |
| backlog | **Cross-project namespaces.** How one project binds a name to another project's cards: the binding schema, resolution against a second local tree, fetching a remote one, and linting an address that points outside | The vocabulary, the address form, and where a binding may live are settled; the schema is not | [[hmd-0004#the-address-form]], [[hmd-0006#the-uri]] |
| todo | **Test the scanner against CommonMark's own examples.** The CommonMark 0.31.2 specification ships about 650 examples, each a Markdown input with its exact expected HTML, and every serious parser runs them as its conformance suite. Vendor them beside the corpus and add a masking oracle: the regions the scanner masks — code spans, fenced code, HTML comments — compared with the ones a reference parser reports, over the examples and over fuzzed input, with every mismatch minimised into a case. An example with no `[[` must also yield no construct at all | A parallel track; 0.1 does not wait on it. The examples are CC BY-SA 4.0, so they need a folder with their own licence file rather than the MIT corpus | [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/), [[hmd-lang-spec#lexical-model]], [[hmd-0020#31-masking]], [the dataset card](../issues/0015-commonmark-examples-as-a-test-dataset.md) |
| backlog | **Grow the CommonMark examples into a differential dataset.** Generate inputs, run them through several parsers (cmark, commonmark.js, markdown-it, pulldown-cmark), and keep each disagreement as a case: either the CommonMark text is silent there, or one parser is wrong and the text decides. The reference parser's branch coverage measures how complete the dataset is | Follows the oracle. Completeness in the strict sense is impossible — the inputs are infinite — so the measure is coverage, not a count | [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/) |
| backlog | **Define the constructs over the CommonMark parse instead of a masked scan.** A wikilink is a `[[…]]` found in the text of the CommonMark document, so whether something is code is CommonMark's answer and the known-divergence clause goes away. A candidate for 0.2, not for 0.1 | Waits on the dataset, which is what shows whether the change moves any existing card | [[hmd-lang-spec#lexical-model]] |
| parked | **A Lean model of resolution and embed expansion.** Nice to have. It would turn claims the specification only asserts — the result does not depend on file order, a wildcard import never changes a name the spine resolved, a resolved path stays inside the root, expansion terminates — into theorems, and as executable code it could serve as an oracle for the three implementations on generated trees | Unparked if a property-based test finds a counterexample to one of those claims, or a fourth implementation needs a reference the existing three cannot settle between them | [[hmd-lang-spec#name-resolution]], [[hmd-lang-spec#embed-expansion]] |
| todo | **Settle the lowercase "must" in *Conformance to the Standard*.** The section was revised on 2026-11-24: CommonMark compatibility, determinism, and verification replace the old wording, and the extras bullet is gone. Two of its passages use a lowercase "must" next to the line that gives **MUST** its RFC 2119 meaning: the opening paragraph, and the verification bullet's "must be investigated and resolved". Decide whether each is normative | Wording only, but it decides what an implementation can be held to | [[hmd-lang-spec#conformance-to-the-standard]] |
| todo | **Specify the Extended Markdown syntax.** On 2026-11-24 the constructs *Extras* listed became part of the language: tables, task lists, strikethrough, subscript, footnotes, callouts, collapsible callouts, maths, attribute lists, Markdown inside HTML, and drawn diagrams. Renaming the section did not standardise them. Each row needs a pinned reference specification and the exact syntax and semantics it takes from that reference. Some references are implementations rather than specifications: Python-Markdown and PyMdown Extensions. The standard also has to say what a conforming implementation owes these constructs, since rendering is outside conformance in 0.1. The introduction promises charts and graphs, and no cell kind or row covers them | The section is normative now but specifies little more than a list | [[hmd-lang-spec#extended-markdown-syntax]], [[hmd-lang-spec#cells]] |
| todo | **Validate the grammar, a release requirement for 0.1.** Check every production in *Grammar* against the normative prose, and record each rule the prose adds that a production does not express. Write language-neutral positive and negative cases for every production, block anchors, the frontmatter block, and masking. Run them against Python, TypeScript, and Rust. Compare the syntax recognised, the parsed reference components, source positions, and diagnostics, independently of rendering. Report each discrepancy and correct the implementation; a change to the standard is a reviewed decision, never a quiet match to one implementation. | Kept separate from the specification and from the existing corpus, which compares only diagnostics and resolutions, and in Rust resolutions only. Two things to decide first: grammar cases cannot be generated from the canonical implementation if they are to find it wrong, and they need a parse-level output that `expected.json` does not have | [the card](../issues/archive/0018-validate-the-grammar.md), [[hmd-lang-spec#grammar]], [[hmd-lang-spec#lexical-model]] |
| todo | **Review lexical compatibility with CommonMark.** *Lexical model* permits a line-oriented scanner to differ from a full CommonMark parser on pathological input, such as a wikilink in an HTML block or a fence opened in a blockquote. *Conformance to the Standard* requires every implementation to recognise the same syntax. Find out whether two conforming implementations can read one document differently, list the cases and what each implementation does, and propose resolutions | The divergence paragraph stays as it is until a semantic decision is made | [the card](../issues/0019-lexical-compatibility-with-commonmark.md), [[hmd-lang-spec#lexical-model]] |
| backlog | **Derive a test dataset from the standard.** Each construct, each interaction between constructs, and each corner case the formal definitions state becomes an executable example with its expected output. The aim is that every rule in the standard has a case and every case cites the rule it tests. Outside the scope of the 2026-11-24 revision | Follows the proofreading at three levels of specificity; extends the shared corpus rather than replacing it | [[hmd-lang-spec]], `examples/conformance/cases/` |
| todo | **Accept Mermaid as a diagram language on par with D2.** The format rejected it as superseded by D2 when it was first sketched, and the MVP grammar and the D2 proposal's non-goals still say so, while HQL's `mermaid` step already writes Mermaid fences that every tool then shows as code. Reverse the rejection in all three places in one pass. The specification's line rejecting a second diagram notation is already gone. The format's half is answered by diagram cells: a `mermaid#show` fence is a diagram whose body is opaque to the resolver, exactly as a `d2#show` fence is | The renderer choice comes first: Mermaid is a JavaScript library, not a single binary like `d2` | [the Mermaid card](../issues/0115-mermaid-diagrams-on-par-with-d2.md), [[hmd-0022]], [[hmd-0030]] |

## Broken

Nothing known. A defect in the format looks like two implementations that
disagree and are both defensible — the underlined-heading item above is the
current one, and it is filed as open work rather than as breakage because
nothing is wrong yet, only unstated.

## Limitations (known gaps)

| Limitation | Why it stands | References |
| --- | --- | --- |
| The scanner is a hand-written masker rather than a real CommonMark parser | Divergence from CommonMark is possible and currently invisible. The shared corpus is what would expose it | [[hmd-0020#31-masking]] |
| A link inside an indented code block is treated as a link | Forced by the ecosystem: two widely used markdown extensions overload the four-space indent, and masking it dropped real links from the fixture | [[hmd-0001#1-parsing-model]] |
| There is no way to silence a diagnostic | Decided for 0.1. A suppression syntax added before there is real usage is a syntax designed wrong | [[hmd-0001#8-lint-rules]] |
| Embeds stop at sixteen levels and a cycle is an error | A bound is required; the number is arbitrary and cheap to change | [[hmd-0001#6-embed-expansion]] |
| Links out of the namespace are ordinary markdown links and are not checked | Deliberate: the graph is closed to its root. The site reports them at information level instead | [[hmd-0001#4-namespace-root]], [[hmd-0002#4-red-links-and-md]] |
| Rendering to flat markdown is one-way — it drops the embed boundary and where each link came from | A shipping format, not an interchange one. Converting markdown back into cards is owned by no proposal | [the conversion-target card](../issues/0007-conversion-target-dialect.md) |
| An unbound project prefix is indistinguishable from a typo: it parses as an ordinary name and produces a red link | Nothing reads the prefix yet, so there is nothing to raise a better diagnostic from | [[hmd-0004#the-address-form]] |
| The reserved cross-project namespace language specifies no syntax at all | Deliberate. Naming a language and fixing its constraints is cheap; choosing a grammar under-informed is expensive and hard to reverse | [[hmd-0004]] |

## Done

- **Name resolution agrees across the three implementations** — eighteen
  `resolve-*` cases, written from the corrected *Name resolution* text rather
  than generated, cover every point the validation set out to check,
  path-suffix matching among them, and pass in Python, TypeScript, and Rust. Running them found ten discrepancies, each fixed: among them a written
  extension ignored by a named import and by the recursive search, `[[./]]`
  binding a sibling card, a symbolic link out of
  the root read as a card, a nested vault reported as missing rather than
  escaping, and candidates sorted by UTF-16 unit in TypeScript. The Rust runner
  now also checks each reference's outcome against HMD001 to HMD003
  [issues 0017 and 0020,
  [the card](../issues/archive/0020-validate-name-resolution-across-implementations.md)].
- **The grammar** — the link forms, what is masked from scanning, and the
  heading anchors, matched by a key the specification states itself, with a
  renderer bound to rewrite each heading link to the `id` it gave that heading.
- **Resolution** — a name is looked for beside the card, then in each folder
  above without recursion, nearest winning, with a whole-tree sweep only if that
  finds nothing and two matches in the sweep an error rather than a tie-break.
  Folder notes bind to their directory's name; both import forms are specified.
- **A nested marker ends the namespace** — a directory below the namespace root
  carrying its own `.hmd/` is another project's root, and nothing beneath it is
  a page, a resolution candidate, or an import target of the outer namespace.
  Discovery already stopped at the nearest marker; the specification now says
  the same about loading [issue 0009].
- **Frontmatter** — four reserved keys, closed, each validated rather than
  coerced.
- **Markdown cards** — a `.md` or `.markdown` file in the namespace is a card
  that is addressed and embedded but not scanned; `.hmd` wins a shared name and
  the loser is HMD018 [HMD-0029].
- **The TypeScript implementation's specification follows the diagnostics
  table** — it named `HMD001` through `HMD016`, which forbade implementing a
  rule already allocated; it now takes every rule the language specification
  allocates, and still allocates none of its own.
- **Diagnostics** — nineteen rules with stable identifiers, severities, and
  positions. HMD019, a file that is not valid UTF-8, was allocated by the
  specification ahead of the implementations.
- **Embeds** — whole card, section, or block, with a depth cap and cycles an
  error.
- **The 0.1 decisions, in the implementations** — heading fragments match by
  key in the canonical and the TypeScript implementation; underlined headings
  are headings in both; HMD019, the byte-order mark, the three line endings,
  NFC names, and code-point columns with UTF-8 byte offsets in all three; the
  `.git` fallback is gone from the command line; determinism has a test; an
  anchor on a heading embeds its section, and an anchored repeat heading is
  not HMD011. Six corpus cases pin them: Unicode heading keys, duplicate
  headings, underlined headings, a code-point column, invalid UTF-8, and a
  byte-order mark before frontmatter.
- **The baseline corrections around the specification** — the Features page
  and the changelog no longer build on GitHub-flavored Markdown, and the
  Introduction no longer calls a proposal the normative specification.
- **What has to agree with CommonMark in 0.1** — the constructs, found where a
  CommonMark reading puts them; rendering the inherited Markdown is outside
  conformance in this version, since the site's own renderer keeps older rules.
- **The 0.1 decisions without code behind them** — the specification now says
  that nothing silences a diagnostic, that a link inside an embed resolves as
  in the card it was written in, with that card's imports and toggles, that
  imported search paths stay after the spine, and that publication stays in
  the language.
- **Publication** — opt-in, inherited from folder notes, private by default; an
  unpublished card is not built at all, and a published card reaching into one
  that is not renders as a red link and warns.
- **The name held in reserve** — cross-project namespaces, with a folder, a
  project, and an address form separated from each other, and bindings confined
  to one reviewable file so a link can never widen what a project can reach.
  The query language was reserved the same way and then outgrew the reservation:
  [HQL](https://hql-lang.org/) is its own project, and its record here is superseded.

## Gates

**None, and that is the honest entry.** The deliverable is a specification, and
nothing executes it. The corpus of cases is the implementations' contract with
each other; the site build is a gate on the site.

What stands in for a gate is a read: an agent asked to audit the normative text
for internal contradiction, for claims that outrun what the implementations do,
and for grammar that does not admit the examples printed beside it. The audit
that produced the current specification worked exactly that way, and rewrote or
withdrew two dozen claims.

## Open questions

| Question | References |
| --- | --- |
| Should the scanner become a real CommonMark parser once the corpus exposes divergences, rather than a masker that approximates one? | [[hmd-0020#31-masking]] |
| Should the whole-tree sweep be bounded, so a large tree cannot make one unresolvable name expensive to diagnose? | [[hmd-0001#52-the-algorithm]] |
| Should placement in the navigation inherit down a subtree the way visibility does? Visibility does, which is half an answer: the two inheriting differently is either a defensible split — placement is per card, publication is per folder — or an inconsistency | [[hmd-0002#2-nav]] |
| Is a red link with no destination right, or should it lead to something that offers to create the page? | [[hmd-0002#4-red-links-and-md]] |
| What *should* a published card linking to a private one do — a blocked link, a page that exists but is unlisted, or nothing — and is that chosen per site? The answer decides whether the warning stays a warning (issue 0008) | [[hmd-0002#3-expansion]] |
| How is the specification checked? An audit is a review, not a gate: it finds what it was asked to look for, and it can be right about the prose while the prose is wrong about the implementations | [[hmd-0020#10-conformance-canonicity-and-the-drift-ledger]] |
| For cells: does the site build run [HQL](https://hql-lang.org/) over a page, show the saved outputs as written, or hide a cell's code the way the preview does? The preview's answer is decided — it shows saved outputs and never runs on its own — and the grammar and the cell syntax are HQL's | [[hmd-0026#open-questions]] |
| For cross-project namespaces: which keys express a binding, what may a name contain, what fetches a remote project and is the result always pinned, and does resolution compose across two hops? | [[hmd-0004#open-questions]] |
| Can the sentence rule be made less wrong about abbreviations and decimals without giving up cross-implementation determinism? A correct segmenter means Unicode tables in both implementations and an address whose meaning depends on which Unicode version each was built against | [[hmd-0006#segmenting-a-scope-into-units]] |
| How do nesting block kinds count — is a list inside a list counted at the outer level, only within its parent, or both? | [[hmd-0006#every-block-kind-is-addressable-by-its-type]] |
| Should a table be addressable below the block level — a row, a column, a cell — and does that want its own units or a coordinate spelling? | [[hmd-0006#counted-steps-cite-an-ordinal-inside-the-enclosing-scope]] |
| Should an address name a range across two *named* steps, anchor to anchor, rather than only a range within one unit? | [[hmd-0006#counted-steps-cite-an-ordinal-inside-the-enclosing-scope]] |
| Which Unicode version do heading keys follow? The key depends on general categories and case folding, and the TypeScript implementation's are Unicode 17 while the canonical one's are Unicode 16, so 4699 characters new in Unicode 17 key differently. Pinning a version — and generating both implementations' tables from it, as the case-folding table already is — would close the gap | [[hmd-lang-spec#heading-anchors]] |
| What is a wikilink's text inside a heading? The implementations read a wikilink in a heading as its display text, or, without one, as its page reference less the fragment; the specification says only that inline markup is removed | [[hmd-lang-spec#heading-anchors]] |
| Do attribute-list braces count in a heading's key? `## Setup {#install}` keys as `setup install` today, so `#Setup` does not reach it, while the site's `id` honours `{#install}`. Attribute lists are now part of the language under *Extended Markdown syntax*, which argues for the key rule saying so | [[hmd-lang-spec#heading-anchors]], [[hmd-lang-spec#extended-markdown-syntax]] |
| Is a fragment whose key is empty, such as `#***`, a missing heading (HMD004, today) or a malformed link (HMD010)? | [[hmd-lang-spec#heading-anchors]] |
| Does HMD019 apply to `.md` and `.markdown` files, which are never checked? Today it does, since an undecodable file cannot be a card of any kind | [[hmd-lang-spec#encoding]] |
| Two names on disk that are equal after NFC: the first in sorted order is the card and the other is dropped silently in all three implementations. Should that be a diagnostic, and is "sorted" by code point or by UTF-16 unit? | [[hmd-lang-spec#encoding]] |
| Is the long form canonical when a tool mints an address, so two tools produce the same string for one location? | [[hmd-0006#both-spellings-and-which-one-is-which]] |
| Each construct under *Extended Markdown syntax* takes its syntax from a different dialect. Which reference is pinned for each, and at what version? | [[hmd-lang-spec#extended-markdown-syntax]] |
| A patch release is for an editorial correction that changes neither syntax nor semantics. What moves the minor and the major version of the language, and what does a 0.x version promise? | [[hmd-lang-spec#versioning-and-authority]] |
| What replaces the rest of *Conformance to the Standard*, and does its opening "must" carry the RFC 2119 meaning? | [[hmd-lang-spec#conformance-to-the-standard]] |

## Changelog

- 2026-11-25: HyperMarkDown 0.1.0 is released and tagged `spec-v0.1.0`,
  and the tools followed it one at a time: the crate `hypermarkdown` 0.3.0,
  `hmd` 0.5.0, `@hypermarkdown/core` 0.4.0, the editor 0.6.0,
  `hmd-semantics` 0.2.0, and HQL 0.8.0, which reads `location_path`. The
  release card, 0016, is closed. The generated views are re-rendered with
  HQL 0.8.0.
- 2026-11-24: the `wiki` setting is renamed `location_path`, and its default
  is `.`, the vault itself, instead of `doc/wiki`. `wiki` is banned: a
  configuration that sets it is rejected. The vault and namespace row says
  so, and a new row asks HQL to read `location_path`. A blocked row for the
  generated status views, which `hql render` cannot produce without `wiki`.
- 2026-11-24: HMD012 is a warning, not an error. A card beside a module's
  folder note of the same name shadows the note, which stays reachable by its
  `index` path: the shadowing convention HMD018 and HMD016 already follow. The
  card is the one at that name in every phase, the recursive search included.
- 2026-11-24: the resolution algorithm is corrected to agree with its rules,
  with the precedence unchanged. Its binding step is now *Resolving a reference
  within a directory*, and takes the written extension, a directory-only mode
  for `[[./]]` and `[[../]]`, and a boundary check. The rules gain containment,
  explicit extensions, folder notes, and candidate identity. Two choices the
  text had left open are now settled: a named import whose card has another
  extension falls through to the next phase, and two search paths reaching one
  card are not a collision. The folder-note rule now says the recursive search
  keeps the binding priority, the card before the module's folder note.
  Validation in all three implementations is issue 0020.
- 2026-11-24: the specification declares its version in a *Version* callout
  under the introduction: HyperMarkDown 0.1.0, in the three-part form Semantic
  Versioning requires. The callout links the language's changelog. The
  changelog's section is now `0.1.0`, the README badge says the same, and the
  docs test reads the version from the callout.
- 2026-11-24: proofreading from the introduction through the start of
  *Grammar*. The example vault no longer claims its output comes from one
  implementation, and an unresolved link is explained as the wiki way of
  writing ahead of a card. *Conformance to the Standard* has new CommonMark
  compatibility and determinism bullets, and *Verification* replaces
  arbitration by the corpus: the standard is authoritative, and a discrepancy
  between it, the test dataset, and an implementation is investigated and
  resolved. Rendering is described as presentation, independent of meaning.
  *Documents* opens with the document model and the extension priority. The NFC
  rule moved from *Encoding* to *Name resolution*. *Markdown cards* opens with
  its purpose. *Lexical model* defines the regions excluded from recognition
  instead of a masking scanner. Implementation guidance and rationale are
  informative footnotes, and the *Why* paragraphs of the revised sections are
  gone. The grammar productions and the permitted divergence are unchanged.
  Issue 0019 reviews that divergence, and issue 0018 now lists the grammar
  areas to cover.
- 2026-11-24: grammar validation is a separate release requirement for 0.1.
  Each production is checked against the prose, and positive and negative
  cases are run against all three implementations. They compare the syntax
  recognised, the reference components, positions, and diagnostics. Issue
  0018 carries it.
- 2026-11-24: the terms table defines a namespace as the collection of cards
  and modules that share one naming and addressing space, and a module as a
  directory that groups cards and scopes names. *Spine*, *sweep*, *key*, and
  *construct* are no longer terms. The specification says "the card's own
  directory and its parents", "the recursive search", and "the normalised
  heading identifier" instead, and "construct" is ordinary vocabulary. The
  resolution algorithm, its search boundaries, precedence, and ambiguity
  handling are unchanged. *Name resolution* opens with its principles: `/` as
  the separator everywhere, relative paths from the referring card's directory,
  and the three kinds of reference. A new subsection, *Path-suffix resolution*,
  explains matching by ending path components. Issue 0017 verifies that the
  implementations do the same.
- 2026-11-24: *Status of this document* is now *Versioning and Authority*. The
  language follows Semantic Versioning, and the specification is the
  authoritative definition. A card is defined as the unit of knowledge, and a
  construct as any syntactic element the standard defines. The term *extra* and
  the conformance bullet that kept extras out of the language are gone. *Extras*
  is now *Extended Markdown syntax*, a part of the language whose rows still
  need specifying. The Features page no longer calls tables and task lists
  extras.
- 2026-11-24: the specification opens with a new introduction that names it
  the language standard for 0.1, describes the language and its HQL cells, and
  states its purpose: consistent interpretation across independent
  implementations. *Conformance* is now *Conformance to the Standard* and opens
  with a paragraph on what independent implementations must agree on. The rest
  of that section's text is unchanged. Three rows are open: replacing the rest
  of the section, reconciling the introduction with *Extras*, and a test dataset
  derived from the standard.
- 2026-11-22: the 0.1 decisions are in all three implementations and pinned by
  six new corpus cases; an anchor on a heading embeds its section, an anchored
  repeat heading is not HMD011, and for 0.1 only the constructs have to agree
  with CommonMark. The specification gained a contents list, a table of terms,
  an example vault checked by a test, rules ahead of a short *Why* in every
  section, rule identifiers that trail their condition instead of standing in
  for it, *Project configuration* as a section of its own, and the title
  HyperMarkDown Language Specification; it no longer links internal proposals.
  Six questions the implementations met are open below.
- 2026-11-22: the TypeScript implementation's specification no longer caps
  its rules at sixteen, which unblocks the publication port there.
- 2026-11-22: editorial corrections to the specification, none changing a
  rule: `discovery_mode` and its `spine` value are defined, the grammar reads
  top down, a lone capital NOT no longer looks like a keyword, the diagnostics
  table says where each rule is defined, the sentence claiming nothing but the
  graph is checked now names the frontmatter and the encoding, and the
  changelog link points at the repository. Around it: the Features page and the
  changelog no longer build on GitHub-flavored Markdown, the Introduction no
  longer calls a proposal the normative specification, and the trackers'
  diagnostic counts and released versions match the code.
- 2026-11-22: the specification's heading rule is written out in full and no
  longer names a library; setext headings are headings; HMD019 reports a file
  that is not valid UTF-8. In-card addressing is ordered after 0.1.
- 2026-11-22: the specification gains the 0.1 decisions that do not touch
  headings: extras and determinism under *Conformance*, an *Encoding* section,
  span units, `.hmd/` as the only root marker, links inside an embed, no
  suppression, a *Cells* section, and an *Extras* section. The rejection of a
  second diagram notation is gone.
- 2026-11-22: opened a parallel track that 0.1 does not wait on: CommonMark's
  own examples as a dataset for the scanner, grown by differential testing
  across parsers, and later the constructs defined over the CommonMark parse.
  A Lean model of resolution is recorded as parked, nice to have.
- 2026-11-22: decided for 0.1 that diagrams are cells: `d2#show` and
  `mermaid#show` are drawn, and a plain `d2` or `mermaid` fence is a listing.
  The editor's behaviour is recorded in HMD-0030.
- 2026-11-22: decided for 0.1 that only `.hmd/` marks a project root; the
  `.git` fallback goes from the specification and from the canonical command
  line.
- 2026-11-22: decided for 0.1 that underlined headings are headings, and
  addressable like any other.
- 2026-11-22: decided for 0.1 that heading fragments match by a normalisation
  the specification states itself, keeping every script, with anchors as the
  remedy for headings that normalise alike.
- 2026-11-22: decided for 0.1 that a card is UTF-8 only; UTF-16 was weighed
  and turned down. Around it: a byte-order mark is ignored, line endings
  follow CommonMark, columns count code points and offsets UTF-8 bytes,
  invalid UTF-8 has a rule of its own, and card names compare after NFC.
- 2026-11-22: decided for 0.1 that the baseline is CommonMark 0.31.2, named and
  not explained, with every extra listed explicitly in the specification as
  non-normative. Also decided: determinism is stated normatively, nothing
  silences a diagnostic, an embedded card's own toggles govern its links,
  imports stay after the spine, and publication stays in the specification.
- 2026-11-15: decided that `wiki` stays and is the cards location: where
  inside a vault the cards start. A vault is the directory marked by `.hmd/`
  and holds the configuration; the namespace is the tree of cards below the
  cards location. The specification gained the words vault and cards location,
  and its count of the settings read, three, now matches the keys it lists.
- 2026-10-19: the query language left. HQL shipped as its own project with its
  own documentation, its record here is superseded, and the open row narrows
  to how a card carries a query.
- 2026-09-14: rewritten in the shape the trackers now use — status first in
  prose, then open work, broken, gaps, and done last. Work-point numbers are
  gone, and the per-proposal question tables became one list, since four
  different questions numbered `Q1` is the problem the change exists to fix.
- 2026-09-14: created by folding four per-proposal trackers into one file about
  the format. The underlined-heading item is new, and had been recorded
  backwards in the extension's README as a slug the TypeScript implementation
  invents.
