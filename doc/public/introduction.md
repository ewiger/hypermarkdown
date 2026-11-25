# Introduction

A `.hmd` file is a Markdown file that has learned to do more. Reading one
requires nothing — any editor, any renderer, GitHub's file view all show you a
sensible page. Writing one is a single page of new syntax on top of what you
already know. And underneath both sits a toolchain that treats your writing the
way a compiler treats a program: names resolve, references are checked, and
multiple autodiscovery matches are reported rather than ranked.

This chapter is the format at a glance. Every layer appears here briefly, with
a pointer to where it is treated properly; none is specified here.

## Three layers of syntax

**The Markdown you know.** Paragraphs, emphasis, headings, lists, blockquotes,
fenced code. These CommonMark constructs remain available, and a fenced block
stays literal all the way down, which is the escape hatch for showing syntax
instead of invoking it. Byte sequences recognized as HMD syntax — such as
wikilinks and frontmatter — acquire HMD semantics.

**The rich layer.** Tables, footnotes, task lists, callouts, TeX mathematics,
D2 diagrams. None of these are original Markdown, and none are
HyperMarkDown's own — they are the conventional tier the wider Markdown world
settled on, and the format assumes them present and renders them as
first-class content:

!!! note "This callout is real"

    So is $e^{i\pi} + 1 = 0$ beside it. What a page can carry, shown working,
    is [Features](features.md).

**The hyper layer.** What HyperMarkDown itself adds, and the part that is
genuinely new. It is all variations on one idea — *naming another card, or a
part of one*:

| Written | Means |
| --- | --- |
| `[[card]]` | a link to a card, resolved by name |
| <code>[[card&#124;words]]</code> | the same link, showing different words |
| `[[card#Heading]]` | a link to a section inside that card |
| `text ^name` | a block anchor, naming one block |
| `[[card#^name]]` | a link to that named block |
| `![[…]]` | an embed — any of the above, spliced in |

The surface HyperMarkDown defines is small enough to specify and small enough
that the resolver behind it stays checkable. The
richness comes from everywhere else on the page, bought from the Markdown
ecosystem rather than rebuilt, which is why the feature set keeps growing
while the table above does not have to.

## Names, and how they are found

`[[card]]` is a name, not a path. A folder is a *module*, the card beside you
wins over a card far away, and multiple autodiscovery matches require a
qualified reference. Ordered wildcard imports instead use declaration
precedence and report a shadowing warning. The complete rules are in
[Namespaces](namespaces.hmd).

## Frontmatter

A card may open with a YAML block. Four keys mean something to the toolchain —
`tags` for what a card is about, `use` for per-subtree feature toggles,
`import` for explicit name bindings, `nav` for its place in a published site —
including `nav.visibility`, which decides whether it is published at all.
Every other key is yours, and nothing will inspect it.

## The check

`hmd lint` reads the tree and reports what it could not resolve — file, line,
rule ID. The distinction it draws is a compiler's: a link to a card that does
not exist yet is a **warning**, because writing forward is how a wiki grows; a
malformed link or multiple autodiscovery matches are **errors**. Explicitly
ordered wildcard imports use declaration precedence and report shadowing as a
warning. Everything else about your prose is left alone.

## Adopting it

A `.md` file remains syntactically valid after it is renamed to `.hmd`, so
adoption can be gradual: rename one file, review any text that now has HMD
semantics, add one link, and run `hmd lint`. Nothing forces the rest of the tree
to follow.

## Where the full picture lives

- [The HyperMarkDown Language Specification](../wiki/hmd-lang-spec.hmd) is the normative
  text behind it: the grammar, the resolution algorithm, and the diagnostics,
  stated exactly.
- [Features](features.md) lists what the language supports, with a working
  example of each.

!!! tip "Read next"

    [The HMD Tutorial](../wiki/hmd-tutorial.hmd) — every construct sketched on
    this page, taught properly and in order. Read it once and you can write the
    format.
