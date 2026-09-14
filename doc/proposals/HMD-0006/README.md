# HMD-0006: Extended URI for transclusion and link referencing when addressing inside a card

**Status**: drafted
**Created**: 2026-09-14

## Abstract

This proposal fixes one absolute, context-free way to name a location in
HyperMarkDown — a URI of the form `hmd://<namespace>/<card>#<address>` — and
makes that address fine enough to name not a document but a passage. The part
after the `#` grows from a single opaque slug into a **path of steps** separated
by `/`, each resolved inside the scope the previous one selected, so a location
may be named down to a span of words inside a sentence inside a paragraph of a
named section. Steps come in two kinds: **named** steps, which cite something an
author called something — a heading or a block anchor — and **counted** steps,
which cite an ordinal of a unit inside the enclosing scope, spelled either in
full (`Para3`) or abbreviated (`p3`). The units are the
block kinds the format permits (`Para`, `Table`, `List`, `Code`, `Blockquote`,
`Callout`, `Math`, `Diagram`, `Embed`, and `Block` for any of them), the text
units inside a block (`Sentence`, `Word`), and `Line`, which is rooted in the
file rather than in any scope. An address therefore has a root and a depth, and
they are independent: the root decides how long the address survives editing,
the depth decides how exactly it points.

One address then serves both directions across a link. **Referencing** points
at the passage and leaves it where it is; **transclusion** pulls the passage in
and renders it here. They have always been one operator apart in this format —
`[[…]]` against `![[…]]` — and giving both a fine-grained address is what makes
the second one a quotation rather than a whole-block inclusion.
The embed operator applied to a fine-grained address quotes exactly the span it
names, and an optional integrity digest lets a tool report that a source has
drifted under a quotation rather than leaving the drift silent. The existing
`#heading` and `#^block-id` spellings become the one-step cases of the same
grammar and change no meaning. Alongside the syntax, this record fixes a prose
rule the documentation has been breaking: a reference to a place in a document
MUST be written as a HyperMarkDown reference that names its target, never as a
numeric address such as a section sign followed by a number, and never as a bare
issue or rule identifier standing in place of the claim.

## Motivation

The project can already resolve a name to a card, and a fragment to a heading or
a block anchor inside it. What it cannot do is *hand that location to anyone
else*, and it cannot name anything smaller than a whole block. Four pressures
converge on the same missing piece:

- **A resolved link is not an address.** The `page_ref` an author writes is a
  query, not a location: a bare name is answered against the linking card's own
  directory, its import table, and the autodiscovery policy it inherits, so the
  same `[[tokens]]` in two cards may legitimately mean two different files.
  That is the right behaviour for authoring and useless for citation. Nothing in
  the format currently expresses the *answer* — the thing you paste into an
  issue, a commit message, a second project, or a language-server response.

- **The addressable unit is far too coarse.** The things people actually cite in
  a document are mostly smaller than a heading and smaller than a block: a
  clause, a sentence, a phrase, one row's worth of argument, the third paragraph
  of a section. A format whose finest address is a whole anchored block forces
  every finer citation out of the link grammar and into prose, where it becomes
  a number.

- **A quotation is currently a copy, and a copy is a fork.** Quoting another
  document today means pasting its words, after which the two diverge silently
  and nothing in the system can tell you. The quotation keeps asserting what the
  source once said, with no way to discover that it no longer says it. An
  address precise enough to select the quoted words turns the quotation back
  into a reference to living text, and makes drift detectable instead of
  invisible.

- **The documentation is full of addresses that are not links.** Roughly seven
  hundred and seventy references across this repository cite a location as a
  section sign followed by a number. Every one of them is unclickable, unchecked
  by any linter, silently wrong the moment a section is renumbered, and
  meaningless to a reader who does not have the other document open. The house
  style in [`TEMPLATE.md`](../TEMPLATE.md) already forbids the practice —
  "an identifier may follow a claim; it may never BE the claim" — and the
  practice continues because the format offers nothing to replace it with. This
  record supplies the replacement, which is the only thing that makes the rule
  enforceable rather than aspirational.

## Non-goals

- **No fetch mechanism, no wire protocol, no trust model.** Those belong to
  [HMD-0004](../HMD-0004/README.md) and remain open there. This record defines
  what an address *is*, not how a remote one is retrieved.
- **No change to how a bare name resolves.** The four-phase search is untouched.
  This record defines the notation for the result of that search, not the
  search.
- **No natural-language analysis.** Sentence and word units are defined by
  pinned mechanical rules, not by a linguistic model. The reasoning is under
  *Segmenting a scope into units*.
- **The integrity digest is not a security control.** It detects drift by
  accident, not tampering by intent; it is author-supplied and travels with the
  thing it describes.
- **No implementation.** Neither implementation parses a multi-step fragment
  today. This is a design record; the work it implies belongs in the trackers,
  and no rows are added until the design is agreed.

## Specification

### The URI

The absolute form names a namespace, a card within it, and optionally a place
inside that card:

```text
hmd_uri    := "hmd://" [ namespace ] "/" card_path [ "#" address ]
namespace  := segment
card_path  := segment *( "/" segment )
```

- `hmd://wiki/lang/tokens#^limit` names the block anchored `^limit` in the card
  at `lang/tokens` in the namespace bound to `wiki`.
- An **empty authority** means the project's own default namespace, which has no
  ID because there is nothing to tell it apart from: `hmd:///lang/tokens`. This
  follows the ordinary URI convention that an empty authority is the local one,
  the way `file:///` does, rather than inventing a reserved word for "here".
- `card_path` MUST be absolute from the namespace root and MUST be the path of
  the *resolved* card, never the text an author wrote. A URI is context-free by
  definition; a bare name is not, so minting a URI from unresolved link text
  would produce an address that means different things in different places,
  which is precisely the property a URI exists to deny.
- A card path MUST be spelled without the `.hmd` suffix and without a trailing
  `index` segment, so the two names for a folder note produce one URI. Two
  spellings for one card must not become two addresses for one card, for the
  same reason they do not become two URLs.

The scheme is `hmd`, which [HMD-0002](../HMD-0002/README.md) already spends on
the nav placeholder `hmd://wiki`. That is not a collision to resolve but a case
to absorb: a URI with an authority and no path names the namespace as a whole,
which is exactly what the placeholder means. The placeholder becomes the
zero-path case of this grammar and needs no amendment.

The shorthand `namespace:card_path` fixed by [HMD-0004](../HMD-0004/README.md)
is the in-card spelling of the same thing, and the two MUST agree: expanding a
shorthand and resolving a URI produce one location. The shorthand is what an
author types inside a card, where the namespace binding is in scope; the URI is
what leaves the project, where nothing is in scope.

### The address after the hash

Everything after the `#` addresses a place inside one card. It is a path of
**steps**, separated by `/`, and each step is resolved inside the scope its
predecessor selected:

```text
address      := step *( "/" step ) [ integrity ]
step         := named_step / counted_step
named_step   := heading_slug / "^" block_id
counted_step := unit ordinal [ "-" unit ordinal ]
unit         := long_unit / short_unit
long_unit    := block_unit / text_unit / "Line"
short_unit   := "p" / "s" / "w" / "l" / "t" / "c" / "b" / "d" / "m" / "e"
ordinal      := 1*DIGIT
integrity    := "@sha256-" 16HEXDIG
```

The first step is resolved against the whole card. Scoping is the whole point:
it lets a paragraph be named relative to its section and a phrase relative to
its paragraph, which is how a person cites one. Nobody counts words from the top
of a long document.

```text
#the-limit                            the section
#the-limit/Para3                      its third paragraph
#the-limit/Para3/Sentence2            the second sentence of that paragraph
#the-limit/Para3/Sentence2/Word5-Word9    five words inside that sentence
#^limit/Sentence2/Word5-Word9         the same, rooted on an anchor instead
#the-limit/Table2                     the second table in the section
#the-limit/Table2/Line3-Line5         three of its source lines
#Line12-Line40                        lines 12 to 40 of the card
```

Units are spelled as capitalised words rather than sigils or single letters.
The address is meant to be read out loud, pasted into an issue, and understood
by someone who has never opened this document — which is the entire complaint
against the notation it replaces. `Para3` costs three characters more than `P3`
and needs no key.

#### Named steps cite something an author called something

- A **heading** step selects a *section*: the heading itself and everything
  after it up to the next heading of the same or a higher level. The slug MUST
  be the one the renderer assigns, so that a link and its rendered destination
  cannot disagree — the rule the format already follows for single-step
  fragments, extended unchanged.

- A **block** step selects the block carrying that anchor. Block IDs are unique
  within a card, so a block step MUST resolve identically wherever it appears in
  an address. It MAY follow a heading step, and when it does the heading is
  documentation for the reader rather than a constraint on the resolver; an
  implementation MUST NOT treat a block step as unresolvable merely because the
  preceding steps do not contain it, and SHOULD report the mismatch as a
  diagnostic, because it means the address was written against a version of the
  card where the block lived somewhere else.

#### Counted steps cite an ordinal inside the enclosing scope

A counted step is a capitalised unit name and a 1-based ordinal, with a range
written as two of them joined by `-`. The units fall into three tiers, and the
tiers are not decoration — they differ in what they are counted over:

**Block units** are the block kinds the format permits, counted over the blocks
of the enclosing scope:

```text
block_unit := "Para" / "Table" / "List" / "Code" / "Blockquote"
            / "Callout" / "Math" / "Diagram" / "Embed" / "Block"
```

- A block unit counts only blocks of that kind, in document order: `Table2` is
  the second table in the scope whether or not paragraphs sit between the two.
  Counting per kind is what makes an ordinal match what a reader counts, and it
  is why the units are named rather than numbered off a single sequence.
- `Block` counts every block regardless of kind, and exists for the passage that
  has no better name — the fourth thing in this section, whatever it turned out
  to be. It is the block-level equivalent of a line span: always available,
  always the weakest choice.
- The list is open: permitting a new block kind adds its name to it and changes
  no grammar.

**Text units** are counted over the prose inside the enclosing scope:

```text
text_unit := "Sentence" / "Word"
```

**`Line`** is counted over the card's source, and is the only unit rooted in the
file rather than in a scope.

Three constraints keep the grammar honest:

- A range MUST use the same unit on both ends, and MUST be the last step in an
  address. `Para3-Para5/Sentence2` has no meaning — a range selects content, not
  a scope to descend into — and forbidding it outright is cheaper than defining
  which member of the range the next step would apply to.
- A `Line` step MUST be either the first step or a step inside a block already
  selected, and in both cases it MUST be the last. Lines within a selected table
  or code fence are a reasonable thing to want; lines relative to a *section*
  are not, because a section is a range of the file and saying "line 3 of it"
  invites the reader to count from the wrong place.
- An ordinal past the end of its scope MUST be reported as a diagnostic and MUST
  NOT silently clamp to the last member. An address that points at nothing is
  information; an address quietly redirected to the nearest survivor is a lie
  that reads as a success.

#### Both spellings, and which one is which

A unit may be written out in full with a capital — `Para3` — or abbreviated to a
lowercase letter and the ordinal — `p3`. The two are the same step and MUST
resolve identically. The long form is for an address that will be read by
someone else; the short form is for one being typed.

```text
p  Para        s  Sentence     t  Table     d  Diagram
l  Line        w  Word         c  Code      m  Math
b  Block                                    e  Embed
```

- A letter, once assigned, MUST NOT be reassigned to another unit. The letters
  are a fixed convenience over the frequent units, not a parallel naming system
  that grows alongside the long names — which is why `List`, `Blockquote`, and
  `Callout` have none and are spelled out. A closed alphabet that had to be
  renegotiated whenever the document model grew is the thing the long names
  exist to avoid, and it MUST NOT be reintroduced by letting the short forms
  chase it.
- Both ends of a range MUST use the same spelling: `w5-w9` or `Word5-Word9`,
  never `w5-Word9`. A range written two ways in one breath is a typo that
  parses.
- A tool minting an address SHOULD emit the long form. An address is minted once
  and read for years, and the reader is the one who was not there when it was
  written.

The capitalised form carries a structural guarantee the abbreviated one cannot:
the slug function the format delegates to lowercases unconditionally, so no
heading in any card can ever slug to `Para3` or `Table2`. A lowercase step has
no such immunity — a heading called `P3` slugs to exactly `p3` — so the
ambiguity is settled by a fixed rule rather than by the card's contents:

- A step matching a lowercase letter followed by digits, optionally a range,
  MUST be read as a unit, always, whatever headings the card contains. An
  address MUST mean the same thing before and after an unrelated heading is
  added somewhere in the target, and a precedence that consulted the document
  would break exactly that.
- A heading whose slug is shadowed by this rule MUST be reported as a diagnostic
  and is reachable by anchoring it, which is the remedy the ladder already
  prescribes for a heading not worth addressing by name. No heading in this
  repository is currently shadowed, and the shape is rare enough that the cost
  is a diagnostic rather than a redesign.

### Every block kind is addressable by its type

Addressing covers the whole document, not the prose in it. A scheme that can
name the third paragraph but not the second table makes the table the one thing
you still have to cite by counting — which reintroduces, for exactly the
elements hardest to describe in words, the failure this record exists to remove.

- Every block kind the format permits MUST be addressable by its own type and an
  ordinal. A table is cited as a table, a code fence as a code fence, and
  neither is reachable only as an anonymous position in a mixed sequence.
- The set of units MUST track the format's set of block kinds. Permitting a new
  block kind makes it addressable by naming it, and the grammar does not change.
  This is why units are spelled as words: a closed alphabet of letters would
  have to be renegotiated every time the document model grows, and the address
  would become a lookup table instead of a sentence.
- The document model MUST expose, for every block, its kind, its order among
  blocks of that kind, and its extent in the source. An address names a place in
  a document an author edits, so the model MUST be able to answer it without
  rendering the card — a language server, a linter, and a preview all resolve
  the same address and only one of them has a renderer.
- Both implementations MUST agree on block boundaries exactly, and the shared
  conformance corpus is where that agreement is established rather than assumed.
  An ordinal is meaningless without it: a `Table2` that counts differently in two
  implementations is not a weaker address but a wrong one, and determinism is a
  guarantee the format makes rather than an outcome it hopes for.

### Segmenting a scope into units

Blocks and lines have structural boundaries. Sentences and words do not, and
both implementations MUST agree on them exactly or an address means two things.
Determinism is the constraint that decides the rules below, ahead of linguistic
correctness:

- A **word** is a maximal run of characters containing no Unicode whitespace,
  counted over the scope's source text. This needs no tables, no locale, and no
  Unicode version, so two implementations written years apart in different
  languages cannot drift. It counts inline markup as part of the word it touches,
  which is a wrinkle worth stating and not worth fixing: `**five**` is one word
  either way, and the alternative is to make word counting depend on a renderer.

- A **sentence** ends at `.`, `!`, or `?`, when that character is followed by
  whitespace or by the end of the scope. Everything from the previous boundary
  up to and including the terminator is one sentence.

The sentence rule is knowingly wrong on abbreviations and decimals: `e.g.`,
`Dr.`, and `0.5` each split a sentence that a reader would not. The alternative
is not obviously better. A correct segmenter means the Unicode sentence-boundary
algorithm, which would put ICU-grade tables inside both implementations and make
the meaning of an address depend on which Unicode version each was built against
— trading a visible, predictable error for an invisible, version-dependent one,
in a project whose first principle is that the same input produces the same
answer on every machine. A wrong rule that both implementations get wrong
identically is a usable address; a right rule they disagree about is not.

The remedy for a citation the rule splits badly is to root the address better
and use a word span, which is finer, more durable, and unaffected by sentence
boundaries. Refining the rule is the first open question below.

### The root decides lifespan, the depth decides precision

The two are independent, and conflating them is the mistake this section exists
to prevent. Depth costs almost nothing in durability, because every counted step
is relative to the scope above it; what an address lives or dies by is its
**first** step:

| Root | Survives | Broken by |
| --- | --- | --- |
| `^anchor` | rewording, reordering, moving the block between sections | deleting the anchor |
| heading slug | any edit to body text elsewhere | rewording the heading |
| `Block`, `Para`, `Table` … at card level | edits after it | inserting a block of that kind before it |
| `Line` | almost nothing | any edit that shifts a line |

So `#^limit/Sentence2/Word5-Word9` is both the most precise address in this
record and among the most durable: it points at nine words, and it goes on
pointing at them after the section is renamed and the block is moved.
`#Line12-Line40` is neither precise nor durable, because a line is not a unit of
meaning and a file offset is not a name. Depth is cheap; a weak root is what
costs.

- A tool that mints an address MUST root it as high in that table as the target
  allows: an anchored block over its enclosing heading, and a heading over a
  card-level ordinal or file coordinates. It SHOULD then descend as deep as the
  citation actually needs. An address is minted once and read for years, so the
  cost of computing the best one is paid at the only moment it is cheap.
- A line span is a legitimate address and MUST be supported rather than
  discouraged into non-existence. It is the honest answer for a card under
  active drafting, for a file that is not a card at all, and for a quotation
  whose boundaries do not respect any unit above. What it MUST NOT be is silent
  about its own fragility: a tool minting one SHOULD say that a durable address
  is available by anchoring the target, and offer to do it.
- Authoring an anchor is therefore the act of promoting a location to a better
  root, and the format SHOULD make it a one-keystroke operation in an editor.
  The ladder only works if climbing it is easier than not.

### Quoting: an address that yields its text

An address precise enough to select words is precise enough to *return* them,
and that changes what a quotation is. The embed operator already transcludes a
resolved target — pulling its content in and rendering it in place; applied to a
fine-grained address it transcludes exactly the span that address names, which
is what a quotation has always been:

```text
![[hmd-0001#^limit/Sentence2]]
```

- Embedding a fine-grained address MUST yield the text that address selects, and
  nothing else. A quotation therefore stops being a copy. Copied text is a fork:
  it drifts from its source silently, keeps asserting what the source once said,
  and offers nothing that could notice. A quotation that is an address is a
  reference to living text, and every check that applies to a link now applies
  to a quotation.
- A quotation MUST be attributable: a renderer SHOULD present the source address
  alongside the quoted text, so a reader can reach the surrounding context. A
  quotation whose provenance is not reachable has given up the property that
  distinguishes it from a copy.
- The publication gate applies unchanged. Embedding is how bytes cross from one
  card into another, so quoting from a private card into a public one is the
  same disclosure as embedding one, and MUST be refused the same way. A finer
  address does not make a smaller leak acceptable.

#### The integrity digest

A quotation can go stale in a way unresolvability never reports: the address
still resolves, and the words behind it have changed. The optional suffix says
what the author saw:

```text
![[hmd-0001#^limit/Sentence2@sha256-3f7a1c92be40d5e8]]
```

- The digest MUST be SHA-256 over the exact source bytes of the selected span,
  UTF-8, with no normalization and no trimming, truncated to the first sixteen
  lowercase hex characters. Pinning the encoding and the truncation is what
  makes two implementations produce one string; sixteen characters is far beyond
  what accidental drift could collide with, and this is not defending against a
  chosen collision.
- A mismatch MUST be reported as a diagnostic and MUST NOT prevent the document
  from rendering. The author needs to see both the quotation and the fact that
  it moved; refusing to render destroys the information the digest exists to
  deliver.
- The digest is OPTIONAL and its absence MUST NOT be a diagnostic. Most
  quotations inside one project want the living text and would find a stale-quote
  warning on every edit to be noise. The digest is for a quotation whose exact
  wording is the point — a specification being cited, an argument being answered
  — and for quotations that cross a namespace boundary, where the source is
  someone else's to change.

### Writing a reference instead of a number

The syntax above exists so that prose can stop addressing documents
arithmetically. The rule applies to every document in this repository:

- A reference to a place in a document MUST be written as a HyperMarkDown
  reference that names its target — `[[hmd-0001#the-address-form]]` — and MUST
  NOT be written as a numeric address such as a section sign followed by a
  number. A name states what is being cited; a number states only where it
  currently sits, which is the one fact guaranteed to change.
- A reference MUST NOT be replaced by a bare identifier. An issue number, a
  diagnostic code, or a rule ID may *follow* a claim so a reader can find the
  row, in brackets, and it may never be the claim itself. A sentence that cannot
  be parsed without opening another file is not a sentence.
- Where a target has no addressable anchor, the correct response is to anchor
  it, not to fall back to a number. This is the ladder applied to prose: the
  reference forces the anchor into existence, and the anchor makes the next
  reference durable.

## Backwards Compatibility

Nothing existing changes meaning, and the additive property is structural rather
than lucky: today's `#heading` and `#^block-id` are exactly the one-step cases of
the grammar above, and a one-step address is resolved the way it always was.

A multi-step address introduces `/` inside a fragment, a character the link
grammar does not reserve and therefore currently passes through as part of a
heading slug. No heading slugs to a string containing `/`, so no address that
resolves today acquires a second meaning; the previously meaningless shape gains
one. The capital-letter guarantee above covers the long-form counted steps for the
same reason, and `@` is likewise unreserved and unused in any fragment that
resolves today.

The abbreviated forms are the one place this record takes something back. A
fragment such as `#p3` resolves today as a heading slug, and under this grammar
it becomes a paragraph ordinal. No heading in this repository slugs to that
shape, so nothing here changes meaning; a card elsewhere that relies on one gets
a diagnostic naming the shadowed heading rather than a silent redirection.

`hmd://wiki` continues to mean what it meant. Until an implementation resolves
a multi-step address it MUST behave as an unresolved fragment — a red link, not
a crash.

## Security Considerations

- A URI MUST NOT be dereferenced as a side effect of parsing, linting, or
  rendering a card. Writing an address is not asking for its target, and the
  no-silent-network rule carried by [HMD-0004](../HMD-0004/README.md) applies to
  this spelling of an address exactly as to the shorthand.
- A card path in a URI MUST satisfy the same containment check as any other
  resolved target, against whatever tree the namespace's provider exposes. An
  absolute-looking address is not an exemption from the escape check, and the
  `..` segments a URI may carry make stating this worthwhile rather than
  obvious.
- Quoting is disclosure, and a fine-grained quotation is disclosure of a smaller
  thing rather than a different kind of thing. The visibility gate that governs
  embedding MUST govern quoting unchanged, and the depth of an address MUST NOT
  be usable to reach content the whole block could not be reached from.
- The integrity digest MUST NOT be presented as authentication. It travels
  inside the card that cites the source, so anyone able to edit the quotation is
  able to edit the digest; it reports accidental drift, and a tool that implied
  more would be offering a guarantee it cannot keep.
- Counted steps are bounded by construction: an ordinal names a position in
  content already scanned, so resolving one cannot cost more than the scope it
  runs over. An implementation MUST bound the ordinal it will accept rather than
  allocating against it, since the digits in an address are attacker-chosen and
  the scope they index is not.

## Outlook: the documentation becomes a vault

Applying the prose rule has a consequence this record names without scheduling.
A reference written as `[[hmd-0001#the-address-form]]` is a wikilink, wikilinks
are resolved inside a namespace, and the namespace root is currently `doc/wiki`
— so the rule cannot be applied to a document that is not a card. Carrying it
through means the tree under `doc/` becomes HyperMarkDown: the trackers, the
proposals, the issues, and the memory notes stop being markdown files that
happen to sit near a wiki and become cards in a vault of their own.

That is a larger tree than one namespace root currently admits, and per-project
multi-vault support does not exist. So this is an outlook and not a plan: the
notation is specified here, it is readable before it resolves, and the order of
operations — which documents convert, what happens to the site build and the
link checks that currently depend on markdown paths, and whether the vault is a
second namespace or a widened root — is deliberately left for its own record.

## Open Questions

- Can the sentence rule be improved without giving up cross-implementation
  determinism — a pinned abbreviation list, a rule about a following capital, or
  a decision that the current rule is good enough given that word spans exist as
  the escape hatch?
- Should a word be counted over source text or over rendered text, and does the
  answer change if a language server has to compute it without a renderer?
- How do nesting block kinds count? A list inside a list and a blockquote inside
  a blockquote both raise the same unanswered question: whether an inner one is counted
  at the outer level, only within its parent, or both — and whether descending
  into one is a step of its own.
- Should a table be addressable *below* the block level — a row, a column, a
  cell — and if so, does that want its own units or a coordinate spelling?
- Should an address be able to name a range across two *named* steps — anchor to
  anchor, or heading to heading — rather than only a range within one unit?
- Should a range be permitted to straddle a scope boundary, as `Word5` of one
  sentence through `Word3` of the next, or is the one-scope restriction right?
- Does the empty authority (`hmd:///card`) earn its place, or should the default
  namespace be required to have an ID before any URI naming it may be written?
- Should a stale digest be repairable automatically — a command that re-reads the
  source, shows the difference, and rewrites the digest — and is that a tool
  question or a format one?
- What diagnostic numbers do the new failure modes take: an unresolvable step, a
  block step contradicted by its preceding heading, an ordinal past the end of
  its scope, a range whose ends are in the wrong order, a range that is not the
  last step, and a digest that does not match?
- Should the format define a canonical *shortest* address, so that two tools
  minting an address for the same location produce the same string?

## See also

- [HMD-0001](../HMD-0001/README.md) — the grammar this extends, the four-phase
  resolution search, and the containment rule.
- [HMD-0002](../HMD-0002/README.md) — the URL policy, the visibility gate on
  embedding, and the `hmd://wiki` nav placeholder this grammar absorbs.
- [HMD-0004](../HMD-0004/README.md) — namespaces, the `namespace:card` shorthand,
  and the binding rules a URI's authority relies on.
- [HMD-0020](../HMD-0020/README.md) — the document model that must carry block
  kind, order, and source extent for an address to resolve.
- [`TEMPLATE.md`](../TEMPLATE.md) — the house rule on identifiers in prose that
  this record makes enforceable.

## Changelog

- 2026-09-14: drafted
