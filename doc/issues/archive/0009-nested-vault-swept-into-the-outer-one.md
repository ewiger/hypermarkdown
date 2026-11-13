# 0009 — A nested vault is swept into the vault around it

**Column**: done
**Opened**: 2026-11-13
**Found by**: making `doc/public/` of the HQL repository a vault of its own,
inside the `doc/` vault, so its site build and its editor resolve against the
same root

## What

A vault is a directory tree carrying `.hmd/`, and vaults nest. Discovery already
honours that: walking up from a card stops at the nearest `.hmd/`, in `hmd`
(`config.find_project_root`) and in the extension's catalog alike, and the
decision that nothing resolves across a boundary is on record
([decisions](../../memory/decisions.md), the section on a window holding a catalog
of vaults).

Loading does not. When `Workspace` is built for an outer root, it collects every
`.hmd` file beneath it, including every card of every vault nested inside. Both
implementations do this:

- Python: `Workspace._load` in `tools/hmd/src/hypermarkdown/resolve.py` is a
  plain `root.rglob("*.hmd")`, skipping only dot-paths.
- TypeScript: `Workspace` in `tools/hmd-ts-core/src/workspace.ts` walks the
  root and skips only entries whose name starts with a dot.

So the same card belongs to two vaults at once, depending on which root a tool
was handed. That breaks the outer vault in three ways:

- **False ambiguity.** A bare name that is unique in the outer vault becomes
  HMD002 as soon as an inner vault has a card of the same name. For example,
  `[[time]]` written in `doc/wiki/` collides with `doc/public/learn/time.hmd`.
- **False unresolved links.** An inner card's absolute reference such as
  `[[/learn/int]]` is correct against its own root and reported as HMD001 when
  linted from the outer one.
- **Leaked publication.** A site whose plugin `root` is the outer vault would
  register the inner vault's public cards as its own pages.

## Expected

A subtree whose root directory carries its own `.hmd/` is another vault. The
outer vault's `Workspace` does not load it: no documents, no names, no sweep
candidates, no pages. Linting that subtree with `--root` set to it, or from a
card inside it, is unchanged.

The marker test is the one discovery uses (`.hmd/` is a directory). The root
itself is exempt, since every vault carries its own marker.

## Scope

- Python `Workspace._load`, and with it `hmd lint`, `hmd graph`, `hmd render`
  and the MkDocs plugin, which all build a `Workspace`.
- TypeScript `Workspace`, for parity. The extension's catalog inherits the
  behaviour, which is what makes an outer vault's diagnostics match the CLI.
- A conformance case under `examples/conformance/cases/`, run by both
  implementations: an outer vault with a nested one, where a bare name present
  in both resolves in the outer vault without HMD002, and the nested cards are
  absent from `hmd graph`.
- The specification's project-configuration section in
  [hmd-lang-spec](../../wiki/hmd-lang-spec.hmd) states that `.hmd/` marks the
  root. It should also state that a marker below the root ends the vault there.

## Not in scope

Cross-vault references. Two vaults are two namespaces, and nothing here makes a
link reach across the boundary in either direction.

## Release

Downstream, the HQL repository pins `hypermarkdown[mkdocs]>=0.3,<0.4` and
needs this fix to lint its `doc/` vault once `doc/public/` is converted. A patch
release (0.3.1) is enough, since no public API changes.
