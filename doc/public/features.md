# Features

## TL;DR

* **Markdown compatible** — standard Markdown remains valid HyperMarkDown, including commonly used GitHub-flavoured features such as fenced code, tables, task lists, and strikethrough.

* **Wiki links** — link to documents, headings, and individual blocks: `[[page]]`, `[[page#Section]]`, `[[page#^block]]`, with optional aliases such as `[[page|display text]]`.

* **Transclusion** — embed complete documents, sections, or named blocks using the same addressing model: `![[page]]`, `![[page#Section]]`, `![[page#^block]]`.

* **Modules and namespaces** — the filesystem provides the module structure. A bare name is searched beside the card and then upward through its parent folders; that spine never searches sideways, but autodiscovery may resolve a unique match elsewhere when the spine finds nothing. An explicit path such as `[[/shared/tokens]]` or a frontmatter import crosses module boundaries without global discovery and makes the dependency visible. Multiple autodiscovery matches are an error. The cross-tree address form `namespace:path/to/document` is reserved and specified in outline only *(proposed — [HMD-0004](../proposals/HMD-0004/README.md))*.

* **Metadata** — YAML frontmatter provides tags, imports, feature toggles, navigation hints, and application-specific metadata.

* **Rich technical content** — TeX mathematics, D2 diagrams, callouts, collapsible sections, footnotes, heading permalinks, tables, code blocks, and other established Markdown extensions.

* **Validation and tooling** — `hmd` lints a document tree, renders a card to markdown or HTML, and dumps the resolved link graph. A reference to a document that does not exist yet is a warning; malformed references and ambiguous autodiscovery are errors, while ordered import paths use declaration precedence. MkDocs integration and the VS Code extension are both released.

* **HQL — Hyper Query Language** *(proposed)* — a query layer for deriving content and views from the document graph: backlinks, tags, relationships, collections, and other structured queries over HyperMarkDown knowledge.


## A superset of CommonMark

Plain markdown is just text. A heading, a list, a bit of emphasis, and a link
you typed by hand and now maintain by hand. No diagrams. No mathematics. No way
to say a thing once and use it in ten places. No way to be wrong about a link
and find out before your reader does.

Markdown has no shortage of dialects — each one adding whatever its own tool needed, and almost none of them written down. HyperMarkDown is a specification instead, built as a syntactic extension of [CommonMark](https://commonmark.org/), which is the most widely implemented markdown and the most carefully specified. Every CommonMark document remains syntactically valid, while text that CommonMark treats as literal can gain HyperMarkDown semantics such as wikilinks or frontmatter.

> CommonMark specification: https://commonmark.org/

HyperMarkDown starts exactly there and keeps going. Everything on this page was
typed as plain text into a file you can open in any editor — and most of it is
rendering on this page right now.

## Write a name, get a link

You do not write a path. You do not count `../` hops. You write the name of the
card you mean:

```markdown
Rotation is explained in [[tokens]].
```

The name is found for you: beside the card you are writing, then in the folder
above it, then above that. A card nearby wins over a card far away, which is
what lets a folder keep its own local vocabulary — `[[logging]]` in the billing
folder means *your* logging card, not somebody else's.

Say it differently when the sentence needs it, or point inside a card:

```markdown
The [[md-hmd-interop|comparison with TypeScript]] makes the case.
See [[tokens#Rotation]] for the window.
```

And a link to a page that does not exist yet is not a failure. It renders as a
red link and gets reported as a warning — which turns forward references into a
to-do list instead of a build break. Writing forward is how a wiki grows.

## Say it once, use it everywhere

Put a `!` in front of any link and the content comes to you instead of you going
to it:

```markdown
![[glossary/token]]              the whole card
![[glossary/token#Rotation]]     one section of it
![[glossary/token#^definition]]  one named block
```

That last one is the sharp tool. Tag any single paragraph with a caret and a
name, and that paragraph is now addressable on its own:

```markdown
A token is valid for exactly one rotation window. ^definition
```

Write the definition in one place; embed it in the API reference, the onboarding
page, and the incident runbook. Correct it once and all three are correct. Cards
stop being pages and start being parts.

!!! tip "This page shows the syntax; the wiki runs it"

    A book chapter like this one is ordinary markdown, so the constructs above
    stay quoted rather than live. The [wiki](../wiki/README.md) section of this
    site is the real thing — every card there is written in the format and
    resolved by it, links and embeds and all.

## A page that draws

Three backticks, `d2` as the language, and a description of what points at what:

```d2
direction: right

client -> edge: credentials
edge -> auth: verify
auth -> edge: token
edge -> client: token + rotation window
```

You wrote text. You got a picture. It lives in the file, in version control, in
a diff you can read — not in a binary exported from a drawing tool that somebody
has to still have a licence for. And when the renderer has no `d2` available, the
diagram degrades to its own labelled source rather than to a blank space or a
failed build.

## A page that does mathematics

TeX between dollar signs, inline: a retry after attempt $n$ is delayed by $t_n$,
bounded by $t_{max}$. Or as a display block, between double dollars:

$$
t_n = U\bigl(0,\; \min(t_{max},\; b \cdot 2^n)\bigr)
$$

That is a real backoff policy — jitter across the whole interval rather than a
fixed doubling, so that clients which failed together do not retry together. Try
saying it in a code block.

## A page that talks to the reader

Not every sentence is body text. Some of it is a warning, an aside, or the long
justification a reader does not need on the first pass:

!!! note "Names are structural"

    A folder is a module, and a tree of them is a namespace. A tag is neither.
    `[[…]]` answers *where a page lives*; a tag answers *what it is about*.
    Collapsing the two axes breaks both.

!!! warning "Autodiscovery does not rank matches"

    If autodiscovery finds two pages, the build asks you to qualify the link.
    Explicitly ordered wildcard imports use declaration precedence and report a
    shadowing warning instead.

??? tip "Collapsed until someone wants it"

    A callout opened with `???` instead of `!!!` starts folded, so the
    long-winded version can sit on the page without being in the way — like
    this one.

## And the rest, for free

Tables, task lists, footnotes[^1], ~~strikethrough~~, and a permalink on every
heading:

- [x] Write the definition once
- [ ] Copy it into four pages and forget one

| Written | Renders as |
| --- | --- |
| `~~text~~` | ~~text~~ |
| `- [x] item` | a checked box |
| `$e^{i\pi} + 1 = 0$` | $e^{i\pi} + 1 = 0$ |

## Find ambiguous autodiscovery immediately

Autodiscovery does not rank competing matches. If it finds more than one, the
toolchain requires a qualified reference:

```text
specs/auth/login.hmd:14:5: error[HMD002] [[tokens]] matches 2 pages; qualify it
  (candidates: shared/tokens.hmd, specs/auth/tokens.hmd)
```

`hmd lint` reads the whole tree and reports what it could not resolve — file,
line, rule ID, exit code your CI understands. The distinction it draws is a
compiler's: a page you have not written yet is a warning; malformed links and
multiple autodiscovery matches are errors. Ordered wildcard imports use
declaration precedence and report shadowing as a warning. Everything else about
your prose is left entirely alone.

## Markdown is JavaScript. HyperMarkDown is TypeScript.

That is the shortest way to say what this is. A superset that adds structure a
machine can check, erases back down to the thing it extends, and is adopted one
file at a time.

```markdown
<!-- notes.md — valid markdown, and already valid HyperMarkDown -->
Tokens rotate hourly. See [the token format](../shared/tokens.md).
```

```markdown
<!-- notes.hmd — the same file, with the graph filled in -->
Tokens rotate hourly. See [[tokens]], and here is the rule itself:

![[tokens#^rotation-rule]]
```

The Markdown remains syntactically valid when renamed; the second version opts
into HMD's checked wikilink semantics. `hmd lint` is `tsc --noEmit`. Rendering
back down to flat markdown is compilation. And "adopt it file by file" is the
same reason `allowJs` mattered: nobody rewrites a wiki by hand. The argument in
full is [MD ↔ HMD interoperability](../wiki/md-hmd-interop.hmd).

## Go deeper

- [The HMD Tutorial](../wiki/hmd-tutorial.hmd) teaches every construct start to
  finish. Read it once and you can write the format.
- [The HMD Language Specification](../wiki/hmd-lang-spec.hmd) is the normative
  text behind it: the grammar, the resolution algorithm, and the diagnostics,
  stated exactly.
- [The feature list](../wiki/hmd-feature-list.hmd) is the exhaustive inventory —
  every feature, where the idea came from, and what is deferred, planned, or
  rejected.
- [Presentation](presentation.md) is what happens to a card afterwards: the
  formats it converts into and the viewers that show it.

!!! tip "Read next"

    [The HMD Tutorial](../wiki/hmd-tutorial.hmd) — everything shown working on
    this page, taught in order, in one sitting.

[^1]: Like this one. Footnotes, callouts, and everything else on this page come
    from the wider markdown world rather than from HyperMarkDown itself — the
    format assumes them and renders them as first-class content instead of
    reinventing them.
