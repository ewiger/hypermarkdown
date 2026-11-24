# 0023 — Rename `wiki` to `location_path`

**Column**: todo
**Opened**: 2026-11-24
**Related**: [the format's tracker](../status/lang.md),
[the vault directory card](0021-specify-the-vault-directory-and-its-boundary.md),
[the drift between HMD and HQL](0011-vault-and-namespace-drift-between-hmd-and-hql.md),
[[hmd-lang-spec#project-configuration]]

## What

The specification replaces the `wiki` setting of `.hmd/config.toml` with
`location_path`, whose default is `"."`, the vault itself, instead of
`doc/wiki`. `wiki` is banned: an implementation that reads a vault rejects a
configuration that sets it, and doesn't read the vault. The rename is a
breaking change.

## Scope

Configuration parsing, defaults, documentation, examples, and tests in
Python, Rust, and TypeScript, and every configuration file in this
repository.

## Done when

- The default namespace root is `"."`.
- An empty or absent configuration is valid.
- `location_path` accepts a relative subdirectory path.
- A namespace root can't resolve into another vault.
- A nested vault's contents are excluded from the enclosing namespace.
- An explicit namespace root (command line, API, application configuration)
  still overrides the setting.
- A configuration that sets `wiki` is rejected with an error naming
  `location_path`, and each implementation pins that with a unit test.
- No configuration in the repository sets `wiki`.
