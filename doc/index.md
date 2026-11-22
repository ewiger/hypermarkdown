---
template: home.html
hide:
  - navigation
  - toc
---
<section class="hmd-band hmd-band--hero" markdown>
<div class="hmd-hero-grid" markdown>
<div class="hmd-hero-text" markdown>

# HyperMarkDown { .hmd-hero }

<p class="hmd-tagline">An AI-ready document language for humans and machines.</p>

Built on the simplicity of Markdown, HyperMarkDown brings together wiki links,
structured metadata, rich visuals, semantic relationships, and executable HQL
cells. Write documents, connect ideas, build a mesh of knowledge, and bring it
to life through computation and AI.

<p class="hmd-actions" markdown>[Quick start](tools/index.md){ .md-button .md-button--primary } [Tutorial](wiki/hmd-tutorial.hmd){ .md-button }</p>

```sh
pip install HyperMarkDown
```

</div>
<div class="hmd-term" markdown>
<div class="hmd-tabbar" role="radiogroup" aria-label="What a card can hold">
<input type="radio" name="hmd-demo" id="hmd-demo-link" value="link" checked><label for="hmd-demo-link">Link</label>
<input type="radio" name="hmd-demo" id="hmd-demo-embed" value="embed"><label for="hmd-demo-embed">Embed</label>
<input type="radio" name="hmd-demo" id="hmd-demo-diagram" value="diagram"><label for="hmd-demo-diagram">Diagram</label>
<input type="radio" name="hmd-demo" id="hmd-demo-cell" value="cell"><label for="hmd-demo-cell">Cell</label>
<input type="radio" name="hmd-demo" id="hmd-demo-check" value="check"><label for="hmd-demo-check">Check</label>
</div>
<div class="hmd-pane" data-tab="link" markdown>

```hmd title="specs/auth/tokens.hmd"
What authentication does with a token. The wire format and lifetime rules are
shared and live in [[/shared/tokens]]; this card only covers issuance.

## Issuance

A token is issued only after a completed [[login]] flow.
```

<div class="hmd-out" data-label="rendered" markdown>

What authentication does with a token. The wire format and lifetime rules are
shared and live in [/shared/tokens](https://github.com/ewiger/hypermarkdown/blob/main/examples/small/shared/tokens.hmd); this card only covers issuance.

#### Issuance

A token is issued only after a completed [login](https://github.com/ewiger/hypermarkdown/blob/main/examples/small/specs/auth/login.hmd) flow.

</div>
</div>
<div class="hmd-pane" data-tab="embed" markdown>

```hmd title="shared/tokens.hmd"
Tokens rotate every 24 hours, and a rotated token stays valid for a 60-second
overlap so in-flight requests are not cut off. ^rotation-window
```

```hmd title="specs/auth/tokens.hmd"
The issuing service
never reuses a subject's previous token, even when the previous one is still
inside its rotation overlap:

![[/shared/tokens#^rotation-window]]
```

<div class="hmd-out" data-label="rendered" markdown>

The issuing service
never reuses a subject's previous token, even when the previous one is still
inside its rotation overlap:

<div class="hmd-embed" markdown>
<p class="hmd-embed__from">shared/tokens#^rotation-window</p>

Tokens rotate every 24 hours, and a rotated token stays valid for a 60-second
overlap so in-flight requests are not cut off.

</div>
</div>
</div>
<div class="hmd-pane" data-tab="diagram" markdown>

````hmd title="specs/auth/login.hmd"
```d2
client -> edge: credentials
edge -> auth: verify
auth -> edge: token
edge -> client: token + rotation window
```
````

<div class="hmd-out" data-label="rendered" markdown>

```d2
client -> edge: credentials
edge -> auth: verify
auth -> edge: token
edge -> client: token + rotation window
```

</div>
</div>
<div class="hmd-pane" data-tab="cell" markdown>

````hmd title="contents.hmd"
```hql#eval id=books
cards
| filter(c => c.name != "contents")
| sort(by = c => c.title)
```
````

<div class="hmd-out" data-label="output, saved in the card" markdown>

- [dune](https://github.com/ewiger/hypermarkdown/blob/main/examples/notebook/books/dune.hmd)
- [emma](https://github.com/ewiger/hypermarkdown/blob/main/examples/notebook/books/emma.hmd)
- [middlemarch](https://github.com/ewiger/hypermarkdown/blob/main/examples/notebook/books/middlemarch.hmd)
- [the-hobbit](https://github.com/ewiger/hypermarkdown/blob/main/examples/notebook/books/the-hobbit.hmd)

</div>
</div>
<div class="hmd-pane" data-tab="check" markdown>

```hmd title="notes.hmd"
See [[tokens]] for the lifetime rules.
```

<div class="hmd-log" markdown>

```text title="hmd lint"
glossary/index.hmd:11:3: warning[HMD001] [[idempotency]] does not resolve to a page
notes.hmd:1:5: error[HMD002] [[tokens]] matches 2 pages; qualify it (candidates: shared/tokens.hmd, specs/auth/tokens.hmd)

1 error(s), 1 warning(s)
```

</div>

</div>
</div>
</div>
</section>

<section class="hmd-band hmd-band--cta" markdown>

## Start { .hmd-section }

<div class="hmd-steps" markdown>

<div markdown>
### In the editor

The VS Code extension previews a card as you type and runs its cells.

```sh
ext install hypermarkdown.hmd
```
</div>

<div markdown>
### On the command line

`hmd` checks every link and embed in a tree of cards.

```sh
pip install HyperMarkDown
hmd init
hmd lint
```
</div>

</div>

<p class="hmd-fineprint" markdown>What each install gives you is the [Quick start](tools/index.md). The language is before 1.0 and still changes; released versions are on the [Roadmap](public/roadmap.md). Code is MIT, documentation and specifications are CC BY 4.0.</p>

</section>

<section class="hmd-band hmd-prose" markdown>

!!! tip "Want to see it in action?"

    - *Tools for HyperMarkDown*: the [Quick start](tools/index.md) is two
      installs — the VS Code-compatible editor extension, then the `hmd` command — and what each one gets you.
        - *Querying it*: [HQL](https://hql-lang.org/) is a typed query language over a vault of
      cards, JSON, YAML, and records. A separate project with its own
      documentation.
    - *How to write HyperMarkDown*: [The HMD Tutorial](wiki/hmd-tutorial.hmd) is the whole language in one go — every construct, with its source shown beside what it renders.

## TL;DR

```d2
direction: down

classes: {
  defined: {
    style: {
      fill: "#ffe9b0"
      stroke: "#d98f00"
      stroke-width: 2
    }
  }
  assumed: {
    style: {
      fill: "#fff7e3"
      stroke: "#d98f00"
      stroke-width: 2
    }
  }
  inherited: {
    style: {
      fill: "#f2f3f5"
      stroke: "#8b9199"
      stroke-width: 2
    }
  }
}

title: "Three layers stack in one file" {
  near: top-center
  shape: text
  style: {
    font-size: 26
    bold: true
  }
}

card: "notes.hmd" {
  grid-rows: 3
  grid-gap: 0
  style: {
    fill: transparent
    stroke: "#8b9199"
  }

  hyper: "Hyper layer — defined by HyperMarkDown\n[[card]] · [[card#Section]] · [[card#^block]] · ![[embed]] · frontmatter" {
    class: defined
  }
  rich: "Rich layer — borrowed from the ecosystem, and assumed rather than optional\ntables · task lists · footnotes · callouts · TeX · D2 diagrams" {
    class: assumed
  }
  commonmark: "CommonMark — inherited whole, nothing redefined\nheadings · lists · emphasis · links · fenced code" {
    class: inherited
  }
}

note: "The two upper layers are what HyperMarkDown adds, and a specification is what fixes\nthem. The base is left untouched, which is why any .md file is already a valid card." {
  near: bottom-center
  shape: text
  style.font-size: 15
}
```

* **A syntactic superset of CommonMark.** Rename a `.md` file to `.hmd` and it
  remains valid. HMD preserves CommonMark constructs while assigning added
  meaning to HMD syntax such as wikilinks and frontmatter.

* **Names, not paths.** `[[tokens]]` is looked up beside the card and then upward
  through its parent folders. Multiple autodiscovery matches are an error;
  explicitly ordered import paths use declaration precedence.

* **Documents made of documents.** `![[glossary/token#^definition]]` splices one
  named block into another page. Write a definition once and embed it everywhere
  it is needed.

* **Rich content is assumed, not optional.** TeX mathematics, D2 diagrams,
  callouts, footnotes, task lists, and tables are part of what a card may carry.
  A diagram is text in the file and a diff you can read, and it degrades to its
  own labelled source rather than to a blank space.

* **The specification is the artifact.** The Python CLI, the MkDocs plugin, and
  the VS Code extension are implementations around it; they conform to it rather
  than define it.

* **What ships today is not the whole of it.** The resolver, linter, embed
    expander, renderer, and MkDocs plugin are released and in use. [HQL](https://hql-lang.org/),
  the query language, is released as a separate project at major version zero.
  Namespaces beyond one tree are specified in outline and unbuilt; where it is
  all going is the [Roadmap](public/roadmap.md).

## Language

Three layers stack in one file. At the base, **CommonMark**, inherited whole —
nothing redefined and nothing taken away, which is why a `.md` file is already
a valid card. Above it a **rich layer** — tables, footnotes, task lists,
callouts, TeX mathematics, D2 diagrams — taken from the wider Markdown
ecosystem rather than invented here, and assumed present rather than optional.
And the **hyper layer** — arguably the most innovative part, and the reason the
format exists at all: a small set of constructs that are all variations on one
idea, *naming another document or a part of one*. Those upper two layers are
what HyperMarkDown adds, and a specification is what fixes them, not
convention.

```markdown
See [[tokens]] for the format, or pull one block in whole:

![[glossary/token#^definition]]
```

A card may open with YAML frontmatter, where four keys mean something to the
toolchain — `tags`, `use`, `import`, `nav` — and every other key belongs to the
author. The whole language fits on one page and can be learned in one sitting:
the [HMD Tutorial](wiki/hmd-tutorial.hmd). What that page teaches, the
[HMD Language Specification](wiki/hmd-lang-spec.hmd) states normatively.

## Features

Wiki links to documents, headings, and named blocks; transclusion of any of
them; filesystem-shaped modules with explicit imports; TeX mathematics, D2
diagrams, callouts, collapsible sections, footnotes, tables, and the GitHub-
flavoured Markdown baseline. [HQL](https://hql-lang.org/), a statically typed query and data
transformation language, is a separate project with its own documentation. It
queries a vault's cards, frontmatter, and links, and also JSON, YAML, and
records, with lexical and semantic search and graph traversal. Inside a card
it runs as cells: fences marked `hql#eval`, whose output is written into the
page, or `hql#query`, which compute a value for other cells. A plain `hql` fence is a listing and never runs. What
is planned around cells is in the [Roadmap](public/roadmap.md).

What a page can carry, shown working rather than described, is
[Features](public/features.md). How a bare name becomes a page — the spine walk,
imports, autodiscovery ambiguity, and the module/namespace distinction — is
[Namespaces](public/namespaces.md).

## Tools

`hmd` lints a tree, renders a card to markdown or HTML, and dumps the resolved
graph. A missing target is a warning, because writing forward is how a wiki
grows. Malformed references and multiple autodiscovery matches are errors;
ordered wildcard imports resolve by declaration order and report shadowing.

Installing rather than reading: the editor extension, the package, the query
language, and what each one gets you is the [Quick start](tools/index.md).

Three of them live here, one directory each under `tools/` in the repository,
each carrying its own version, README, and changelog, and a fourth is a sibling
repository:

* **[`hmd`](https://github.com/ewiger/hypermarkdown/tree/main/tools/hmd)** —
  the Python implementation, published to PyPI as
  [`hypermarkdown`](https://pypi.org/project/hypermarkdown/): the CLI
  (`lint`, `render`, `graph`), the library beneath it, and the MkDocs plugin
  that builds this site. Canonical — where two implementations disagree, this
  one defines the answer — and it will host the language server.

* **[`hmd-ts-core`](https://github.com/ewiger/hypermarkdown/tree/main/tools/hmd-ts-core)**
  — `@hypermarkdown/core`, a second implementation of the format in
  TypeScript rather than extension code, answering to the same
  [conformance corpus](https://github.com/ewiger/hypermarkdown/tree/main/examples/conformance)
  the canonical tool does.

* **[`hmd-vsc-ext`](https://github.com/ewiger/hypermarkdown/tree/main/tools/hmd-vsc-ext)**
  — the VS Code extension: live preview that keeps the embed boundary visible,
  plus a graph of the vault, red links, and diagnostics.

* **[`hql`](https://github.com/ewiger/hql)** — the Hyper Query Language, a
  statically typed query and data transformation language, published on
  [crates.io](https://crates.io/crates/hql) and documented at
  [hql-lang.org](https://hql-lang.org/). Pipelines of `filter`, `map`, `sort`,
  `group`, lexical and semantic search, and graph traversal over a vault's
  cards, frontmatter, and links, and over JSON, YAML, and records. Inside a
  card it runs as cells; `hql render` writes their output into the page.

Those are the sources. Getting them running — the extension, then the package,
then the query language, and what each one is for — is the
[Quick start](tools/index.md).

Presentation is not part of the language. A card is plain text, so an editor,
GitHub, or a chat window already shows it. The MkDocs plugin builds a tree of
cards into a published site — this one, a hand-ordered book with a generated
wiki inside it — and the extension renders one in the editor as it is typed.
The trade-offs between them are [Presentation](public/presentation.md).

![The VS Code extension previewing a card: source on the left, rendered card on
the right, with resolved links, a table, a callout, and a d2
diagram.](assets/hmd-vsc-ext-screenshot-1.png){ .hmd-shot }

*The VS Code extension: the card's source on the left, the rendered card on the
right, updated as it is typed.*{ .hmd-caption }

## Specification

The normative text is one document, the
[HMD Language Specification](wiki/hmd-lang-spec.hmd): what a card is, what each
construct means, and what an implementation must do with it. It describes no
particular program, and no program's behaviour overrides it.

It is stated against a named baseline — CommonMark 0.31.2 — because "markdown"
names a family rather than a standard, and a superset of an unnamed dialect
specifies nothing. And it is versioned apart from the tools that implement it: a
release of `hmd` does not imply a new language version, and a language version
does not wait for one. Where two implementations disagree about something the
text leaves under-determined, the language-neutral conformance corpus decides.

The language is at 0.1. The text is drafted, and it will move before 1.0.

How it gets there is a separate formal process. A change
is argued out first as a numbered technical proposal in the style of RFCs and lightweight ADRs: a problem, the decision
taken, the alternatives rejected, and a tracker of its own. Most of them are not
about the language at all, and cover the tools and the presentation layer
instead: how a bare name is resolved on disk, what the linter reports, how a tree
of cards becomes a published site. They are working documents, kept for their
motivation and their rejected alternatives, and where one disagrees with the
specification the specification is right. The index is
[Proposals](proposals/README.md).

## Vision

Markdown became the default plain text, and never got the part HTML had on its
first day — links that mean something because they point into a knowledge graph,
and a page that is part of a web rather than a file in a folder. Almost none of
the ideas here are new; what is being attempted is a coherent specification of
them.

The longer argument is that this should not stop at one repository: independently
authored and independently served HyperMarkDown, named across the gap, read from
the same source by humans, tools, and AI. That argument, and how much of it is
still unbuilt, is [Vision](public/vision.md).

## Where this is going

The tools are released and installable, and the specification is at 0.1 and
still moving. Which version of what is out, what the writing still owes the
code, and the large features being aimed at next — semantic search over a
collection of cards through [HQL](https://hql-lang.org/), and names
that cross repositories — are the [Roadmap](public/roadmap.md).

The living example is [the wiki](wiki/README.md), generated from `.hmd` cards in
this repository.

</section>
