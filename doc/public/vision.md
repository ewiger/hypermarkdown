# Vision

## TL;DR

Markdown became the default plain text — README files, notes, issues and pull
requests, and, since the machines started writing back, what an AI chat answers
in. What it never got is the part HTML had on its first day: a link that means
something, a document that can be made out of other documents, a page that is
part of a web rather than a file in a folder.

HyperMarkDown adds that layer and tries to stop there. Cards name each other
instead of pointing at paths, multiple autodiscovery matches require an explicit
qualification, and a document can be composed out of parts of others.
Almost none of those ideas are new — the wiki tradition, MediaWiki's
transclusion, Obsidian's block references, and the wider Markdown ecosystem got
there first. What is being attempted is a coherent specification of them, in a
format that still reads when nothing is installed.

The longer argument is that this should not stop at one repository. A namespace
ID names a place to look — `namespace:path/to/card` — and whatever answers for
that ID serves HyperMarkDown, local or remote. Follow it far enough and it is
the Web again, made of Markdown: independently authored and independently served
knowledge that humans, tools, and AI read from the same source. That part is
unfinished — sketched in
[HMD-0004](../proposals/HMD-0004/README.md), not built — and this page argues for
it rather than reporting it.

## Ambition

!!! info "The simplicity of Markdown. The visual appeal of modern HTML."

    30 years ago, HTML was not more complex than plain text, yet made it possible to write websites and link them together. Markdown was a step back toward plain text, and it succeeded because it was simple enough to read in any editor. HyperMarkDown is a step towards reinventing HTML, and it succeeds because it is simple enough to read in any browser, terminal, editor, or AI chat.

Markdown already won. It is what a README is written in, what notes are kept in,
what issues and pull requests are argued in, and — since the machines started
writing back — what an AI chat answers in. It is the plain text everyone types
without being told to.

What it never got is the part HTML had on its first day: a link that means
something, a page that can be made out of other pages, a document that is part
of a web rather than a file in a folder. HyperMarkDown (`.hmd`) adds exactly
that, and stops. Every `.md` file is syntactically valid `.hmd`, so you can
adopt the format one file at a time. HMD preserves CommonMark constructs while
assigning added semantics to syntax that CommonMark otherwise treats as text.

## Still just markdown

A **card** is one `.hmd` file: one idea, ordinary Markdown, and links to its
neighbours. Open it anywhere — GitHub, an editor, `less`, a chat window — and it
reads fine; the wikilinks show as `[[bracketed text]]` and nothing is broken.
HyperMarkDown adds only a handful of constructs, and they are all variations on
one idea: *naming another card, or a part of one*.

```markdown
See [[tokens]] for the token format, or pull the definition in whole:

![[glossary/token#^definition]]
```

That is the entire surface. The whole language fits on one page and can be
learned in one sitting: the [HMD Tutorial](../wiki/hmd-tutorial.hmd), with the
[HMD Language Specification](../wiki/hmd-lang-spec.hmd) behind it for the exact
rules.

## Documents that assemble themselves

An embed is a link with a `!` in front: `![[glossary/token]]` splices the card
in where you wrote it, `![[glossary/token#Rotation]]` one section,
`![[glossary/token#^definition]]` one named block. Write a definition once and
embed it everywhere it is needed — cards stop being pages and start being parts.

The next step is computed content. [HQL](https://hql-lang.org/) cells let a card contain a
query whose result is written into the page: every card tagged
`area/backend`, every card linking here, the three cards closest in meaning to
a question, a table of contents. HQL is a separate project — a statically
typed query and data transformation language over vaults, JSON, YAML, and
records. What is planned for cells in a wiki is in the [Roadmap](roadmap.md).

## It looks like a real website

Plain text in, a real website out. Mathematics in TeX, callouts, diagrams,
tables, footnotes — a page can carry all of it, and the site you are reading is
the proof: a hand-ordered **book** with a generated **wiki** inside it, built
from this repository.

## The web, again — made of markdown

A folder is a **module**. It is the home base a set of cards belongs to and one
step on the spine used to resolve a bare name. That spine walks from the card's
own folder toward the root and never searches sideways. If it finds nothing,
autodiscovery may still resolve a unique card in a sibling module; write
`[[/shared/tokens]]` when that destination should be explicit rather than
discovered. This is closer to how a programming language treats a package than
to how a wiki treats a directory: a tree of cards can be read outward from the
current card.

Autodiscovery has no ranking rule. If it finds two matching pages, the reference
is an error and must be qualified:

```text
specs/auth/login.hmd:14:5: error[HMD002] [[tokens]] matches 2 pages; qualify it
```

A **namespace** is the step outward, and it is where the *hyper* in the name
starts meaning something. A namespace ID names a place to look up front —
`namespace:path/to/card` — and what answers for that ID is a server that speaks
HyperMarkDown. This site already runs one, unnamed: its own build, serving the
default namespace out of a local tree. Nothing says the binding has to stay
local, static, or singular. An ID could be remapped to an entirely different
server without a single link in your cards changing.

Follow that far enough and it is the worldwide web again — pages that live
somewhere, name each other across the gap, and compose — except that what you
type is markdown rather than HTML, and what you get back still opens in a text
editor. That is the bet, and it is genuinely unfinished: what a namespace is,
and how far an ID-to-server binding can go, is sketched rather than built in
[HMD-0004](../proposals/HMD-0004/README.md). The rules as they stand today are
[Namespaces](namespaces.md).

!!! tip "Read next"

    [The HMD Tutorial](../wiki/hmd-tutorial.hmd) — the part that exists today,
    taught start to finish. It takes one sitting.
