# 0011 — Vault and namespace: the declared design, HMD, and HQL have drifted apart

**Column**: todo
**Opened**: 2026-11-13
**Found by**: writing a Namespaces section for the root `README.md` from the
site's Namespaces page, then checking it against the code of both projects. The
section could not be made true of all three at once.

## What

Three sources say what a vault is, where a namespace starts, and how one vault
reaches another: the declared design (the language specification, the site's
Namespaces page, the tutorial), the HMD tools in this repository, and
[HQL](https://github.com/ewiger/hql) (checked at its release 0.6.0). They agree
only because every configuration file in both repositories happens to say
`wiki = "."`. The points below are where they differ.

### Where the namespace starts

| Source | Root marker | Namespace root |
| --- | --- | --- |
| Specification, "The namespace" | nearest `.hmd/`, else nearest `.git` | the `wiki` setting, relative to the project root; `doc/wiki` when absent |
| Python tool (`config.load`) | the same | the same |
| TypeScript core (`config.ts`) | left to the host | the `wiki` setting; `doc/wiki` when absent |
| The extension (`workspaceHost.ts`) | nearest `.hmd/` inside the workspace folder; no `.git` fallback, the folder itself when nothing is marked | the `hyperMarkdown.root` setting, then `wiki` |
| HQL (`vault::discover`, `context.rs`) | nearest `.hmd/` or `hql.toml`; no `.git` fallback | the marker directory itself; `wiki` is never read |

So for one tree, `hmd lint` and `hql render` load different sets of cards as
soon as `wiki` is anything but `.`, and also when `.hmd/config.toml` is absent:
HMD then reads `doc/wiki` and HQL reads the marker directory. A tree marked by
`hql.toml` alone is a vault to HQL and not a project to HMD.

### What the thing is called

The specification, the Namespaces page, and the tutorial never use the word
"vault". They say project root, namespace root, namespace, and tree. HQL's book
and code say vault and workspace, and state that a vault is exactly one
namespace rooted at the vault's directory. The extension, the issue cards, and
the decisions in `doc/memory/` say vault. A reader meets two vocabularies for
one concept, and the two differ on whether the marker directory and the
namespace root are the same place.

### How this tree is named

`hmd init` writes a `[namespace]` table with `name` and `provider` into
`.hmd/config.toml`. Nothing reads it. The specification's project-configuration
section does not mention the table. That section also says the version reads
exactly two settings and then lists three keys: `wiki`, `autodiscovery`, and
`mode`.

### How another vault is bound

Four spellings exist, one of them implemented:

| Source | Spelling | State |
| --- | --- | --- |
| Site, Namespaces page | `[namespaces.design] folder = "…"` and `url = "…"` in `.hmd/config.toml` | sketch, labelled as not a schema |
| `hmd init` template | `[namespace] provider = "folder"` | written, never read |
| HQL book, the hyper web chapter | `[namespaces.club] root = "…"` and `url = "…"` | described as not in the release |
| HQL, `hql.toml` | `[endpoint.journal] kind = "vault"`, `root = "journal"`, read with `source("journal")` | released and working |

The one working mechanism lives in `hql.toml`, uses the word endpoint, and is
reached from a query, not from a link.

### The address form

`name:card` is reserved by the Namespaces page, and `config.py` already carries
the pattern a namespace name must match. No HMD tool parses the colon: the whole
target is one unknown name and renders as a red link. HQL's book writes
`[[club:dune]]` and `@[[lit:reviewer]]` in its unreleased chapter, while its
released vault chapter states that a wikilink in one vault never resolves into
another. The language tracker's limitations say the reserved cross-project
namespace language "specifies no syntax at all", which the Namespaces page and
the name pattern both contradict.

### Two configuration files

`.hmd/config.toml` and `hql.toml` both mark a root and both configure the same
tree. Neither project says which one owns the namespace root, the namespace
name, or the bindings to other vaults.

## Expected

One statement of each of these, which the specification makes and both projects
follow:

- what marks a root, and whether `.git` and `hql.toml` count;
- whether the namespace root is the marker directory or a `wiki` path below it;
- one word for the concept, or two words with a stated difference;
- one schema for binding another vault, in one named file;
- the address form for a card in another vault, or an explicit statement that
  none exists yet.

Until then, public pages describe only what runs. The Namespaces section added
to `README.md` on 2026-11-13 carries the site's sketch (`[namespaces.design]`,
`[[design:tokens/color]]`) and a wrong comment on the `wiki` key, and is the
first thing to correct.

## Scope

- A review that decides each point under "Expected", recorded in the language
  tracker as open questions and settled there.
- The specification's sections on the namespace and on project configuration,
  the Namespaces page, the tutorial, and `README.md`.
- The Python tool's `config.py` and the `hmd init` template; the TypeScript
  core's `config.ts`; the extension's root resolution.
- A request to HQL for whatever the review decides about `wiki`, the marker,
  and the binding schema. Its code is not changed from here.
- A conformance case for a tree whose `wiki` is not `.`, so the namespace root
  is tested and not only agreed by coincidence.

## Not in scope

Implementing cross-vault references. This card is about making the three
sources say the same thing; building the feature follows the decision.
