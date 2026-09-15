# HyperMarkDown { .hmd-hero }

HyperMarkDown (`.hmd`) is ordinary Markdown plus rich visuals plus wiki links
into a knowledge graph. Every `.md` file is already valid `.hmd`.

!!! tip "Want to see it in action?"

    - *Tools for HyperMarkDown*: the [Quick start](tools/index.md) is two
      installs — the VS Code-compatible editor extension, then the `hmd` command — and what each one gets you.
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
  expander, renderer, and MkDocs plugin are released and in use. Queries over
  the document graph and namespaces beyond one tree are specified in outline and
  unbuilt; where they are going is the [Roadmap](public/roadmap.md).

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
flavoured Markdown baseline. HQL, a query language over the document graph, is
reserved, and the grammar is not fixed — what it is wanted for is the
[Roadmap](public/roadmap.md).

What a page can carry, shown working rather than described, is
[Features](public/features.md). How a bare name becomes a page — the spine walk,
imports, autodiscovery ambiguity, and the module/namespace distinction — is
[Namespaces](public/namespaces.md).

## Tools

`hmd` lints a tree, renders a card to markdown or HTML, and dumps the resolved
graph. A missing target is a warning, because writing forward is how a wiki
grows. Malformed references and multiple autodiscovery matches are errors;
ordered wildcard imports resolve by declaration order and report shadowing.

Installing rather than reading: the editor extension, the package, and what each
one gets you is the [Quick start](tools/index.md).

There are three of them, one directory each under `tools/` in the repository,
each carrying its own version, README, and changelog:

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

Those are the sources. Getting them running — the extension, then the package,
and what each one is for — is the [Quick start](tools/index.md).

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
is argued out first as a numbered technical proposal — `HMD-0001`, `HMD-0002`,
and so on — in the style of RFCs and lightweight ADRs: a problem, the decision
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
collection of cards, and the query language underneath it — are the
[Roadmap](public/roadmap.md).

The living example is [the wiki](wiki/README.md), generated from `.hmd` cards in
this repository.
