# HMD-0003: HQL — the Hyper Query Language

**Status**: drafted
**Created**: 2026-08-07

## Abstract

HQL — the **Hyper Query Language** — is the declarative language a card uses to
ask questions of the wiki it lives in. Instead of listing related pages by hand,
an author writes a query, and the answer is computed from the pages themselves:
every card tagged `#area/backend`, every block someone marked `status:: blocked`,
every page linking here.

It reads the graph the resolver already builds — pages, their frontmatter, their
headings and blocks, their tags, and the links and embeds between them. It is
functional and declarative, drawing its shape from SQL's clause structure,
Python's expressions and comprehensions, and Scala's collection combinators.

This record reserves the name, fixes the design constraints, and names the
decisions that must be taken. **It specifies no syntax.** Three deferred
features are its scope: inline per-block properties, templates, and the query
language itself.

## Motivation

HQL is not part of the MVP — it is too complex to design well alongside the
resolver — but it is a meaningful feature, and the largest undesigned area in
the project. Deferring the grammar is right; leaving it unnamed is not. Three
feature rows, a CLI command (`hmd query`), a fence language, and a preview
behavior all refer to a thing with no identifier.

- **Name the thing.** HQL is the identifier the rest of the project cites.
- **Bound the scope.** Inline properties, templates, and queries are one design
  problem seen from three angles. Recording that here stops them from being
  solved separately and incompatibly.
- **Fix the constraints before the syntax.** Determinism, materialization, and
  shared depth limits are load-bearing and cheap to state now; they are
  expensive to retrofit into a grammar that ignored them.

One compatibility risk is worth naming up front. Every construct the format
specifies today is local to one card: a card renders identically wherever it
sits. A query does not — its output depends on other files. That is the point of
it, and it is also what makes deterministic output hard.

## Goals

- Reserve **HQL** as the name, and this number as its home.
- State the constraints any grammar must satisfy, independent of spelling.
- Enumerate the places HQL shows up, so no other proposal claims part of it
  silently.

## Non-goals

- **No syntax.** Not a keyword, not a fence tag, not an operator. Every
  syntactic question here is open, deliberately.
- No implementation, no module layout, no test plan — those follow the grammar
  and cannot precede it.
- No change to any shipped construct. The existing proposals stand unmodified;
  this record adds nothing to frontmatter and reserves no key.

## Specification

Nothing below is normative about *form*. Each rule constrains any future
grammar without choosing one.

### 1. Language character

HQL is **declarative and functional**: a query states what to match, never how
to walk the graph, and its expression language is free of side effects.

- A query MUST be a pure function of the resolved graph. The same wiki MUST
  produce the same results, in the same order, on any machine. That requirement
  is why the shape borrows from SQL rather than from a scripting language.
- The three influences map to three different layers, and the split is
  deliberate: **SQL** for clause structure — a source, a filter, a projection,
  an explicit order; **Python** for the expression and comprehension layer
  inside those clauses; **Scala** for the combinator style over result
  collections.
- HQL MUST NOT reach outside the wiki — no network, no clock, no filesystem
  beyond the resolved graph. A query that could observe its environment would
  make builds unreproducible, which is the same failure the plugin purity rule
  exists to prevent.

### 2. What a query can address

A query MUST be able to address each of the following:

```text
pages         path, namespace, folder-note binding
frontmatter   the reserved block (tags / use / import / nav) and user-owned keys
sections      headings and their slugs
blocks        block anchors and their content
properties    inline per-block properties — the block-scoped counterpart
              of frontmatter, which is page-scoped
tags          including hierarchical match: #area/backend matches descendants
edges         inbound and outbound links, and embeds
variables     query-local bindings, which no current construct provides
```

- Frontmatter and inline properties MUST be queryable through one property
  model, differing only in scope. They are the same kind of data attached at
  two granularities. A grammar treating them as separate concepts would make
  "every card or block tagged X" two queries instead of one.
- Tag matching MUST be hierarchical: `#area/backend` matches its descendants.

### 3. The fence and its two modes

A query lives in a fenced code block, and the fence's info string carries a
**mode**. This is the one syntactic decision the record takes, because it is
about the evaluation model rather than about grammar.

```text
```hmq#eval     evaluate the query; the result is what a reader sees
```hmq          do not evaluate; syntax-highlight the query as source
```

- The bare fence MUST NOT evaluate. Showing a query without running it is the
  same need that escapes for wikilinks address — a card documenting the language
  is the card most likely to need it — and here it is solved by default rather
  than by an escape.
- Evaluation MUST be opt-in and marked in the source. A reader looking at raw
  HyperMarkDown can tell which fences reach outside the card, without knowing
  the grammar.
- The suffix is a **mode**, not a language. Both fences are HQL and MUST parse
  identically. Highlighting a fence that cannot parse MUST still report the
  error, so an unevaluated query is checked rather than merely decorative.

The tag `hmq` predates the name HQL and may become `hql`; that spelling is
open. The mode design is independent of it. Whether other modes exist — a
materializing mode distinct from `#eval`, or one that renders results without
writing them — is also open.

### 4. Determinism and materialization

- A query with more than one result MUST specify its ordering explicitly. There
  is no implicit order; the graph's natural order is an implementation detail
  and MUST NOT leak into output.
- Time-relative predicates ("modified in the last week") MUST NOT exist unless
  pinned to a value written in the source.
- Results MUST be materializable: written back into the card as ordinary
  content, so a reader with no tooling sees them.

Materialization is not a convenience. In Obsidian, Dataview results live only at
render time, and a separate plugin — *Dataview Serializer* — exists solely to
write them down. Building materialization in from the start is the one place
this project deliberately diverges from its closest precedent.

### 5. Templates share the language

Templates are not a separate language. A parameterized transclusion is HQL's
expression layer plus iteration over a result set, which is what makes
Wikipedia-style topic pages possible: one template, applied to everything a
query returns.

- Template expansion and query evaluation MUST share one depth limit and one
  cycle detector with the embed resolver, currently capped at 16. Templates
  iterate query results and queries can match template output, so two
  independent limits would leave a cycle that neither catches.
- The composite unit — a template plus a query plus a namespace, invoked as one
  thing — is provisionally called a **Topic**. Whether Topic is a real construct
  or merely a convention is open.

### 6. Frontmatter as a declaration space

This section records an open direction rather than a rule, because it changes
what the `variables` row above means.

Frontmatter today is a static mapping. It could instead be a small
**declaration space** — the place a card binds variables and names definitions
that its body and its queries then reference, the way a Python module's top
level declares before the code below uses it.

- Any such binding MUST remain pure data or a pure definition. Control flow,
  evaluation with side effects, or anything observing the environment would
  break the purity rule for the whole card, not merely for one query.
- A card whose frontmatter declares nothing MUST behave exactly as it does
  today. This direction is additive or it does not happen.

The tension is real and unresolved. The reserved frontmatter keys are currently
a *closed* set — `tags`, `use`, `import` — with one amendment (`nav`) already
outstanding against that rule. And "frontmatter is a buffer where you can do a
bit of programming" is a different claim about the block than "frontmatter is
configuration."

### 7. Where HQL shows up

HQL is one language with four consumers, and each MUST see identical semantics:

- **A fence in a card**, evaluated at build time by the MkDocs layer.
- **`hmd query`**, running a query from the shell.
- **Preview mode**, where results render live before materialization.
- **Materialized output**, the committed result of the same query.

## Backwards Compatibility

Nothing breaks. HQL adds constructs and changes none. Two forward constraints,
both stated so a later grammar cannot quietly violate them:

- HQL MUST NOT require a new reserved frontmatter key. That set is closed and
  already carries one outstanding amendment; a second would make the "closed
  set" rule meaningless.
- A card containing an unevaluated query MUST remain valid HyperMarkDown, and
  MUST render as something a reader can understand without the tooling.

## Security Considerations

A query language is the first construct that makes evaluation cost depend on
authored input, so the resource bounds are the security surface.

- Evaluation MUST be bounded. A query MUST NOT be able to run unboundedly on a
  finite graph, and the depth limit is shared with embeds rather than separate.
- Materialization writes into source files. What is allowed to trigger a write,
  and whether a build may ever write at all, is open — and is security-relevant
  rather than merely ergonomic.
- The purity rule is what keeps a query from becoming an exfiltration path once
  plugins can extend the set of things a query draws from.

## Open Questions

Every syntactic decision is open by design, and the grammar blocks all of them.
They must be resolved before this record moves from `drafted` to `accepted`.

The questions are tracked in [the language tracker](../../status/lang.md#hql-hmd-0003)
and only there. The template asks a record to carry the list and mirror it into
the tracker; this record does not, because the mirror drifts and then a reader
has to open both files to find out which copy is current.

## See also

- [`doc/status/lang.md`](../../status/lang.md) — work points, limitations, and the open questions.
- [HMD-0001](../HMD-0001/README.md) — the grammar and resolver HQL reads from.
- [HMD-0002](../HMD-0002/README.md) — MkDocs rendering, which evaluates fences.
- [The initial sketch, §9](../../models/requirements/initial_sketch.md) — where
  the requirements behind this record originate.
- [Feature list](../../wiki/hmd-feature-list.hmd) — rows F21, F24, and F25 are
  this proposal's scope.

## Changelog

- 2026-08-07: drafted as a stub — name, constraints, and open questions
  reserved; no grammar specified.
- 2026-08-07: fence modes decided — `hmq#eval` evaluates, a bare `hmq` fence
  highlights without evaluating. The only syntax this record fixes.
- 2026-08-07: open questions moved wholly into the tracker; this
  record points at the tracker rather than mirroring it.
- 2026-08-07: rewritten as continuous prose. Feature IDs, section numbers, and
  sketch requirement numbers were removed from the body and collected under
  *See also*.
