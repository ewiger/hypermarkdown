# Prompt: fix issue 0009, a nested vault is swept into the vault around it

You are working in the HyperMarkDown repository (this checkout). Read
`CLAUDE.md` and every file under `doc/memory/` before you start, and follow
them. In particular, progress is tracked in `doc/status/` only.

## The task

Carry out [issue 0009](0009-nested-vault-swept-into-the-outer-one.md). In
short: a directory below a vault's root that carries its own `.hmd/` is a
separate vault, and the outer vault's `Workspace` must not load any card
beneath it. Discovery (walking up to the nearest `.hmd/`) already behaves this
way; loading does not.

## Where to work

1. Create a branch from `main`, named `fix/nested-vault-boundary`.
2. **Python**: in `tools/hmd/src/hypermarkdown/resolve.py`, `Workspace._load`
   collects with `root.rglob("*.hmd")` and `_hidden`. Skip every path that has
   an ancestor directory strictly below `self.root` (the root itself does not
   count) that contains a `.hmd/` directory. Reuse `config.MARKER_DIR` and do
   not hard-code the name. Compute the nested roots once per load, not once
   per file.
3. **TypeScript**: in `tools/hmd-ts-core/src/workspace.ts`, the recursive
   `walk` in the method that loads the namespace root should not descend into a
   directory below the root that holds `MARKER_DIR` (exported from
   `config.ts`). If the walk goes through an injectable filesystem port, use
   that port to test for the marker.
4. **Conformance**: add a case under `examples/conformance/cases/`, following
   the layout and README of the existing cases (`ambiguous-sweep/` is the
   closest model). The case has an outer vault holding a card that links to a
   bare name, and a nested vault (its own `.hmd/config.toml`) holding a card of
   that same name. Expected outcome: the link resolves in the outer vault with
   no HMD002, and the nested card is not in the outer vault's graph. Both
   implementations must run it.
5. **Unit tests** in each tool's own test suite. One test confirms that linting
   with `--root` set to the nested vault still sees its cards. Another confirms
   that the MkDocs plugin, with `root` set to the outer vault, registers no page
   from the nested one.
6. **Spec**: in `doc/wiki/hmd-lang-spec.hmd`, extend the project-configuration
   section with one normative sentence: a `.hmd/` below the root ends the vault
   there, and its subtree is not part of the outer vault. Keep the house style:
   state current truth, with no history of the change.
7. **Tracking**: move the issue 0009 card in `doc/issues/kanban.yaml` through
   doing to done, and turn the Broken row in `doc/status/hmd.md` into a Done
   entry. Also add a row to `doc/status/ts-core.md` for the parity change.
8. **Version**: bump the Python package to 0.3.1 at its single source of truth,
   `tools/hmd/src/hypermarkdown/__init__.py`, and add a changelog entry wherever
   the package keeps one. Do not publish to PyPI, npm or the marketplace. The
   maintainer releases.

## Gates

Run the gate commands each tool's guide lists (see `doc/status/hmd.md`,
section Gates, and the tool READMEs). Everything must pass, including the
conformance comparison between the two implementations. Commit topic-wise:
the Python fix with its tests, the TypeScript fix with its tests, the
conformance case, then spec and tracking. Do not push. Report the branch and
commits when done.

## Constraints

- No cross-vault resolution. A link must never reach into a nested vault, and
  it must never reach out of one either.
- No attribution lines for any tool or assistant in commits or files.
- Never cite with the section or pilcrow signs. Name the section instead.
