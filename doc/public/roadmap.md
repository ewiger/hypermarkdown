# Roadmap

## News and updates

**2026-09-14 — `hmd` 0.3.0 and the VS Code extension 0.3.0.** Both shipped the
same day, and the extension's release is the first not marked *preview*. It
brings a graph of the vault, in place of the backlinks tab it replaces.

**2026-08-10 — `@hypermarkdown/core` on npm.** The TypeScript implementation is
published, and every release since its bootstrap goes out from CI with no stored
credential.

The four release lines, and where each one currently stands:

| | Version | Published as |
| --- | --- | --- |
| **HyperMarkDown**, the language | 0.1, drafted | [the specification](../wiki/hmd-lang-spec.hmd) |
| **`hmd`** — Python: CLI, library, MkDocs plugin | 0.3.0 — 2026-09-14 | [`hypermarkdown`](https://pypi.org/project/hypermarkdown/) on PyPI |
| **`@hypermarkdown/core`** — the format in TypeScript | 0.1.1 — 2026-08-10 | [`@hypermarkdown/core`](https://www.npmjs.com/package/@hypermarkdown/core) on npm |
| **`hmd-vsc-ext`** — the VS Code extension | 0.3.0 — 2026-09-14 | [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=hypermarkdown.hmd) and [Open VSX](https://open-vsx.org/extension/hypermarkdown/hmd) |

The language is versioned apart from the tools that implement it: a release of
`hmd` does not imply a new language version, and a language version does not
wait for one. Each line carries its own changelog in the repository.

## Where the project stands

**Out of preview.** The tools are released and installable from the registries
people already use, on an ongoing release cadence rather than a single drop.
Everything the format specifies is implemented twice over — once canonically in
Python, once in TypeScript — and the two are held to each other by a shared
corpus of cases, with every accepted difference written down.

**The writing is behind the code, and deliberately still moving.** The language
specification is at 0.1 and drafted, not settled; a first version under active
development is exactly what it is. The same goes for the documentation around
it, which is being written as the format is used. Both will move before 1.0, and
the specification is where a disagreement is resolved — no implementation's
behaviour overrides it.

The living example is [the wiki](../wiki/README.md), generated from `.hmd` cards
in this repository. The exhaustive inventory of every feature — where the idea
came from, and what is deferred or turned down — is
[the feature list](../wiki/hmd-feature-list.hmd).

## What comes next

### 0.3 across the board

`hmd` and the extension are at 0.3.0. `@hypermarkdown/core` is the line still
short of it, at 0.1.1, and closing that gap is the near-term work: the card
publication model it has not yet ported, and the last few rendering differences
from the canonical implementation that are recorded but not yet gone.

### Semantic search

The large feature the project is aiming at is **semantic search over a
collection of cards** — ask a question in ordinary language, and get back the
cards whose *meaning* is related, rather than the ones that happen to share a
word.

The unit of retrieval is the **card**, not the directory. HyperMarkDown already
has a document-level object with a name, so it does not need the filesystem to
supply one. Each card gains three **depths**:

| Depth | What it is | What it is for |
| --- | --- | --- |
| `D0` | a short abstract, a few sentences | *find me* — cheap enough to search everything |
| `D1` | a richer overview | *understand whether I am relevant* |
| `D2` | the authored `.hmd` card | *actually use me* — and it stays authoritative |

`D` is depth, and depth is compression rather than truncation: a `D0` may
legitimately name a card's subject in words the card never used, so long as it
is still that card's subject. `D0` and `D1` are derived data, generated into a
hidden sidecar tree that resolution and transclusion ignore and that can be
thrown away and rebuilt from source at any time. The vector index is an
*additional* index over the existing card model — it replaces neither the graph,
nor frontmatter, nor plain full-text search.

### HQL, the Hyper Query Language

Semantic search is where **[HQL](https://github.com/ewiger/hql)** arrives: a
separate typed functional language, developed in its own repository alongside
HyperMarkDown and meant to operate over its cards, structure, metadata, and
graph. Semantic retrieval enters HQL as one operation among the others, yielding
typed HMD objects that the rest of the language goes on processing — fuzzy
discovery to get into the knowledge space, then deterministic traversal once
inside it:

```hql
cards
| semantic("bearer token authorization")
| take(5)
| graph(depth = 1)
```

That syntax is illustrative rather than settled. HQL today is an experimental
bootstrap with no HyperMarkDown integration yet; once it has one, it is expected
to join the toolchain as a tool of its own.

### Further out

Two features are specified in outline and unbuilt: **namespaces beyond one
tree**, so that independently authored and independently served HyperMarkDown
can name each other across the gap — the argument for which is
[Vision](vision.md) — and a **language server**, which the canonical Python
implementation will host, putting the same diagnostics into any editor that
speaks the protocol rather than only into the VS Code extension.

There are no dates here on purpose. What is being tracked is the order things
are wanted in, not a schedule.
