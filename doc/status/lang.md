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

**The format is specified and implemented twice, and the specification is a
single normative text** rather than something a reader assembles from two
proposals. Everything the first version needs is decided: the grammar, the
resolution search, the four frontmatter keys, eighteen diagnostics, embed
expansion, and publication.

**Three kinds of thing are open.** A handful of semantic questions that keep the
proposals at "drafted" rather than "accepted" — what a feature toggle applies to
across an embed, whether an imported search path should win over a local name,
whether the format should have a way to silence a diagnostic. One genuine
disagreement the specification never legislated: headings written with an
underline. And one reserved language — cross-project namespaces — with a name,
constraints, and no syntax at all. The other, the query language, is no longer
this project's to design: [HQL](https://hql-lang.org/) shipped as its own project with its own
grammar and documentation, and the record that reserved it here is superseded.
What this side still owes is how a card carries a query.

**Nothing is being written right now.** The format moves when an implementation
finds a question it cannot answer, and the current one is publication.

## Open

| Status | Work | Notes | References |
| --- | --- | --- | --- |
| todo | **Write the heading-matching rule into the specification instead of naming a library.** Decided for 0.1: a heading fragment matches by normalising both the fragment and each heading's visible text and comparing the results, which is what Obsidian does and what both implementations do today. The rule is stated in full — Unicode NFC, then case folding; punctuation and symbols dropped; letters and digits kept in every script, accents included; whitespace collapsed — and no longer reads "Python-Markdown's slugify". Two headings that normalise alike: the first wins and the linter warns, and the remedy the specification recommends is an anchor on the heading. The `_1` suffix leaves the language; a site may still use it in its URLs | Heading paths such as `#Chapter#Section`, which Obsidian has, wait for the address grammar | [[hmd-0001#3-heading-anchors]], [[hmd-0020#4-heading-slugs]], [[hmd-0006#the-address-after-the-hash]], [the issue card](../issues/0014-non-latin-headings-cannot-be-linked.md) |
| todo | **Settle the encoding details around UTF-8.** Decided for 0.1: a card is UTF-8 and nothing else; UTF-16 was weighed and turned down, because git treats it as binary, the tool chain reads UTF-8, and newer formats have moved the same way. Left to decide: whether a leading byte-order mark is ignored (today it hides frontmatter), whether a lone `\r` ends a line as it does in CommonMark, what unit a diagnostic's column and offset count in, whether a file that is not valid UTF-8 gets its own diagnostic rather than a crash, and whether card names are compared after NFC normalisation | The unit is the urgent one: the specification says byte offsets, while the canonical implementation counts characters, the TypeScript one UTF-16 units, and the Rust one bytes. The corpus cannot see it, because every expected diagnostic sits at line 1, column 1 | [[hmd-lang-spec#documents]], [[hmd-lang-spec#lexical-model]] |
| todo | **Index underlined headings.** Decided for 0.1: a heading is a heading whichever way it is written, so `Setup` over a line of `===` or `---` is addressable exactly as `# Setup` is. Neither implementation indexes them today, so a link to one fails in the editor and in the linter while a built site anchors it anyway. The specification gains the sentence; both scanners index them in the same change, with a case in the shared corpus | The specification had never mentioned heading syntax, which is how the two implementations came to agree by accident | [[hmd-0001#3-heading-anchors]], [[hmd-0020#4-heading-slugs]] |
| todo | **Widen the diagnostic range in the TypeScript implementation's specification**, which names sixteen rules while publication introduced a seventeenth. It forbids *allocating* new identifiers, which is right, but as written it also forbids implementing one already allocated | Blocks the publication port in that implementation | [[hmd-0020#9-diagnostics]] |
| todo | **State determinism normatively.** The format leans on it — the same tree, linted twice or with its files created in a different order, produces the same output — without ever saying so. The matching test is the canonical implementation's to write | Nothing blocks it | [[hmd-0020#11-determinism-and-resource-bounds]] |
| doing | **Cells, rendered by the tools.** [HQL](https://hql-lang.org/) defines how a card carries a query: cells with an `id`, a `hidden` flag, and output written after the cell behind hashed markers. Which fences are cells is now decided here: `hql#eval` and `hql#query` run, `hql#query` is `hql#eval hidden`, and a bare `hql` fence is a listing and never runs. Diagrams are cells too, and that is decided for 0.1: `d2#show` and `mermaid#show` are diagram cells, and a plain `d2` or `mermaid` fence is a listing, exactly as a plain `hql` fence is. The editor preview renders HQL cells; what is left is the site build, and the specification naming the cell kinds, saying their bodies are opaque to the resolver, and saying that a card with cells and their saved outputs is a valid card. How a tool runs or draws a cell is a suggestion in the specification, not a rule; the editor's behaviour is in its records | `hql render` 0.6.0 still runs bare `hql` fences and writes outputs for queries, so the editor masks both; HQL is asked to adopt the rules, and to write `mermaid#show` from its `mermaid` step | [[hmd-0026#which-fences-run]], [[hmd-0030#which-fences-are-diagram-cells]], [[hmd-0003]] |
| todo | **Settle the address grammar before it is built.** Sentence segmentation, how nesting block kinds count, whether a table is addressable below block level, and whether a range may span two named steps. Each one changes what an already-written address means, so all of them are cheaper now than after the first card cites one | Holds the record at drafted rather than accepted; nothing else waits on it | [[hmd-0006#open-questions]] |
| backlog | **Address and quote inside a card.** The fragment becomes a path of steps — a heading or anchor, then a block kind, a sentence, a word span — so a citation names a passage rather than a document, and an embed of one quotes exactly that passage. Needs a fragment parser and block boundaries in both implementations, held together by the shared corpus | Specified and unimplemented; the grammar's open questions come first | [[hmd-0006#the-address-after-the-hash]], [[hmd-0006#quoting-an-address-that-yields-its-text]] |
| backlog | **Carry an integrity digest on a quotation**, so a source that changes under a quote is reported instead of drifting silently. The digest is optional, is not authentication, and a mismatch is a diagnostic rather than a refusal to render | Waits on quoting; the digest is the part that makes a quote checkable rather than merely traceable | [[hmd-0006#the-integrity-digest]] |
| todo | **Clear numeric section references from the documentation.** Roughly seven hundred and seventy places cite a location by section sign and number — unclickable, checked by nothing, and wrong the moment anything is renumbered. Each becomes a reference that names its target | The rule is stated; the sweep is its own pass, and the tree has to become cards before the references resolve | [[hmd-0006#writing-a-reference-instead-of-a-number]], [[hmd-0006#outlook-the-documentation-becomes-a-vault]] |
| todo | **Finish unifying what a vault and a namespace are across the specification, the HMD tools, and HQL.** Decided: a vault is the directory marked by `.hmd/`, the namespace is the tree of cards a reference resolves in, and `wiki` stays as the cards location, where inside the vault the cards start. The specification, the Namespaces page and the README say so. Also decided, for 0.1: `.git` does not mark a root, only `.hmd/` does, so the specification's sentence about falling back to `.git` goes, and the canonical command line drops its fallback. The editor already looks for `.hmd/` alone. Left to decide and correct: the one schema for binding another vault, and the address form for a card in another vault. Left to build: a conformance case whose `wiki` is not `.`, and HQL reading `wiki`, which HQL tracks as its own issue 0079 | The tools still agree only where a configuration says `wiki = "."`: HQL and the semantic index builder read cards from the vault itself. Comes before cross-project namespaces, which builds on the answer | [the issue card](../issues/0011-vault-and-namespace-drift-between-hmd-and-hql.md), [[hmd-0004#the-address-form]] |
| backlog | **Cross-project namespaces.** How one project binds a name to another project's cards: the binding schema, resolution against a second local tree, fetching a remote one, and linting an address that points outside | The vocabulary, the address form, and where a binding may live are settled; the schema is not | [[hmd-0004#the-address-form]], [[hmd-0006#the-uri]] |
| todo | **Test the scanner against CommonMark's own examples.** The CommonMark 0.31.2 specification ships about 650 examples, each a Markdown input with its exact expected HTML, and every serious parser runs them as its conformance suite. Vendor them beside the corpus and add a masking oracle: the regions the scanner masks — code spans, fenced code, HTML comments — compared with the ones a reference parser reports, over the examples and over fuzzed input, with every mismatch minimised into a case. An example with no `[[` must also yield no construct at all | A parallel track; 0.1 does not wait on it. The examples are CC BY-SA 4.0, so they need a folder with their own licence file rather than the MIT corpus | [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/), [[hmd-lang-spec#lexical-model]], [[hmd-0020#31-masking]] |
| backlog | **Grow the CommonMark examples into a differential dataset.** Generate inputs, run them through several parsers (cmark, commonmark.js, markdown-it, pulldown-cmark), and keep each disagreement as a case: either the CommonMark text is silent there, or one parser is wrong and the text decides. The reference parser's branch coverage measures how complete the dataset is | Follows the oracle. Completeness in the strict sense is impossible — the inputs are infinite — so the measure is coverage, not a count | [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/) |
| backlog | **Define the constructs over the CommonMark parse instead of a masked scan.** A wikilink is a `[[…]]` found in the text of the CommonMark document, so whether something is code is CommonMark's answer and the known-divergence clause goes away. A candidate for 0.2, not for 0.1 | Waits on the dataset, which is what shows whether the change moves any existing card | [[hmd-lang-spec#lexical-model]] |
| parked | **A Lean model of resolution and embed expansion.** Nice to have. It would turn claims the specification only asserts — the result does not depend on file order, a wildcard import never changes a name the spine resolved, a resolved path stays inside the root, expansion terminates — into theorems, and as executable code it could serve as an oracle for the three implementations on generated trees | Unparked if a property-based test finds a counterexample to one of those claims, or a fourth implementation needs a reference the existing three cannot settle between them | [[hmd-lang-spec#name-resolution]], [[hmd-lang-spec#embed-expansion]] |
| todo | **Accept Mermaid as a diagram language on par with D2.** The format rejected it as superseded by D2 when it was first sketched, and the MVP grammar, the D2 proposal's non-goals, and the feature list still say so, while HQL's `mermaid` step already writes Mermaid fences that every tool then shows as code. Reverse the rejection in all four places in one pass, and drop the specification's line rejecting a second diagram notation. The format's half is answered by diagram cells: a `mermaid#show` fence is a diagram whose body is opaque to the resolver, exactly as a `d2#show` fence is | The renderer choice comes first: Mermaid is a JavaScript library, not a single binary like `d2` | [the Mermaid card](../issues/0115-mermaid-diagrams-on-par-with-d2.md), [[hmd-0022]], [[hmd-0030]] |

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
| There is no way to silence a diagnostic | Deliberate for now. A suppression syntax added before there is real usage is a syntax designed wrong | [[hmd-0001#8-lint-rules]] |
| Embeds stop at sixteen levels and a cycle is an error | A bound is required; the number is arbitrary and cheap to change | [[hmd-0001#6-embed-expansion]] |
| Links out of the namespace are ordinary markdown links and are not checked | Deliberate: the graph is closed to its root. The site reports them at information level instead | [[hmd-0001#4-namespace-root]], [[hmd-0002#4-red-links-and-md]] |
| Rendering to flat markdown is one-way — it drops the embed boundary and where each link came from | A shipping format, not an interchange one. Converting markdown back into cards is sketched in the wiki and owned by no proposal | [[md-hmd-interop]] |
| An unbound project prefix is indistinguishable from a typo: it parses as an ordinary name and produces a red link | Nothing reads the prefix yet, so there is nothing to raise a better diagnostic from | [[hmd-0004#the-address-form]] |
| The reserved cross-project namespace language specifies no syntax at all | Deliberate. Naming a language and fixing its constraints is cheap; choosing a grammar under-informed is expensive and hard to reverse | [[hmd-0004]] |

## Done

- **The grammar** — the link forms, what is masked from scanning, and the
  heading anchors, whose algorithm is adopted from Python-Markdown so a link and
  its rendered destination cannot disagree.
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
- **Diagnostics** — eighteen rules with stable identifiers, severities, and
  positions, allocated by the canonical implementation and by nothing else.
- **Embeds** — whole card, section, or block, with a depth cap and cycles an
  error.
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
| Does a feature toggle apply to a card's own links only, or also to links inside content it embeds? Expansion is textual, so today the embedded card's own toggles govern | [[hmd-0001#6-embed-expansion]] |
| Should an imported search path be tried *before* the local spine? Today it is tried after, which buys monotonicity — importing a project can never break a name that already resolved — but it leaves an author who imports in order to override with no way to do it | [[hmd-0001#52-the-algorithm]] |
| Should the whole-tree sweep be bounded, so a large tree cannot make one unresolvable name expensive to diagnose? | [[hmd-0001#52-the-algorithm]] |
| Should the format have a way to silence a diagnostic at the line it fires on? | [[hmd-0001#8-lint-rules]] |
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
| Is the long form canonical when a tool mints an address, so two tools produce the same string for one location? | [[hmd-0006#both-spellings-and-which-one-is-which]] |

## Changelog

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
  and turned down. The details around it are an open row.
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
