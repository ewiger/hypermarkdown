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
genuinely new. It is all variations on one idea — *linking to another card, or to
a part of one*:

| Written | Means |
| --- | --- |
| `[[card]]` | a wikilink to a card, with `card` as its address |
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

## Where a wikilink points

`[[…]]` is a wikilink, and the text between the brackets is the address of a
card. Each card is stored in one file, so the address identifies a file. You
can write the address in two ways.

**As a path.** An address that starts with `/`, `./`, or `../` gives the
location of the file. `[[/reference/tokens]]` starts at the namespace root,
and `[[./tokens]]` starts in the directory of the card that contains the
link. The resolver opens the file at that location and does not search.

**As a file name.** Any other address, such as `[[tokens]]` or
`[[reference/tokens]]`, does not give the full location. The resolver
searches for a matching file, such as `tokens.hmd`, in this order:

1. the imports of the card that contains the link;
2. the directory of that card, then each parent directory up to the namespace
   root;
3. the directories that card imports with `*`, in the order it declares them;
4. the whole namespace.

The first match wins, so a file in the same directory takes precedence over a
file with the same name elsewhere. If two directories imported with `*` both
contain a matching file, the first one wins and the linter reports a shadowing
warning. If only the last step finds a match and it finds several files, the
wikilink is ambiguous, and you choose one by writing a longer address such as
`[[guides/tokens]]`. The complete rules are in [Namespaces](namespaces.hmd).

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

A file is only treated as a card if it is inside a vault. A vault is the
directory where your cards are stored. It is marked by a `.hmd/` directory, in
the same way that `.git/` marks a Git repository, and every file below it
belongs to the vault. `.hmd/` holds the vault's configuration and the data that
tools such as HQL keep about the vault, for example a search index. So the
first step is to run `hmd init` at the top of your documentation. An empty
`.hmd/` directory is enough.

After that, you can adopt the format one file at a time. Rename a `.md` file to
`.hmd`, check any text that now has a HyperMarkDown meaning, add one link, and
run `hmd lint`. The other files can stay plain Markdown.

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
