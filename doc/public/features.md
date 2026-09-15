# Features

## TL;DR

* **Markdown compatible.** Standard Markdown is valid HyperMarkDown, including
  the GitHub-flavoured parts: fenced code, tables, task lists, strikethrough.

* **Wiki links.** Link to a document, a heading, or a single block:
  `[[page]]`, `[[page#Section]]`, `[[page#^block]]`. Alias with
  `[[page|display text]]`.

* **Transclusion.** Embed any of those with a leading `!`: `![[page]]`,
  `![[page#Section]]`, `![[page#^block]]`.

* **Modules and namespaces.** Folders are modules. A bare name is searched
  beside the card, then upward through its parents. An explicit path
  (`[[/shared/tokens]]`) or a frontmatter import crosses module boundaries and
  makes the dependency visible. Two matches is an error, not a guess.

* **Metadata.** YAML frontmatter carries tags, imports, navigation hints, and
  anything your own tooling needs.

* **Rich content.** TeX mathematics, D2 diagrams, callouts, collapsible
  sections, footnotes, heading permalinks, tables, code blocks.

* **Validation.** `hmd lint` checks a tree. Unwritten pages are warnings;
  malformed references and ambiguous names are errors.

* **Tooling.** A CLI, a MkDocs plugin, and a VS Code extension, all released.

* **HQL** *(planned)* — a query language over cards, metadata, and the links
  between them. See the [Roadmap](roadmap.md).

## A superset of CommonMark

Plain Markdown is text. No diagrams, no mathematics, no way to write something
once and use it in ten places, and no way to find out a link is broken before
your reader does.

Markdown has no shortage of dialects. Each added whatever its own tool needed,
and almost none were written down. HyperMarkDown is a specification instead,
defined as a syntactic extension of [CommonMark](https://commonmark.org/) — the
most widely implemented Markdown, and the most carefully specified. Every
CommonMark document stays valid. Text that CommonMark treats as literal can
carry HyperMarkDown meaning, such as wikilinks or frontmatter.

Everything on this page is plain text in a file. Most of it is rendering here
right now.

## Write a name, get a link

You do not write a path:

```markdown
Rotation is explained in [[tokens]].
```

The name is resolved for you: beside the card you are writing, then the folder
above, then above that. Nearby wins over far away, so a folder can keep its own
vocabulary. `[[logging]]` in the billing folder means *your* logging card.

Alias it, or point inside it:

```markdown
The [[md-hmd-interop|comparison with TypeScript]] makes the case.
See [[tokens#Rotation]] for the window.
```

A link to a page you have not written renders as a red link and reports a
warning. Forward references become a to-do list rather than a build failure.

## Say it once, use it everywhere

A leading `!` brings the content to you:

```markdown
![[glossary/token]]              the whole card
![[glossary/token#Rotation]]     one section
![[glossary/token#^definition]]  one named block
```

Tag any paragraph with a caret and a name, and it becomes addressable on its
own:

```markdown
A token is valid for exactly one rotation window. ^definition
```

Write the definition once. Embed it in the API reference, the onboarding page,
and the incident runbook. Fix it in one place.

!!! tip "This page shows the syntax; the wiki runs it"

    A chapter like this one is ordinary Markdown, so the constructs above stay
    quoted rather than live. The [wiki](../wiki/README.md) section of this site
    is the real thing — every card there is written in the format and resolved
    by it.

## Diagrams

Three backticks, `d2`, and what points at what:

```d2
direction: right

client -> edge: credentials
edge -> auth: verify
auth -> edge: token
edge -> client: token + rotation window
```

The diagram is text in the file, in version control, in a diff you can read.
Where no `d2` renderer is available it degrades to its own labelled source, not
to a blank space or a failed build.

## Mathematics

TeX between dollar signs, inline: a retry after attempt $n$ is delayed by $t_n$,
bounded by $t_{max}$. Between double dollars, as a display block:

$$
t_n = U\bigl(0,\; \min(t_{max},\; b \cdot 2^n)\bigr)
$$

That is a real backoff policy: jitter across the whole interval rather than a
fixed doubling, so clients that failed together do not retry together.

## Callouts

Not every sentence is body text. Some of it is a warning, an aside, or a
justification the reader does not need on a first pass:

!!! note "Names are structural"

    A folder is a module, and a tree of them is a namespace. A tag is neither.
    `[[…]]` answers *where a page lives*; a tag answers *what it is about*.

!!! warning "Autodiscovery does not rank matches"

    If autodiscovery finds two pages, the build asks you to qualify the link.
    Ordered wildcard imports use declaration precedence and report shadowing
    instead.

??? tip "Collapsed until someone wants it"

    A callout opened with `???` starts folded, so the long version can sit on
    the page without being in the way.

## And the rest

Tables, task lists, footnotes[^1], ~~strikethrough~~, and a permalink on every
heading:

- [x] Write the definition once
- [ ] Copy it into four pages and forget one

| Written | Renders as |
| --- | --- |
| `~~text~~` | ~~text~~ |
| `- [x] item` | a checked box |
| `$e^{i\pi} + 1 = 0$` | $e^{i\pi} + 1 = 0$ |

## Errors you can act on

Autodiscovery does not rank competing matches. Two matches means you qualify the
reference:

```text
specs/auth/login.hmd:14:5: error[HMD002] [[tokens]] matches 2 pages; qualify it
  (candidates: shared/tokens.hmd, specs/auth/tokens.hmd)
```

`hmd lint` reads the whole tree and reports what it could not resolve: file,
line, rule, and an exit code. The distinction is a compiler's. A page you have
not written yet is a warning. A malformed link or an ambiguous name is an error.
Your prose is left alone.

## Markdown is JavaScript. HyperMarkDown is TypeScript.

A superset that adds structure a machine can check, erases back down to what it
extends, and is adopted one file at a time.

```markdown
<!-- notes.md — valid Markdown, and already valid HyperMarkDown -->
Tokens rotate hourly. See [the token format](../shared/tokens.md).
```

```markdown
<!-- notes.hmd — the same file, with the graph filled in -->
Tokens rotate hourly. See [[tokens]], and here is the rule itself:

![[tokens#^rotation-rule]]
```

Renaming the file changes nothing about its validity. The second version opts
into checked wikilink semantics. `hmd lint` is `tsc --noEmit`, rendering to flat
Markdown is compilation, and adopting it file by file is why `allowJs` mattered:
nobody rewrites a wiki by hand. The full argument is
[MD ↔ HMD interoperability](../wiki/md-hmd-interop.hmd).

## Go deeper

- [The HMD Tutorial](../wiki/hmd-tutorial.hmd) — every construct, in order, in
  one sitting.
- [The HMD Language Specification](../wiki/hmd-lang-spec.hmd) — the normative
  text: grammar, resolution, diagnostics.
- [The feature list](../wiki/hmd-feature-list.hmd) — the full inventory,
  including what was deferred or rejected.
- [Presentation](presentation.md) — what happens to a card afterwards: the
  formats it converts to and the viewers that show it.
- [Roadmap](roadmap.md) — versions, and what is being built next.

[^1]: Footnotes, callouts, and the rest of this page's rich content come from
    the wider Markdown world rather than from HyperMarkDown. The format assumes
    them and renders them as first-class content instead of reinventing them.
