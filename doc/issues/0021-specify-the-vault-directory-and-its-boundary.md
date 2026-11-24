# 0021 — Specify the vault directory and the standard's boundary

**Column**: backlog
**Opened**: 2026-11-24
**Related**: [the format's tracker](../status/lang.md),
[the drift between HMD and HQL](0011-vault-and-namespace-drift-between-hmd-and-hql.md),
[[hmd-lang-spec#the-namespace]], [[hmd-lang-spec#project-configuration]]

## What

The specification defines cards, their syntax, and how a reference finds
one. It says almost nothing about the vault around them. `.hmd/` appears
only as a marker, and `.hmd/config.toml` only as three settings
(`location_path`, `autodiscovery`, `mode`) and one banned key (`wiki`).
Everything else in the file is to be ignored. Nothing says:

- what `.hmd/` may contain besides `config.toml`, and who owns each part;
- the configuration file's schema as a whole: its tables, which of them the
  standard reserves, and how an extension adds its own without colliding;
- what a vault holds besides cards: images, attachments, and other binary
  or non-card files. Where they live, whether a card may link to one, and
  whether they are part of the namespace, a link target, or neither;
- where the standard ends and an extension begins. HQL, the editor, the
  site build, and the semantic index each keep state or settings in or
  beside a vault, and none of that is marked as theirs.

So a second implementation can't tell what a valid vault looks like. An
extension can't tell where it may write. And a reader can't tell whether a
file they see in `.hmd/` is part of HyperMarkDown or a tool's.

## Scope

A section of the specification, or a companion document it cites, that
draws the boundary in three parts:

1. **The standard.** The vault marker, the configuration file, and its
   reserved keys and tables. The namespace root. What a conforming
   implementation MUST read, MUST reject, and MUST leave alone.
2. **Non-card files.** Binary and other files in the vault and in the
   namespace: whether a reference may reach them, how, and what they are
   not (they are not cards, and no HyperMarkDown syntax is recognised in
   them).
3. **Extensions.** A namespaced place in `.hmd/` and in the configuration
   file for each extension (for example `[hql]` or `.hmd/hql/`), with the
   rule that the standard never claims those names and an extension never
   claims the standard's.

The cross-namespace address (`namespace:path`, reserved in 0.1) and the
binding of another vault are in 0011's territory. This card only has to
leave room for them.

## Steps

1. Inventory what each tool reads or writes under `.hmd/` and in
   `config.toml` today: the HMD tools, the editor, the site build, HQL, and
   the semantic index.
2. Decide the three-part boundary with the user, and write it into the
   specification.
3. Add a diagnostic or load error for each new MUST, with a case or a unit
   test where the corpus can't express it.
4. Bring the tools and the repository's own `.hmd/` into line.

## Done when

The specification states what a vault is beyond its cards, which parts of
`.hmd/` and `config.toml` are the standard's, how non-card files are
treated, and where each extension may keep its own settings and state. Every
tool in the inventory agrees with it.
