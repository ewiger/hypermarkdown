# HMD-0004: The hyper web — namespaces beyond one tree

**Status**: drafted
**Created**: 2026-08-07

## Abstract

This proposal names the layer that sits outside a single project's own tree of
cards, and it needs two concepts to do it, not one. A **module** is a folder
acting as a resolution boundary a bare name cannot cross sideways — the thing
[HMD-0001](../HMD-0001/README.md) already builds, given a word of its own so
that the word below is free to mean one thing. A **namespace** is a rooted tree
of cards, addressable as a whole: a project's own tree is its default
namespace, unnamed because nothing yet needs to be told apart from it, and any
other tree becomes reachable by binding a namespace ID to whatever provides it
— a folder, a server, or anything else able to resolve and serve
HyperMarkDown for that ID, static or dynamic, local or remote. A card names a
page in another namespace with the form `namespace:path/to/card`, a namespace
ID in front of the path resolution HMD-0001 already defines. The binding is
declared in the project's own `.hmd/config.toml` and never inferred from a
link; how elaborate it may become is left open, and this record specifies no
binding schema, no fetch mechanism, and no wire protocol. It fixes what a
module is, what a namespace is, that the two are not the same thing, and the
constraints any future mechanism for either must satisfy.

## Motivation

HyperMarkDown is named for hypertext, and a single tree resolved against
itself is not yet hypertext in the sense the name claims — it is one document
with good internal cross-references, not a web of documents. Three things push
this record to exist now, even unbuilt:

- **A word was doing two jobs, and now does one.** "A folder is a namespace"
  opened [Namespaces](../../public/namespaces.md), while
  [HMD-0001](../HMD-0001/README.md) used the same word for the rooted tree the
  resolver runs inside, and this record needed it for a third thing at a
  different layer. Three meanings for one word would make every future
  sentence about any of them ambiguous, so they were reconciled rather than
  left to coexist: a folder is a **module**, a rooted tree is a **namespace**,
  and a namespace that is not your own is reached by name. HMD-0001 survives
  that unchanged — its "namespace root" is the root of the default namespace,
  which is what the settled vocabulary says. The chapter was rewritten on
  2026-08-08 to teach the four words apart.
- **The gap is not hypothetical.** HQL's own tracker already asks how a query
  imports from another namespace, with no answer available because no such
  namespace has been defined anywhere in the project. See
  [HQL's Q5](../../status/lang.md#hql-hmd-0003).
- **The shape matters as much as the existence.** The obvious precedent for
  cross-project linking is MediaWiki's interwiki namespace — one flat
  namespace per wiki, long articles rather than folders. That is the wrong
  model here. This project maps directly onto a filesystem of small `.hmd`
  files in nested folders — closer to a Confluence space than a Wikipedia
  namespace — and the addressing scheme has to stay that pragmatic and that
  filesystem-shaped, or it stops matching how the format is actually written.

## Goals

- Separate **module** (a folder's resolution boundary) from **namespace** (a
  rooted tree of cards, named and provided when it is not your own), and settle
  the word rather than let two meanings coexist unremarked.
- Fix one address form — `namespace:path` — so other work can cite it instead
  of inventing its own.
- State the constraints any namespace-binding or namespace-serving mechanism
  must satisfy, ahead of designing that mechanism.

## Non-goals

- **No binding schema.** *Where* a binding lives is settled: the project's own
  `.hmd/config.toml`, alongside the namespace root and the discovery policy it
  already carries, so that reach is granted in one file a reviewer can read.
  Which keys express "the ID `shared` means this provider" is not decided here
  — see Open Questions.
- **No wire protocol, no fetch mechanism, no caching or vendoring story** for a
  namespace backed by a remote server.
- **No change to resolution inside one module.** Every rule in
  [HMD-0001](../HMD-0001/README.md) §4–§5 stands exactly as written; this
  record adds an orthogonal address form, not a replacement.
- **No rewrite of HMD-0001.** [Namespaces](../../public/namespaces.md) now
  teaches module, namespace, path, and URL as four separate words, but
  [HMD-0001](../HMD-0001/README.md) needs no amendment to agree with it: what
  it calls the namespace root is the root of the default namespace, and every
  rule it states about resolution, containment, and import is unchanged. The
  handful of sentences there that say "namespace" where they mean a folder are
  a copy-edit against that record, not a change to what it specifies.
- **No commitment on how elaborate the ID-to-server binding becomes.** A
  static table and something as elaborate as content-addressed storage are
  both left open; this record commits to neither.
- **No authentication, availability, or trust model** for a namespace's
  server. Those are real questions once a mechanism exists and are out of
  scope for a record that only reserves the shape.

## Specification

### Module: a folder, and the boundary a bare name cannot cross

A module is exactly what [HMD-0001](../HMD-0001/README.md) and
[Namespaces](../../public/namespaces.md) already build: a folder acting as a
boundary a bare name cannot cross sideways, an `index.hmd` speaking for it,
and `import` reaching across it on purpose. Nothing about that mechanism
changes here — this record only gives the concept a name that does not
collide with the one below. Every existing rule about resolution, containment,
and import continues to apply to a module exactly as written today.

### Namespace: a named tree, not a folder

A namespace is a rooted tree of cards, addressable as a whole. Every project
already has one: its own tree, the default namespace, unnamed because there is
nothing yet to tell it apart from. A namespace that is *not* the project's own
becomes addressable by binding a **namespace ID** to whatever provides that
tree — a **namespace provider**, meaning anything able to resolve and serve
HyperMarkDown for that ID, static or dynamic. A project's published site is
already an unnamed instance: its MkDocs build is a static-enough provider,
serving the default namespace out of the project's own tree — the right tool
for exactly that job today. What this record adds is that the binding does not
have to be singular, local, or fixed:

- A namespace ID MUST be bound explicitly, by the project, in its own
  `.hmd/config.toml`, and MUST NOT be inferred from a link. This is the same
  principle that makes `import` a statement rather than a search, applied one
  layer up — and one step stricter, because a card may widen how its own names
  resolve inside its tree while only the project may grant reach to another
  tree at all.
- The binding from an ID to a provider MAY be **static** — a fixed table
  mapping an ID to a location — or **dynamic** — resolved at request or build
  time by something that understands HyperMarkDown well enough to serve it.
  Both satisfy the same address form; which one backs a given ID is a
  deployment detail a card's links never need to know.
- Rebinding a namespace ID to a different provider MUST NOT change the meaning
  of a link that names it. `namespace:path/to/card` stays the same text
  whether the namespace behind it moved from a static host to a dynamic
  resolver — the indirection is the point, the way a package name outlives
  the particular registry that happens to host it today.
- Removing a binding MUST remove the reach it granted, in that one file,
  without editing any card. Revocation is the same lever as grant.

### The address form

A card refers to a page in a bound namespace with the namespace ID named up
front, separated from the path by a colon:

```text
namespace_ref := namespace ":" page_ref
namespace     := segment
```

- `namespace:path/to/card` names the page `path/to/card` inside whatever tree
  the provider for `namespace` serves. This is the one syntactic form this
  record fixes. Once `namespace` resolves to a provider and its tree, resolving
  `path/to/card` inside that tree reuses `page_ref` exactly as
  [HMD-0001](../HMD-0001/README.md) already defines it, absolute from that
  tree's own root — nothing about within-tree resolution is invented twice.
- The existing absolute (`/path`), relative (`./path`), and bare (`path`)
  forms of HMD-0001 §2 are unaffected. `namespace:path` is an additional,
  orthogonal form, not a replacement, and it MUST remain visually
  distinguishable from a bare name — a reader seeing `[[tokens]]` must never
  wonder whether `tokens` is secretly a namespace ID. The exact character
  rules that guarantee this are open; see Open Questions.

### What may provide a namespace

The provider contract is deliberately small — given a path, hand back a card —
because that is what keeps the list below open-ended. This record widens the
question rather than answering it, since the shapes need very different amounts
of missing machinery:

- **This project's own build.** The default namespace, served today by
  MkDocs out of the local tree, with no ID needed because there is nothing yet
  to disambiguate it from.
- **Another folder.** A different rooted tree on the same filesystem, or a
  checkout beside this one, bound to its own namespace ID. Nearly free: the
  binding step [HMD-0001](../HMD-0001/README.md) already defines, run against a
  second root once that root has an ID.
- **A web server.** A namespace published by another project entirely, at a URL
  it announces, static or dynamic. No new REST protocol is invented for this;
  HTTP is already adequate and this record does not redesign it. What such a
  server is expected to add is an `hmd.yaml` beside its content — a route
  configuration, with rewrites, describing how card paths map onto what it
  serves, so that a client resolves against it rather than guessing its layout.
  That file is its own specification and is **out of scope here**. This is the
  shape the vision is reaching for — many small `.hmd` projects, each its own
  namespace, linkable by name instead of copied into your own tree — and the
  shape with no fetch mechanism, no caching story, and no trust model defined
  anywhere yet.
- **A database, or anything else.** A content store, a generated tree, or a
  service in front of something that was never a filesystem. A provider is
  defined by what it answers, not by what it is made of, and the list is
  therefore never closed.
- All of them MUST resolve through the one address form above, so a card's
  links do not have to change if what backs a namespace ID later changes.

### Constraints on any resolution mechanism

Stated now, independent of syntax, so that whatever mechanism eventually binds
a namespace ID to a provider is built inside these rules rather than around
them — the same move [HMD-0001](../HMD-0001/README.md) made by fixing
determinism before the resolver that had to satisfy it existed.

- Resolution MUST be deterministic for a fixed set of namespace bindings: the
  same inputs produce the same answer on every run, on every machine. This is
  HMD-0001's determinism principle applied to a namespace that is not the
  project's own.
- A remote namespace's provider MUST NOT be dereferenced silently.
  [HMD-0001](../HMD-0001/README.md) pins "no network access" for the MVP
  resolver; any mechanism that fetches from a remote namespace crosses that
  boundary and MUST do so as an explicit, visible step — a pinned snapshot, a
  vendoring command, an explicit build flag — never as a side effect of
  linting or rendering a card that happens to link there.
- A namespace binding MUST be declared by the project, in `.hmd/config.toml`,
  and never inferred from a link. `namespace:path` written in prose means
  nothing until the project says what `namespace` is bound to — the same
  principle that makes `import` a statement rather than a search. The
  consequence worth stating on its own: the set of trees a build may read is
  fixed by one reviewable file, and no card can widen it.
- A resolved target MUST still satisfy the containment check
  [HMD-0001](../HMD-0001/README.md) defines, against whatever tree the
  namespace's provider exposes, even when that tree is not the project's own
  root. A namespace boundary is a second root, not an exemption from the
  escape check.

## Backwards Compatibility

Nothing existing changes meaning. `namespace:path` introduces a colon inside a
link target, a character HMD-0001's grammar does not reserve today — a target
containing one currently falls through as an ordinary bare name and, absent a
card coincidentally titled with a literal colon in it, resolves to nothing and
renders as a red link. The new form is additive: it gives that previously
meaningless shape a meaning, and changes no link that resolves today.

The module/namespace vocabulary is prose, and settling it changed prose only.
[Namespaces](../../public/namespaces.md) was rewritten to teach the four words
apart, and the callout in [Features](../../public/features.md) that read "a
folder is a namespace" now says "a folder is a module". No behaviour, no
diagnostic, and no configuration key changed, and HMD-0001 needed no amendment
at all; see Non-goals.

## Security Considerations

A remote namespace is the first construct this project would define that
crosses a trust boundary, and it inherits the resolver's existing surface
before it adds a new one:

- Once fetched, a remote namespace's content is untrusted input. The
  containment check above applies to it exactly as to a local root and MUST
  NOT be relaxed because the source is "someone else's project" — trust is a
  governance question, decided by whoever configures the binding, not a
  parser exemption.
- Fetching from a remote namespace would be the first network-touching
  operation this project defines anywhere. Whatever mechanism eventually
  performs it needs its own resource bounds and its own security review; this
  record only fixes that the fetch must be explicit and never silent — see
  *Constraints on any resolution mechanism* above.

## Open Questions

Every mechanism question is open by design. They are tracked in
[the language tracker](../../status/lang.md#the-hyper-web-hmd-0004) and only there, following
the same departure from `TEMPLATE.md` that [HMD-0003](../HMD-0003/README.md)
took: a list mirrored in two files drifts, and then neither copy can be
trusted without opening both.

## See also

- [`doc/status/lang.md`](../../status/lang.md) — work points, limitations, and the open questions.
- [HMD-0001](../HMD-0001/README.md) — the module boundary, the namespace root,
  the containment check, and the `import` mechanism this record builds on and
  extends outward.
- [HMD-0003](../HMD-0003/README.md), specifically
  [HQL's Q5](../../status/lang.md#hql-hmd-0003) — the
  cross-namespace query question this record's binding mechanism, once
  designed, is expected to answer.
- [Namespaces](../../public/namespaces.md) — the settled vocabulary for a
  reader who is not implementing it, and the within-tree resolution rules that
  `namespace:path` reuses once a namespace ID resolves to a provider.

## Changelog

- 2026-08-07: drafted as a stub — the module/namespace split, the
  `namespace:path` address form, and the constraints on any future binding or
  fetch mechanism reserved; no binding syntax and no code specified.
- 2026-08-08: vocabulary settled and the record aligned to it. A namespace is a
  rooted tree of cards — the project's own is the default one — reached, when it
  is someone else's, by binding an ID to a **provider**; "served identity" was
  the same idea named from the wrong end. Bindings are fixed to
  `.hmd/config.toml`, with the schema still open, and the security consequence
  of that — reach granted and revoked in one reviewable file, never widened by a
  card — is stated as a constraint. The provider list is opened beyond three
  shapes, with a web provider expected to publish an `hmd.yaml` route
  configuration whose specification is out of scope here. No mechanism was
  built and no behaviour changed.
