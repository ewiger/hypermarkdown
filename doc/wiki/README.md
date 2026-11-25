# Wiki

`doc/wiki/` is the project's knowledge base: a graph of cross-linked
**HyperMarkDown** (`.hmd`) cards, one concept per file. Each card defines a
single thing and links to its neighbours with `[[wikilinks]]`, so understanding
emerges from small, connected cards rather than one long document.

A graph has no first page, but it does have a good entrance. The order below is
a reading path, not a hierarchy — start anywhere and follow the links, or read
straight down if the format is new to you. Related cards can be grouped in topic
subfolders.

## The format

1. [HyperMarkDown](hypermarkdown.hmd) — what a card is and why the knowledge
   base is a graph of them. Start here.
2. [HMD Tutorial](hmd-tutorial.hmd) — the syntax, taught start to finish. Read
   it once and you can write HyperMarkDown.
3. [HyperMarkDown Language Specification](hmd-lang-spec.hmd) — the normative text behind
   the tutorial: grammar, resolution, diagnostics, and what a conforming
   implementation owes. Consult it when the answer has to be exact.

## The process

4. [Tracking](tracking.hmd) — where progress is recorded, and why there is one
   tracker per proposal rather than a repository-wide list.
5. [Kanban board](kanban.hmd) — how `doc/issues/` indexes the work currently in
   flight, and how that differs from a proposal.

## Writing a card

The authoring convention — naming, structure, and register — is the `doc/hmd`
documentation style, not repeated here:
[.grem/styles/doc/hmd/prompt.md](../../.grem/styles/doc/hmd/prompt.md). Render it
against a source document with `grem new --type doc --style hmd <source>` and an
agent applies it.

The sidebar follows the same order as this page. A card sets its own position
with an `order` under the `nav` key in its frontmatter, ascending; cards without
one sort after those that have one, by path. The numbering goes up in tens so a
new card can be placed between two existing ones without renumbering anything.

A new card also needs `visibility: public` under that same `nav` key, or it will
not be published — there is no folder note here to inherit it from, so each card
in this directory declares it. That is the point of the default: a card is
private until someone says otherwise, so a draft cannot reach the site by being
forgotten about.
