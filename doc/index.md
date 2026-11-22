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

<section class="hmd-band" markdown>

## One file, three layers { .hmd-section }

<p class="hmd-lede" markdown>A card is one `.hmd` file. CommonMark is the base and nothing in it is redefined. HyperMarkDown adds two layers on top and specifies both.</p>

<div class="hmd-layers">
<p class="hmd-layers__file">notes.hmd</p>
<div class="hmd-layer hmd-layer--hyper">
<div class="hmd-layer__head">
<p class="hmd-label">Hyper layer</p>
<p class="hmd-layer__note">defined by HyperMarkDown: naming another card, or a part of one</p>
</div>
<ul class="hmd-chips">
<li><code>&#91;&#91;card&#93;&#93;</code></li>
<li><code>&#91;&#91;card#Section&#93;&#93;</code></li>
<li><code>&#91;&#91;card#^block&#93;&#93;</code></li>
<li><code>!&#91;&#91;embed&#93;&#93;</code></li>
<li><code>^block</code></li>
<li>frontmatter</li>
</ul>
</div>
<div class="hmd-layer hmd-layer--rich">
<div class="hmd-layer__head">
<p class="hmd-label">Rich layer</p>
<p class="hmd-layer__note">taken from the Markdown ecosystem, and always present</p>
</div>
<ul class="hmd-chips">
<li>tables</li>
<li>task lists</li>
<li>footnotes</li>
<li>callouts</li>
<li>collapsible sections</li>
<li>TeX</li>
<li>D2 diagrams</li>
</ul>
</div>
<div class="hmd-layer hmd-layer--base">
<div class="hmd-layer__head">
<p class="hmd-label">CommonMark</p>
<p class="hmd-layer__note">inherited whole</p>
</div>
<ul class="hmd-chips">
<li>headings</li>
<li>lists</li>
<li>emphasis</li>
<li>links</li>
<li>images</li>
<li>block quotes</li>
<li>fenced code</li>
</ul>
</div>
</div>

<div class="hmd-pillars" markdown>

<div markdown>
### Markdown stays valid

Every CommonMark document is a syntactically valid card. Two things gain a
meaning: `[[…]]` is a link, and a `---` block at the top is frontmatter.
</div>

<div markdown>
### Markdown files are cards

A `.md` file in the tree is a target for links and embeds without being
renamed. Rename it to `.hmd` when its own links should be checked.
</div>

<div markdown>
### Specified, not conventional

The [Language Specification](wiki/hmd-lang-spec.hmd) states the grammar, the
resolution rules and the diagnostics against CommonMark 0.31.2. The tools
conform to it.
</div>

</div>
</section>

<section class="hmd-band hmd-band--alt" markdown>

## Links name cards { .hmd-section }

<p class="hmd-lede" markdown>`[[tokens]]` is a name, not a path. The cards and the links between them are a graph, and `hmd lint` checks every edge of it.</p>

<div class="hmd-split" markdown>
<div class="hmd-graph">
<svg viewBox="0 0 606 300" role="img" aria-labelledby="hmd-graph-title">
<title id="hmd-graph-title">Part of the example vault's graph: six cards joined by links and embeds, and one link to a card that is not written yet.</title>
<defs>
<marker id="hmd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="hmd-graph__head" d="M0 0L10 5L0 10z"/></marker>
<marker id="hmd-arrow-embed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path class="hmd-graph__head hmd-graph__head--embed" d="M0 0L10 5L0 10z"/></marker>
<marker id="hmd-arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="hmd-graph__head hmd-graph__head--red" d="M0 0L10 5L0 10z"/></marker>
</defs>
<g class="hmd-graph__edges">
<path class="hmd-graph__edge" marker-end="url(#hmd-arrow)" d="M108 148L172 104"/>
<path class="hmd-graph__edge hmd-graph__edge--embed" marker-end="url(#hmd-arrow-embed)" d="M126 170H321"/>
<path class="hmd-graph__edge" marker-end="url(#hmd-arrow)" d="M270 98L338 150"/>
<path class="hmd-graph__edge" marker-end="url(#hmd-arrow)" d="M271 74L322 54"/>
<path class="hmd-graph__edge hmd-graph__edge--embed" marker-end="url(#hmd-arrow-embed)" d="M271 86C380 96 440 110 500 148"/>
<path class="hmd-graph__edge" marker-end="url(#hmd-arrow)" d="M431 170H479"/>
<path class="hmd-graph__edge" marker-end="url(#hmd-arrow)" d="M377 150V63"/>
<path class="hmd-graph__edge" marker-end="url(#hmd-arrow)" d="M535 240V193"/>
<path class="hmd-graph__edge hmd-graph__edge--red" marker-end="url(#hmd-arrow-red)" d="M481 260H434"/>
</g>
<g class="hmd-graph__labels">
<text x="120" y="118" text-anchor="end">[[login]]</text>
<text x="452" y="104">![[token#^definition]]</text>
<text x="457" y="296" text-anchor="middle">[[idempotency]]</text>
</g>
<g class="hmd-graph__node"><rect x="16" y="150" width="108" height="40" rx="4"/><text x="70" y="166" class="hmd-graph__dir">specs/auth/</text><text x="70" y="181">tokens</text></g>
<g class="hmd-graph__node"><rect x="161" y="62" width="108" height="40" rx="4"/><text x="215" y="78" class="hmd-graph__dir">specs/auth/</text><text x="215" y="93">login</text></g>
<g class="hmd-graph__node"><rect x="323" y="150" width="108" height="40" rx="4"/><text x="377" y="166" class="hmd-graph__dir">shared/</text><text x="377" y="181">tokens</text></g>
<g class="hmd-graph__node"><rect x="323" y="22" width="108" height="40" rx="4"/><text x="377" y="38" class="hmd-graph__dir">shared/</text><text x="377" y="53">retry-policy</text></g>
<g class="hmd-graph__node"><rect x="481" y="150" width="108" height="40" rx="4"/><text x="535" y="166" class="hmd-graph__dir">glossary/</text><text x="535" y="181">token</text></g>
<g class="hmd-graph__node"><rect x="481" y="240" width="108" height="40" rx="4"/><text x="535" y="256" class="hmd-graph__dir">glossary/</text><text x="535" y="271">index</text></g>
<g class="hmd-graph__node hmd-graph__node--red"><rect x="323" y="240" width="108" height="40" rx="4"/><text x="377" y="256" class="hmd-graph__dir">not written yet</text><text x="377" y="271">idempotency</text></g>
</svg>
<ul class="hmd-legend">
<li><span class="hmd-legend__mark"></span>link</li>
<li><span class="hmd-legend__mark hmd-legend__mark--embed"></span>embed</li>
<li><span class="hmd-legend__mark hmd-legend__mark--red"></span>red link, a warning</li>
</ul>
</div>
<div class="hmd-forms">
<p class="hmd-label">What you write</p>
<dl>
<dt><code>&#91;&#91;card&#93;&#93;</code></dt><dd>a link to a card, found by name</dd>
<dt><code>&#91;&#91;card&#124;words&#93;&#93;</code></dt><dd>the same link, showing other words</dd>
<dt><code>&#91;&#91;card#Heading&#93;&#93;</code></dt><dd>a link to a section of that card</dd>
<dt><code>text ^name</code></dt><dd>a block anchor: a name for one block</dd>
<dt><code>&#91;&#91;card#^name&#93;&#93;</code></dt><dd>a link to that block</dd>
<dt><code>!&#91;&#91;…&#93;&#93;</code></dt><dd>an embed: any of the above, placed in the page</dd>
</dl>
</div>
</div>

<p class="hmd-label hmd-label--row">How a name is found</p>

<div class="hmd-flow" aria-label="The four steps that resolve a name, in order">
<div class="hmd-flow__stage">
<p class="hmd-flow__label">1 · Named imports</p>
<p class="hmd-flow__note">a name this card imported: <code>from /shared import tokens</code></p>
</div>
<div class="hmd-flow__arrow" aria-hidden="true"></div>
<div class="hmd-flow__stage">
<p class="hmd-flow__label">2 · The spine</p>
<p class="hmd-flow__note">the card's own folder, then each parent folder up to the root</p>
</div>
<div class="hmd-flow__arrow" aria-hidden="true"></div>
<div class="hmd-flow__stage">
<p class="hmd-flow__label">3 · Imported paths</p>
<p class="hmd-flow__note">each <code>from … import *</code>, in the order written</p>
</div>
<div class="hmd-flow__arrow" aria-hidden="true"></div>
<div class="hmd-flow__stage hmd-flow__stage--accent">
<p class="hmd-flow__label">4 · Autodiscovery</p>
<p class="hmd-flow__note">one sweep of the whole tree. Two matches are an error, not a guess</p>
</div>
</div>

<p class="hmd-fineprint" markdown>The first step that finds the name wins. A name that is found nowhere is a warning, because a link can be written before its card. The full rules are in [Namespaces](public/namespaces.md).</p>

</section>

<section class="hmd-band" markdown>

## Cards made of cards { .hmd-section }

<p class="hmd-lede" markdown>Put `!` in front of a link and the target is placed in the page instead of linked. A definition is written once and embedded where it is needed.</p>

<div class="hmd-splice">
<div class="hmd-sheet">
<p class="hmd-sheet__name">glossary/token.hmd</p>
<p class="hmd-sheet__title">Token</p>
<p class="hmd-sheet__block">A bearer credential presented on every request, scoped to one subject and one audience, and valid only until it expires. <code>^definition</code></p>
<p class="hmd-sheet__rest">The block above carries the anchor <code>^definition</code>, so other cards can embed the one sentence rather than the whole page.</p>
</div>
<div class="hmd-splice__via">
<code>!&#91;&#91;token#^definition&#93;&#93;</code>
<div class="hmd-flow__arrow" aria-hidden="true"></div>
</div>
<div class="hmd-sheet">
<p class="hmd-sheet__name">specs/auth/login.hmd</p>
<p class="hmd-sheet__title">Login</p>
<p class="hmd-sheet__rest">The glossary definition, embedded by block anchor rather than restated:</p>
<div class="hmd-embed">
<p class="hmd-embed__from">glossary/token#^definition</p>
<p>A bearer credential presented on every request, scoped to one subject and one audience, and valid only until it expires.</p>
</div>
</div>
</div>

<div class="hmd-pillars" markdown>

<div markdown>
### A card, a section, or a block

`![[glossary/token]]` embeds the whole card, `![[glossary/token#Rotation]]`
one section, and `![[glossary/token#^definition]]` one named block.
</div>

<div markdown>
### Checked

An embedded card can embed others. A cycle is an error, and so is nesting
deeper than 16 levels. A missing target is reported like a missing link.
</div>

<div markdown>
### Kept or flattened

The editor preview shows an embed as an embed, with the card it came from.
`hmd render` writes one flat Markdown or HTML file with every embed expanded.
</div>

</div>
</section>

<section class="hmd-band hmd-band--alt" markdown>

## Metadata { .hmd-section }

<p class="hmd-lede" markdown>A card can open with YAML frontmatter. The tools read four keys. Every other key is yours, and a query can read it.</p>

<div class="hmd-split hmd-split--even" markdown>
<div markdown>
<p class="hmd-label">Four keys the tools read</p>

```hmd
---
tags: [area/auth, status/accepted]
use: [no_autodiscovery]
import:
  - from /shared import tokens as shared-tokens
  - from /glossary import *
nav:
  order: 10
  visibility: public
---
```

<dl class="hmd-keys">
<dt><code>tags</code></dt><dd>what the card is about. <code>/</code> separates levels</dd>
<dt><code>use</code></dt><dd>feature switches for the card or its folder</dd>
<dt><code>import</code></dt><dd>names brought in from other folders</dd>
<dt><code>nav</code></dt><dd>the card's place in a published site. A card is published only when <code>visibility</code> is <code>public</code></dd>
</dl>
</div>
<div markdown>
<p class="hmd-label">Your keys, read by a query</p>

```hmd title="books/emma.hmd"
---
title: Emma
metadata:
  author: Jane Austen
  status: todo
---
```

````hmd title="contents.hmd"
```hql#query id=todo
books | filter(c => c.metadata.status == "todo")
```

```hql#eval
todo | map(c => c.title)
```
````

<div class="hmd-out" data-label="output" markdown>

- Emma
- The Hobbit

</div>
</div>
</div>
</section>

<section class="hmd-band" markdown>

## Visuals { .hmd-section }

<p class="hmd-lede" markdown>A diagram, a formula and a callout are text in the card. They are reviewed in a diff like the prose around them.</p>

<div class="hmd-specimens" markdown>
<div class="hmd-specimen" markdown>
<p class="hmd-label">Diagram</p>

````hmd
```d2
direction: right
card -> preview: editor
card -> site: publish
card -> answer: query
```
````

<div class="hmd-out" data-label="rendered" markdown>

```d2
direction: right
card -> preview: editor
card -> site: publish
card -> answer: query
```

</div>
</div>
<div class="hmd-specimen" markdown>
<p class="hmd-label">Mathematics</p>

```hmd title="specs/auth/login.hmd"
Attempt $n$ is delayed by the shared backoff formula with $b = 2$ seconds:

$$
t_n = U\bigl(0,\; \min(t_{max},\; b \cdot 2^n)\bigr)
$$
```

<div class="hmd-out" data-label="rendered" markdown>

Attempt $n$ is delayed by the shared backoff formula with $b = 2$ seconds:

$$
t_n = U\bigl(0,\; \min(t_{max},\; b \cdot 2^n)\bigr)
$$

</div>
</div>
<div class="hmd-specimen" markdown>
<p class="hmd-label">Callout</p>

```hmd title="specs/auth/login.hmd"
!!! note "Why per subject"

    Throttling per address punishes shared egress and misses the attack it is
    meant to stop.
```

<div class="hmd-out" data-label="rendered" markdown>

!!! note "Why per subject"

    Throttling per address punishes shared egress and misses the attack it is
    meant to stop.

</div>
</div>
<div class="hmd-specimen" markdown>
<p class="hmd-label">Task list</p>

```hmd title="specs/auth/login.hmd"
- [ ] Decide whether step 2 emits an audit event
- [x] Confirm the throttle key is the subject
```

<div class="hmd-out" data-label="rendered" markdown>

- [ ] Decide whether step 2 emits an audit event
- [x] Confirm the throttle key is the subject

</div>
</div>
</div>

<p class="hmd-fineprint" markdown>Diagrams are [D2](https://d2lang.com/) and mathematics is TeX. Tables, footnotes, collapsible sections and strikethrough work the same way. Where the `d2` program is not installed, a diagram is shown as its own source with a label. Every construct is shown working in [Features](public/features.md).</p>

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

* **The specification is the artifact.** The Python CLI, the MkDocs plugin, and
  the VS Code extension are implementations around it; they conform to it rather
  than define it.

* **What ships today is not the whole of it.** The resolver, linter, embed
    expander, renderer, and MkDocs plugin are released and in use. [HQL](https://hql-lang.org/),
  the query language, is released as a separate project at major version zero.
  Namespaces beyond one tree are specified in outline and unbuilt; where it is
  all going is the [Roadmap](public/roadmap.md).

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
