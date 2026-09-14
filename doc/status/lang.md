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

| Status | Work | Notes |
| --- | --- | --- |
| todo | **Decide whether underlined headings are addressable.** Neither implementation indexes them, so a link to one fails in the editor and in the linter — while a built site anchors it anyway, because the site's markdown renderer assigns the identifier without asking. So the site and the tools disagree about the same card. The proposal is that a heading is a heading whichever way it is written: index them, in both scanners at once, with a case in the shared corpus | The specification has never mentioned heading syntax, which is how the two implementations came to agree by accident |
| todo | **Widen the diagnostic range in the TypeScript implementation's specification**, which names sixteen rules while publication introduced a seventeenth. It forbids *allocating* new identifiers, which is right, but as written it also forbids implementing one already allocated | Blocks the publication port in that implementation |
| todo | **State determinism normatively.** The format leans on it — the same tree, linted twice or with its files created in a different order, produces the same output — without ever saying so. The matching test is the canonical implementation's to write | Nothing blocks it |
| backlog | **The query language.** A grammar, inline properties, an evaluator over the resolved graph, writing results back into a card, templates, a `query` command, and rendering the results in a build. Everything waits on the grammar | The name and the constraints are reserved; no syntax exists |
| backlog | **Cross-project namespaces.** How one project binds a name to another project's cards: the binding schema, resolution against a second local tree, fetching a remote one, and linting an address that points outside | The vocabulary, the address form, and where a binding may live are settled; the schema is not |

## Broken

Nothing known. A defect in the format looks like two implementations that
disagree and are both defensible — the underlined-heading item above is the
current one, and it is filed as open work rather than as breakage because
nothing is wrong yet, only unstated.

## Limitations (known gaps)

| Limitation | Why it stands |
| --- | --- |
| The scanner is a hand-written masker rather than a real CommonMark parser | Divergence from CommonMark is possible and currently invisible. The shared corpus is what would expose it |
| A link inside an indented code block is treated as a link | Forced by the ecosystem: two widely used markdown extensions overload the four-space indent, and masking it dropped real links from the fixture |
| There is no way to silence a diagnostic | Deliberate for now. A suppression syntax added before there is real usage is a syntax designed wrong |
| Embeds stop at sixteen levels and a cycle is an error | A bound is required; the number is arbitrary and cheap to change |
| Links out of the namespace are ordinary markdown links and are not checked | Deliberate: the graph is closed to its root. The site reports them at information level instead |
| Rendering to flat markdown is one-way — it drops the embed boundary and where each link came from | A shipping format, not an interchange one. Converting markdown back into cards is sketched in the wiki and owned by no proposal |
| An unbound project prefix is indistinguishable from a typo: it parses as an ordinary name and produces a red link | Nothing reads the prefix yet, so there is nothing to raise a better diagnostic from |
| The two reserved languages specify no syntax at all | Deliberate. Naming a language and fixing its constraints is cheap; choosing a grammar under-informed is expensive and hard to reverse |

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

| Question |
| --- |
| Should the scanner become a real CommonMark parser once the corpus exposes divergences, rather than a masker that approximates one? |
| Does a feature toggle apply to a card's own links only, or also to links inside content it embeds? Expansion is textual, so today the embedded card's own toggles govern |
| Should an imported search path be tried *before* the local spine? Today it is tried after, which buys monotonicity — importing a project can never break a name that already resolved — but it leaves an author who imports in order to override with no way to do it |
| Should the whole-tree sweep be bounded, so a large tree cannot make one unresolvable name expensive to diagnose? |
| Should the format have a way to silence a diagnostic at the line it fires on? |
| Should placement in the navigation inherit down a subtree the way visibility does? Visibility does, which is half an answer: the two inheriting differently is either a defensible split — placement is per card, publication is per folder — or an inconsistency |
| Is a red link with no destination right, or should it lead to something that offers to create the page? |
| What *should* a published card linking to a private one do — a blocked link, a page that exists but is unlisted, or nothing — and is that chosen per site? The answer decides whether the warning stays a warning (issue 0008) |
| How is the specification checked? An audit is a review, not a gate: it finds what it was asked to look for, and it can be right about the prose while the prose is wrong about the implementations |
| For the query language: what is the grammar, how are inline properties written and declared, what triggers writing results back into a source file, and is frontmatter a data block or a place to bind names? |
| For cross-project namespaces: which keys express a binding, what may a name contain, what fetches a remote project and is the result always pinned, and does resolution compose across two hops? |

## Changelog

- 2026-09-14: rewritten in the shape the trackers now use — status first in
  prose, then open work, broken, gaps, and done last. Work-point numbers are
  gone, and the per-proposal question tables became one list, since four
  different questions numbered `Q1` is the problem the change exists to fix.
- 2026-09-14: created by folding four per-proposal trackers into one file about
  the format. The underlined-heading item is new, and had been recorded
  backwards in the extension's README as a slug the TypeScript implementation
  invents.
