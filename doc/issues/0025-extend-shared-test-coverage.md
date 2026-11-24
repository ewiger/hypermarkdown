# 0025 — Extend the shared test coverage

**Column**: backlog
**Opened**: 2026-11-24
**Related**: [the format's tracker](../status/lang.md),
[the conformance corpus](../../examples/conformance/README.md),
[the alignment card](archive/0022-align-implementations-with-the-0-1-decisions.md),
[[hmd-lang-spec#conformance-to-the-standard]]

## What

The shared test dataset records only diagnostics and resolutions. Several
parts of the language are normative but have no shared case today, because
the dataset's format has no field for their result. They are testable; the
dataset just doesn't test them yet. The specification says the absence of a
case doesn't make a rule optional, so this gap is the dataset's, not the
language's.

## Scope

Language-neutral cases for:

- embed expansion: the expanded text, section bounds, anchor stripping, and
  the absence of heading-level shifting;
- rendering semantics: an unresolved link still rendered as a link;
- publication: which cards are registered, and HMD017;
- frontmatter exposure: the mapping a consumer receives, for HyperMarkDown
  and Markdown cards;
- configuration validation: `location_path`, an empty or absent file, and the
  rejected `wiki` key;
- the newly agreed diagnostic rules from card 0022.

This needs new fields or a new kind of case in the dataset, and a runner for
each implementation. Run every applicable case against Python, Rust, and
TypeScript. Rust takes the cases that concern resolution.

## Done when

Each area above has at least one positive and one negative case, all three
runners execute the applicable ones, and the current coverage gaps are listed
in the corpus README rather than in the specification.
