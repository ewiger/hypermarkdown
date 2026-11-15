# Namespaces

## TL;DR

`[[tokens]]` is a **bare name**: exactly one segment, with no slash, path marker,
or namespace qualifier. `[[specs/login]]` is an **unqualified path**. Both are
unqualified references and use the same four resolution phases: named imports,
the spine, wildcard import origins, then autodiscovery.

The spine probes the card's own folder and each ancestor folder without
recursion. It never searches sideways. If the earlier phases find nothing,
autodiscovery may resolve a unique match elsewhere in its configured scope.
Multiple autodiscovery matches are `HMD002`; they have no ranking rule.

In HMD 0.1, the default namespace root bounds all HMD page-reference
resolution. Ordinary Markdown links can still address files and URLs outside
that root. Cross-namespace references such as `design:tokens` are reserved but
not implemented.

## Resolution scope and address forms

A **module** is a directory and provides a local resolution scope for the spine
and inherited configuration. It is not a hard boundary: autodiscovery can find
a unique card in another module. A directory's `index.hmd`, when present, is its
folder note and can provide module-level configuration.

A **vault** is the directory that holds `.hmd/`: one `config.toml` configures
it. A **namespace** is a rooted tree of modules, the tree of cards a reference
resolves in. The two are not the same directory unless the configuration says
so: the `wiki` setting in `.hmd/config.toml` is the **cards location**, where
inside the vault the cards start. The directory it names is the default
namespace root. It defaults to `doc/wiki`, `wiki = "."` puts the cards directly
under the vault, and a command or integration can override it. A page reference that escapes this root
is `HMD003`; path normalization happens before that check, and symlinks are not
followed out of the tree.

| Form | Category | Resolution |
| --- | --- | --- |
| `[[tokens]]` | bare name | four phases below |
| `[[specs/login]]` | unqualified path | four phases below |
| `[[./tokens]]`, `[[../billing/invoices]]` | relative path | directly from the source directory |
| `[[/shared/tokens]]` | absolute path | directly from the namespace root |
| `[[design:tokens]]` | namespace-qualified reference | reserved; not implemented in 0.1 |

Use ordinary Markdown syntax, such as
`[the spec](https://example.org/spec)`, for a URL or repository file that is not
an HMD card.

## Resolving an unqualified reference

Given `[[tokens]]` written in `specs/auth/login.hmd`, resolution runs these
phases and stops at the first match:

```text
0. named imports     an explicit `from … import tokens` in this card
1. the spine         specs/auth/ , then specs/ , then the root
2. imported paths    each `from … import *` origin, in declaration order
3. autodiscovery     one sweep of the whole tree
```

The spine is the straight line from the card up to the root. Each directory on
it is probed for the name itself, and nothing below them is opened:

```text
wiki/
├── index.hmd
├── specs/
│   └── auth/
│       ├── login.hmd      ← [[tokens]] is written here
│       └── session.hmd
└── glossary/
    └── tokens.hmd
```

The walk checks `specs/auth/`, then `specs/`, then `wiki/`, and stops. It never
opens `glossary/`, which hangs off a directory the walk did visit but is not
itself on the line to the root — that is what *sideways* means. Naming the route
still works from anywhere on the spine: `[[glossary/tokens]]` is an unqualified
path and resolves in phase 1.

Autodiscovery does look sideways, at the whole tree at once, and here it finds
`tokens` and resolves. The word doing the work is *unique*: had a second
`tokens` existed anywhere in the tree, the sweep would report `HMD002` instead
of preferring the nearer one or the first one found.

The split is deliberate. What a bare name means on the spine depends only on the
card's own folder and its ancestors, so a card added in an unrelated branch can
never silently change it. Autodiscovery may reach everywhere precisely because
it refuses to guess when the answer is not unique.

Wildcard origins are probed non-recursively too, but unlike the sweep they are
explicitly ordered. If two contain a match, the earlier origin wins and the
shadowed match is reported as HMD016.

## Folder notes

A directory's `index.hmd` is its landing page. `[[specs/auth]]` and
`[[specs/auth/index]]` are two unqualified path spellings that resolve to the
same card, which is served at one URL.

## Imports

When the spine is not enough, say what you mean in the header:

```yaml
import:
  - from /shared import tokens as shared-tokens   # binds one name
  - from /glossary import *                       # adds a search origin
```

The two forms have different precedence:

- **`import x as y`** binds a single page to a single name. It beats the spine,
  allowing the author to choose one page explicitly.
- **`import *`** adds a directory to the list of origins a bare name is probed
  against, *after* the spine. It does not bind anything eagerly, so a card added
  to that directory later becomes reachable with no edit here.

A wildcard import cannot override a named import or a spine match. It can change
a reference that previously resolved by autodiscovery because wildcard origins
are checked before the global sweep.

Imports do **not** inherit. An import in `index.hmd` binds names for that file
alone, because a bare name resolvable only by reading a file you never opened is
exactly the action-at-a-distance imports exist to remove.

A card's header is its declarative layer, and it is small on purpose: `tags`,
`use`, `import`, and `nav` are reserved for the toolchain, and every other key
stays yours, exposed but unexamined. Reach across a namespace is the same idea
one layer up: a card may widen how its own references are looked up inside its
tree, but only project configuration may grant access to another tree.

## Reaching another namespace *(proposed — [HMD-0004](../proposals/HMD-0004/README.md))*

A card names a page in another namespace by putting the namespace's name in
front of the path:

```text
design:tokens/color
```

The prefix selects the tree; everything after the colon is resolved inside that
tree by exactly the rules above — absolute from that tree's own root, with its
folder notes, its fragments, and its containment check. Nothing about
within-tree resolution is invented twice, and no rule already on this page
changes.

Two properties follow, and both are the reason the form is a name rather than a
location:

- **Rebinding does not change meaning.** If `design` moves from a folder on your
  disk to a server on the other side of the world, `design:tokens/color` is
  still the same address in every card that wrote it.
- **A prefix stays visibly a prefix.** `[[tokens]]` must never leave a reader
  wondering whether `tokens` is secretly a namespace name. Exactly which
  characters a namespace name may use is still open.

**What happens today:** `[[design:tokens]]` has the reserved shape of a
namespace-qualified reference, not a bare name. Version 0.1 does not recognize
the colon as a qualifier, so the parser passes the whole target to local
resolution as one unqualified segment; it normally matches no card and renders
as a red link. `hmd lint` and `hmd render` perform no network access.

## A namespace must be granted, not guessed *(proposed — [HMD-0004](../proposals/HMD-0004/README.md))*

A namespace name means nothing until the project says what it is bound to.
Bindings live in `.hmd/config.toml` — the configuration for the whole wiki
space, next to the root and the discovery policy that are already there:

```toml
wiki = "doc/wiki"                # the cards location: where this vault's own cards start

[namespaces.design]              # a second tree on this filesystem
folder = "../design-wiki"

[namespaces.upstream]            # a namespace served over HTTP
url = "https://wiki.example.org/"
```

That block is a **sketch, not a schema**. It shows where bindings live and what
they have to say — a name, and what answers for it — while the exact keys stay
undecided until there is a second real tree to link to.

What is *not* provisional is that the table is the only place a namespace can
come from. The reason is security first, ergonomics second:

- **A prefix is a permission.** The set of trees a build may read is fixed by
  configuration, in one file, reviewable in one diff. No card can widen it, and
  no link can introduce a namespace by mentioning one. An unbound prefix is not
  a lookup that should try harder; it is simply not addressable.
- **No silent dereference.** Linting or rendering a card that links into a
  remote namespace must never fetch anything as a side effect. Whatever
  mechanism eventually crosses the network does it as a visible step — a
  vendoring command, a pinned snapshot, an explicit flag.
- **Containment still applies on the far side.** A resolved target must lie
  inside whatever tree the namespace exposes. A namespace boundary is a second
  root, not an exemption from the escape check, and content fetched from someone
  else's project is untrusted input on arrival.
- **Determinism survives.** For a fixed set of bindings, the same inputs produce
  the same answer on every run and every machine — the property the local
  resolver already guarantees, carried one layer out.

Revocation follows from the same design: remove the binding and every link that
used it stops reaching, in one edit, without hunting through cards.

## What can provide a namespace *(proposed — [HMD-0004](../proposals/HMD-0004/README.md))*

The provider set is open-ended. A namespace is defined by what it answers, not
by what it is made of: given a path, hand back a card. Anything that can do that
is a **namespace provider**.

- **This project's own tree.** The default namespace, resolved off the local
  filesystem. This is the provider that exists today.
- **Another folder.** A second rooted tree on the same filesystem, or a checkout
  beside yours, given a name of its own. The smallest step outward, because
  resolution against a second root is the machinery that already ships.
- **A web server.** A namespace published by another project entirely. No new
  REST protocol is invented for this — HTTP is already there and does the job.
  What such a server adds is an `hmd.yaml` alongside its content: a route
  configuration, with rewrites, describing how card paths map onto what it
  serves, so a client can resolve against it without guessing its layout. That
  file is its own specification and is out of scope here.
- **A database, or anything else.** A content store, a generated tree, a service
  in front of something that was never a filesystem. The contract is small on
  purpose so that the list is never closed.

Whichever provider answers, a card's links do not change, and the resolution
rules on this page apply once the tree is available. Naming the tree keeps its
storage location out of card references.

## Red links are not errors

A link to a page that does not exist yet is a **warning**, not a failure. It
marks something worth writing later, renders as a red link, and keeps the build
green. A wiki is written over years; the toolchain should not demand you finish
it today.

## See also

- [HMD-0001](../proposals/HMD-0001/README.md) — the shipped half: the grammar,
  the resolution phases, the root, and the containment rule.
- [HMD-0004](../proposals/HMD-0004/README.md) — the reserved half: the prefixed
  address form, what a namespace provider must satisfy, and the open questions
  behind every mechanism sketched above.
- [Features](features.md) and [Vision](vision.md) — what this buys an author
  today, and where the many-trees idea is heading.

!!! tip "Read next"

    [The HMD Tutorial](../wiki/hmd-tutorial.hmd) — resolution is one chapter of
    it. The rest of the language is taught the same way, and the whole thing
    takes one sitting.
