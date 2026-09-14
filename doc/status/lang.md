# STATUS — the language

What HyperMarkDown the *format* has settled and what it has not: the grammar,
resolution, the frontmatter keys, the rule IDs, publication, and the two
reserved languages that extend it. Implementation progress is tracked per tool
beside this file — [`hmd.md`](hmd.md) for the canonical Python implementation,
[`ts-core.md`](ts-core.md) for `@hypermarkdown/core`, and
[`vsc-ext.md`](vsc-ext.md) for the VS Code extension.

**This file is the only place work on the language is tracked.** Not the memos
under `doc/memory/`, not the cards under `doc/wiki/`, not the proposals
themselves. A decision that needs discussion is named here as an open question
and argued wherever it belongs; nothing else may hold a task list. Update the
row in the same commit that changes the specification.

A row cites the proposal it came from. The proposals remain the *records* —
motivation, alternatives, and normative text; what is built, broken, or
undecided is here.

**States** — `done` shipped and gated by a test · `ready` specified, unblocked,
not started · `blocked` waiting on a decision · `parked` started and set aside ·
`open` undecided · `deferred` deliberately not being decided now ·
`part-resolved` half answered, with the rest named in the row · `standing` an
accepted limitation · `lifted` no longer true.

**Snapshot** (2026-09-14) — the format is specified and implemented twice.
`hmd-lang-spec.hmd` is the normative text, consolidated out of HMD-0001 and
HMD-0002, and the conformance corpus is what keeps the two implementations
honest — in one direction only so far, since only the TypeScript side runs it.
Everything the MVP needed is decided. What is open divides in three: a handful
of semantic questions that block `drafted → accepted` on HMD-0001 and HMD-0002,
one genuine divergence between the implementations that the specification never
legislated (setext headings, T1), and two reserved languages — HQL and the
hyper web — that have names, constraints, and no syntax.

## Done

### The format (HMD-0001)

| ID | What was settled | Spec |
| --- | --- | --- |
| M1 | Parsing model, masking, the `[[…]]` grammar, heading anchors, the namespace root | HMD-0001 §1–§4 |
| M2 | Resolution: two-phase spine walk, root sweep, folder-note binding, both import forms | §5 |
| M3 | Sixteen diagnostics with stable IDs, and ID allocation reserved to the canonical implementation | §8 |
| M4 | Embed expansion — page, `#Section`, `#^id` — with cycles an error (HMD007) and depth capped at 16 (HMD008) | §6–§7 |
| M6 | `.hmd/config.toml` as the project marker, every setting stated at its default | §4, amended by `hmd init` |

### Publication (HMD-0002)

| ID | What was settled | Spec |
| --- | --- | --- |
| P1 | `nav` as a fourth reserved frontmatter key, a mapping; `order` an integer, HMD013 on anything else | HMD-0002 §2 |
| P2 | URLs: `a/b.hmd` → `a/b/`, folder notes collapsing onto their directory's URL | §1 |
| P3 | Publication is opt-in. `nav.visibility` is `public` or `private`, inherits from the nearest ancestor folder note, and defaults to private; an unpublished card is not registered at all | §2 |
| P4 | HMD017 warns when a published card links to or embeds an unpublished one; the link renders red and the build stays green | §2, §4 |
| P5 | A red link is a rendering outcome, not an error — `<a class="hmd-redlink">` | §4 |

### The names held in reserve

| ID | What was settled | Spec |
| --- | --- | --- |
| H1 | **HQL** reserved as the name, and inline properties, templates, and queries fixed as *one* design problem rather than three | HMD-0003 |
| H2 | Determinism, purity, and shared depth limits stated ahead of any HQL grammar; fence modes fixed — `hmq#eval` evaluates, bare `hmq` highlights | HMD-0003 §3 |
| N1 | Vocabulary split: a folder is a **module**, a rooted tree of cards is a **namespace**, and the project's own tree is the default one | HMD-0004 |
| N2 | Address form `namespace:path/to/card` reserved, orthogonal to the absolute, relative, and bare forms | HMD-0004 |
| N3 | Bindings live in `.hmd/config.toml` and nowhere else — granted and revoked in one reviewable file, never inferred from a link | HMD-0004 |
| N4 | A provider is anything answering "given a path, hand back a card": a folder, a web server, a database | HMD-0004 |

## TODO

### Planned work

| ID | State | Work point | Blocked on |
| --- | --- | --- | --- |
| T1 | ready | **Setext headings become addressable.** Both scanners are ATX-only, so `[[Card#Section]]` against a setext heading is HMD004 on both — while a built site anchors it anyway, because Python-Markdown's `toc` extension assigns the `id` independently of `hmd`. Index setext headings in `scan.py` and `scan.ts` together, add a corpus case, and state the rule in the specification: a heading is a heading whichever way it is written | a sentence in HMD-0001 §3 |
| T2 | ready | **HMD-0020 §9 names `HMD001`–`HMD016`** while HMD-0002 allocated HMD017. Amend the range, or make it open-ended, so porting a canonically-allocated rule is not a spec violation | nothing |
| T3 | ready | **State determinism normatively.** The specification leans on it — the same tree, linted twice or with its files created in a different order, must produce the same output — without ever saying so in normative text. Neither implementation tests it either, which is [`hmd.md` W9](hmd.md#planned-work) | nothing |
| W1–W8 (HQL) | blocked | Grammar, inline properties, evaluator, materialization, templates, `hmd query`, fence rendering, live preview | HQL Q1 |
| W1–W6 (hyper web) | blocked | Binding schema, second-local-tree resolution, remote fetch, resolver support for `namespace:` targets, cross-namespace query import, and the copy-edit of four sentences in HMD-0001 that still say "namespace" where they mean a folder | Hyper-web Q1 |

### Broken

| ID | State | Defect | Impact |
| --- | --- | --- | --- |
| — | open | None open | — |

### Limitations

| ID | State | Limitation | Why it stands |
| --- | --- | --- | --- |
| L1 | standing | The scanner is a hand-written masker, not a CommonMark block parser | Divergence from CommonMark is possible and currently undetectable. The corpus is what would expose it; Q1 is what would act on it |
| L2 | standing | Indented code blocks are not masked, so a `[[link]]` inside one is seen as a link | Forced by implementation: `admonition` and `footnotes` overload the four-space indent, and masking it dropped real links from the fixture (HMD-0001 §1) |
| L3 | standing | No lint suppression. Every finding must be fixed or tolerated at the call site | Q7 — adding a suppression syntax before real usage risks designing it wrong |
| L4 | standing | Embed depth is capped at 16 and cycles are errors | A bound is required; the exact number is arbitrary and cheap to change |
| L5 | standing | The graph is closed to the namespace root; links out of it are ordinary markdown links and are not checked | Deliberate (HMD-0001 §5). The site reports them at `info` instead |
| L6 | standing | `hmd render --to markdown` is one-way: erasure drops the embed boundary and the provenance of every link | A build product, not an interchange format. `md → hmd` conversion is sketched in [`md-hmd-interop.hmd`](../wiki/md-hmd-interop.hmd) and owned by no proposal |
| L7 | standing | The reserved key set is pinned *closed* at `tags`, `use`, `import` by HMD-0001 §5.3, and HMD-0002 §2 added a fourth | The amendment is made and implemented; what is unresolved is whether it is *accepted*, which is Q5 under Publication below |
| L8 | standing | An unbound namespace prefix is indistinguishable from a typo: `[[design:tokens]]` is a bare name and a red link | Nothing reads the prefix yet, so there is nothing to raise a better diagnostic from |
| L9 | standing | HQL and the hyper web specify no syntax at all | Deliberate. Naming a language and fixing its constraints is cheap; choosing a grammar under-informed is expensive and hard to reverse |

### Open questions and blockers

Each blocks `drafted → accepted` on the proposal it came from. **These tables
are the only copy** — the records point here rather than mirroring them.

#### Grammar and resolution (HMD-0001)

| ID | State | Question |
| --- | --- | --- |
| Q1 | open | Should the scanner move to a CommonMark block parser (`markdown-it-py`, which carries source maps) once the corpus exposes real divergences? |
| Q2 | open | Does `use` apply to a page's own links only, or also to links inside content it embeds? Expansion is textual, so today the embedded page's own toggles govern — is that the right default? |
| Q3 | open | Should an imported search path be probed *before* the spine rather than after? §5.2 pins "after" to buy monotonicity, but an author who imports a namespace to override local names has only the named form |
| Q5 | open | When plugins arrive, does `[discovery] autodiscovery` generalize into a `[features]` table, and does that scale past a handful of toggles? |
| Q6 | open | Should the root sweep be bounded by page count or depth, so a large tree cannot make an unresolvable bare link expensive to diagnose? |
| Q7 | open | Should the format ship a suppression mechanism (`<!-- hmd-disable HMD001 -->`)? |
| Q12 | open | How is the specification checked? Today the only method is a careful read — the 24-point audit that produced the current text was one, performed by an agent. That is a review, not a gate: it catches what it is asked to look for and nothing else, and it can be right about the prose while the prose is wrong about the implementations |
| Q11 | open | Are setext headings addressable? Unlegislated today, which is how the two implementations came to agree by accident and the site to disagree with both. T1 is the proposed answer: yes |

#### Publication and nav (HMD-0002)

| ID | State | Question |
| --- | --- | --- |
| Q2 | open | Should `nav.order` inherit down a subtree the way `use` does? `nav.visibility` now does, which is half an answer: the two keys inheriting differently is either a defensible split — placement is per card, publication is per folder — or an inconsistency to remove |
| Q3 | open | Is a red link with no `href` right, or should it link to a "create this page" target once one exists? |
| Q5 | open | Is the amendment adding `nav` to the closed reserved set accepted, or does the fallback stand — derived order only, plus an explicit `nav:` in the site config? |
| Q6 | open | What *should* a published card linking to a private one do — a blocked link, an unlisted-but-reachable page, or nothing — and is that a per-site choice? Argued in [issue 0008](../issues/0008-private-card-link-policy.md); the answer decides whether HMD017 stays a warning |

#### HQL (HMD-0003)

| ID | State | Question |
| --- | --- | --- |
| Q1 | open | What is the grammar? Where SQL's clauses, Python's comprehensions, and Scala's combinators conflict, which wins? |
| Q2 | open | Does the fence tag stay `hmq` or become `hql`? |
| Q3 | open | How are inline properties written? `key:: value` is Logseq's spelling and unconfirmed |
| Q4 | open | How are property vocabularies declared? Needs a config schema |
| Q5 | open | How does a query import from another namespace — reuse the `import:` key, or its own mechanism? |
| Q6 | open | Is **Topic** (template + query + namespace) a first-class construct or a convention? |
| Q7 | open | What triggers materialization, and may a build ever write to a source file? |
| Q8 | open | Does HQL belong in the MVP line or past it? |
| Q9 | open | Is frontmatter a data block or a declaration space? The open idea is that it could bind variables and definitions the way a module's top level does — which strains both the closed key set and the purity rule |
| Q10 | open | How are query-local variables bound and scoped? Ties to Q9 |

#### The hyper web (HMD-0004)

| ID | State | Question |
| --- | --- | --- |
| Q1 | open | Which keys express a binding in `.hmd/config.toml`? The file is settled; the schema is not |
| Q2 | open | What characters are legal in a namespace ID, and how does `namespace:path` stay visually distinct from a bare name and from a URL scheme? |
| Q4 | open | What fetches a remote namespace, when, and is the result always a pinned snapshot? |
| Q5 | open | What makes a provider "dynamic" — is a build tool already an instance, or does dynamic imply resolving at request time? |
| Q6 | open | Should a second local tree ship before a remote server, as the smaller first step? |
| Q7 | open | Does a remote namespace's containment root compose with the importing project's — can a two-hop reference exist at all? |
| Q8 | open | Does this resolve HQL's Q5, or stay independent of it? |
| Q9 | open | Does linting ever need network access, or only a local snapshot? |
| Q10 | open | Is `namespace:path` the final address form, or does an ID eventually need to be URL-shaped? |
| Q11 | open | Is a static ID-to-provider table enough indefinitely, and when does reaching past it stop being premature? |

## Gates

**None, and that is the honest entry.** The language's deliverable is a
specification, not a program: `hmd-lang-spec.hmd` is the normative text, and
nothing executes it. The corpus at `examples/conformance/cases/` is the
*implementations'* contract with each other, not the language's with itself, and
the site's build is a gate on the site.

What stands in for a gate today is a read — an agent asked to audit the
normative text for internal contradiction, for claims that outrun what the
implementations do, and for grammar that does not admit the examples given
beside it. The audit that produced the current specification worked exactly that
way. Q12 is whether that is enough.

The implementations answer for themselves: [`hmd.md`](hmd.md),
[`ts-core.md`](ts-core.md), [`vsc-ext.md`](vsc-ext.md).

## Changelog

- 2026-09-14: created, by folding the per-proposal trackers for HMD-0001,
  HMD-0002, HMD-0003, and HMD-0004 into one file about the format. What moved
  here is what the language owes an answer for; what those proposals said about
  the Python implementation moved to [`hmd.md`](hmd.md). T1 and Q11 are new:
  the setext divergence had been recorded backwards in the extension's README —
  as a slug the TypeScript side invents — when in fact neither implementation
  indexes setext headings and only a built site anchors them.
