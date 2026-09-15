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
resolution search, the four frontmatter keys, seventeen diagnostics, embed
expansion, and publication.

**Three kinds of thing are open.** A handful of semantic questions that keep the
proposals at "drafted" rather than "accepted" — what a feature toggle applies to
across an embed, whether an imported search path should win over a local name,
whether the format should have a way to silence a diagnostic. One genuine
disagreement the specification never legislated: headings written with an
underline. And two reserved languages — a query language and cross-project
namespaces — that have names, constraints, and no syntax at all.

**Nothing is being written right now.** The format moves when an implementation
finds a question it cannot answer, and the current one is publication.

## Open

| Status | Work | Notes | References |
| --- | --- | --- | --- |
| todo | **Decide whether underlined headings are addressable.** Neither implementation indexes them, so a link to one fails in the editor and in the linter — while a built site anchors it anyway, because the site's markdown renderer assigns the identifier without asking. So the site and the tools disagree about the same card. The proposal is that a heading is a heading whichever way it is written: index them, in both scanners at once, with a case in the shared corpus | The specification has never mentioned heading syntax, which is how the two implementations came to agree by accident | [[hmd-0001#3-heading-anchors]], [[hmd-0020#4-heading-slugs]] |
| todo | **Widen the diagnostic range in the TypeScript implementation's specification**, which names sixteen rules while publication introduced a seventeenth. It forbids *allocating* new identifiers, which is right, but as written it also forbids implementing one already allocated | Blocks the publication port in that implementation | [[hmd-0020#9-diagnostics]] |
| todo | **State determinism normatively.** The format leans on it — the same tree, linted twice or with its files created in a different order, produces the same output — without ever saying so. The matching test is the canonical implementation's to write | Nothing blocks it | [[hmd-0020#11-determinism-and-resource-bounds]] |
| backlog | **The query language.** A grammar, inline properties, an evaluator over the resolved graph, writing results back into a card, templates, a `query` command, and rendering the results in a build. Everything waits on the grammar | The name and the constraints are reserved; no syntax exists. What the language queries is being drafted in the wiki: the epistemic universe and its atomic unit | [[hmd-0003]], [[knowledge-universe]], [[concept]] |
| todo | **Settle the address grammar before it is built.** Sentence segmentation, how nesting block kinds count, whether a table is addressable below block level, and whether a range may span two named steps. Each one changes what an already-written address means, so all of them are cheaper now than after the first card cites one | Holds the record at drafted rather than accepted; nothing else waits on it | [[hmd-0006#open-questions]] |
| backlog | **Address and quote inside a card.** The fragment becomes a path of steps — a heading or anchor, then a block kind, a sentence, a word span — so a citation names a passage rather than a document, and an embed of one quotes exactly that passage. Needs a fragment parser and block boundaries in both implementations, held together by the shared corpus | Specified and unimplemented; the grammar's open questions come first | [[hmd-0006#the-address-after-the-hash]], [[hmd-0006#quoting-an-address-that-yields-its-text]] |
| backlog | **Carry an integrity digest on a quotation**, so a source that changes under a quote is reported instead of drifting silently. The digest is optional, is not authentication, and a mismatch is a diagnostic rather than a refusal to render | Waits on quoting; the digest is the part that makes a quote checkable rather than merely traceable | [[hmd-0006#the-integrity-digest]] |
| todo | **Clear numeric section references from the documentation.** Roughly seven hundred and seventy places cite a location by section sign and number — unclickable, checked by nothing, and wrong the moment anything is renumbered. Each becomes a reference that names its target | The rule is stated; the sweep is its own pass, and the tree has to become cards before the references resolve | [[hmd-0006#writing-a-reference-instead-of-a-number]], [[hmd-0006#outlook-the-documentation-becomes-a-vault]] |
| backlog | **Cross-project namespaces.** How one project binds a name to another project's cards: the binding schema, resolution against a second local tree, fetching a remote one, and linting an address that points outside | The vocabulary, the address form, and where a binding may live are settled; the schema is not | [[hmd-0004#the-address-form]], [[hmd-0006#the-uri]] |

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
| The two reserved languages specify no syntax at all | Deliberate. Naming a language and fixing its constraints is cheap; choosing a grammar under-informed is expensive and hard to reverse | [[hmd-0003]], [[hmd-0004]] |

## Done

- **The grammar** — the link forms, what is masked from scanning, and the
  heading anchors, whose algorithm is adopted from Python-Markdown so a link and
  its rendered destination cannot disagree.
- **Resolution** — a name is looked for beside the card, then in each folder
  above without recursion, nearest winning, with a whole-tree sweep only if that
  finds nothing and two matches in the sweep an error rather than a tie-break.
  Folder notes bind to their directory's name; both import forms are specified.
- **Frontmatter** — four reserved keys, closed, each validated rather than
  coerced.
- **Diagnostics** — seventeen rules with stable identifiers, severities, and
  positions, allocated by the canonical implementation and by nothing else.
- **Embeds** — whole card, section, or block, with a depth cap and cycles an
  error.
- **Publication** — opt-in, inherited from folder notes, private by default; an
  unpublished card is not built at all, and a published card reaching into one
  that is not renders as a red link and warns.
- **The names held in reserve** — a query language, with determinism and purity
  fixed before any syntax; and cross-project namespaces, with a folder, a
  project, and an address form separated from each other, and bindings confined
  to one reviewable file so a link can never widen what a project can reach.

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
| For the query language: what is the grammar, how are inline properties written and declared, what triggers writing results back into a source file, and is frontmatter a data block or a place to bind names? | [[hmd-0003#open-questions]] |
| For cross-project namespaces: which keys express a binding, what may a name contain, what fetches a remote project and is the result always pinned, and does resolution compose across two hops? | [[hmd-0004#open-questions]] |
| Can the sentence rule be made less wrong about abbreviations and decimals without giving up cross-implementation determinism? A correct segmenter means Unicode tables in both implementations and an address whose meaning depends on which Unicode version each was built against | [[hmd-0006#segmenting-a-scope-into-units]] |
| How do nesting block kinds count — is a list inside a list counted at the outer level, only within its parent, or both? | [[hmd-0006#every-block-kind-is-addressable-by-its-type]] |
| Should a table be addressable below the block level — a row, a column, a cell — and does that want its own units or a coordinate spelling? | [[hmd-0006#counted-steps-cite-an-ordinal-inside-the-enclosing-scope]] |
| Should an address name a range across two *named* steps, anchor to anchor, rather than only a range within one unit? | [[hmd-0006#counted-steps-cite-an-ordinal-inside-the-enclosing-scope]] |
| Is the long form canonical when a tool mints an address, so two tools produce the same string for one location? | [[hmd-0006#both-spellings-and-which-one-is-which]] |

## Changelog

- 2026-09-14: rewritten in the shape the trackers now use — status first in
  prose, then open work, broken, gaps, and done last. Work-point numbers are
  gone, and the per-proposal question tables became one list, since four
  different questions numbered `Q1` is the problem the change exists to fix.
- 2026-09-14: created by folding four per-proposal trackers into one file about
  the format. The underlined-heading item is new, and had been recorded
  backwards in the extension's README as a slug the TypeScript implementation
  invents.
