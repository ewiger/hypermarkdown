# 0108 — One editor root folder should hold several HMD vaults

**Column**: backlog
**Opened**: 2026-09-14

## What

A git repository — one folder open in the editor — can contain more than one
HyperMarkDown vault, each marked by its own `.hmd/`. This repository already
does: `doc/wiki` plus a vault per example tree. The extension supports exactly
one vault per workspace folder, chosen once at startup, so every card outside
it is invisible.

The fix is discovery by walk-up, the way git finds its repository and the way
`hmd` already finds a project root: from the card, up through its parents, to
the nearest `.hmd/`.

## Symptom

Open this very repository in VS Code and click
`examples/cs-alg-sorting/complexity.hmd`. The preview says:

> Open a .hmd card to preview it.

The card is a card, it is open, and it is in the workspace. Every card under
`examples/` behaves the same way, including the ones under `examples/small/`,
which is the other self-contained example vault.

## Cause

`discoverRoot` in `tools/hmd-vsc-ext/src/workspaceHost.ts` resolves exactly one
namespace root, and it resolves it from `workspaceFolders[0]`:

1. the `hyperMarkdown.root` setting, else
2. `wiki` from `<folder>/.hmd/config.toml`, else
3. `doc/wiki`, else the folder itself.

This repository has no `.hmd/` at the root, so step 2 is skipped and step 3
applies — `doc/wiki` exists, so the namespace root becomes `doc/wiki`. From
there `WorkspaceStore.relFor` returns `null` for any URI outside that subtree,
`PreviewController.follow` never sets a card, and `send` reports the empty
state. The message is accurate about its own state and misleading about the
cause: the store has no card because the card is outside the one root the
extension decided to index.

The real vault for that card is `examples/cs-alg-sorting/.hmd/`, one directory
above it, with `wiki = "."`. Nothing looks for it.

## Why it is a design limitation, not a defect in one function

The Python implementation already does the git-like thing, and has from the start —
`find_project_root` in `tools/hmd/src/hypermarkdown/config.py` walks `start`
and its parents for `.hmd/`, then for `.git/`, and `hmd lint` on a card inside
`examples/cs-alg-sorting/` finds that vault without being told. The two
implementations therefore disagree about what "the project" is for the same
file on the same disk, which is the kind of split the conformance contract
exists to prevent — even though root discovery itself sits above the core, in
the host, by design (HMD-0021 §8).

The extension's model is *one workspace, one vault*. The vault model is *a
directory tree is a vault because it carries `.hmd/`*, and vaults nest: a
repository can hold several, which this repository does.

## Direction

Discover the vault **from the card**, not from the workspace folder:

- Walk up from the card's own URI looking for `.hmd/`, stopping at the
  containing workspace folder (do not escape the workspace — an editor may not
  read arbitrary ancestors of the user's disk, and `hmd`'s `.git` fallback is a
  CLI convenience that a workspace folder already provides).
- The nearest ancestor carrying `.hmd/` is that card's project root; its
  `wiki` resolves the namespace root as today.
- With no `.hmd/` anywhere above the card, keep today's behaviour for the
  workspace folder — `doc/wiki` when it exists, else the folder itself.
- `hyperMarkdown.root`, when set, still wins for the workspace folder it is
  set in. An explicit setting is an instruction, not a hint.

## Open questions

- **One store or several.** `WorkspaceStore` holds a single `Workspace`, host,
  root, and file watcher. Following cards across vaults means either a store
  per discovered root (a map keyed by root URI, built lazily on first card and
  disposed with the window) or a single store re-initialised on every crossing.
  The second is much smaller and throws the index away each time the user
  clicks between `doc/wiki` and `examples/`; the first is the honest model and
  makes diagnostics, backlinks, and the watcher per-vault. Prefer the first
  unless the cost is worse than it looks.
- **What backlinks and `[[wikilinks]]` mean across a boundary.** They should
  almost certainly not cross: two vaults are two namespaces, and a link that
  resolves into a neighbouring vault would make the same card render
  differently depending on what else is checked out. Needs saying explicitly
  somewhere in HMD-0021 either way.
- **Diagnostics scope.** `hyperMarkdown.diagnostics.scope` is
  `workspace | open` today, and "workspace" would come to mean "every vault
  the session has opened a card in". A third value, or a redefinition?
- **Multi-root workspaces.** `workspaceFolders[0]` is already a simplification
  that this change does not have to fix, but the walk-up should stop at the
  *containing* folder rather than the first one.

## Done when

- Opening `examples/cs-alg-sorting/complexity.hmd` in a checkout of this
  repository renders it, with `[[wikilinks]]` inside that example resolving
  against `examples/cs-alg-sorting/`.
- `doc/wiki` cards keep working with no `.hmd/` at the repository root.
- A test covers a workspace with a nested vault and a card in each, asserting
  that the two resolve to different roots.
- HMD-0021 §8 describes per-card discovery, and the empty-state message no
  longer claims the open card is not a card when what it means is that no vault
  claims it.
