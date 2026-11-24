# 0022 — Align the implementations with the finalized 0.1 decisions

**Column**: done — closed 2026-11-24
**Opened**: 2026-11-24
**Related**: [the format's tracker](../../status/lang.md),
[the release card](../0016-prepare-the-0-1-specification-release.md),
[the grammar card](../0018-validate-the-grammar.md),
[the shared test coverage card](../0025-extend-shared-test-coverage.md),
[[hmd-lang-spec]]

## What

The specification now settles a batch of behavior that the three
implementations (Python, Rust, TypeScript) and the shared tests don't follow
yet. Symbolic links are excluded, because that decision is still open (card
0024).

## Scope

The approved behavioral changes:

1. **Block anchors**: spaces or tabs before the `^`; the anchor's source
   position starts at the `^`, so HMD006 is reported there.
2. **HMD008**: the starting card has depth zero, each nested embed adds one,
   and the limit is 16. HMD008 is reported at the embed that would exceed it.
   Implementations that count the starting card report a chain of exactly 16
   today, which is wrong.
3. **Embed cycles**: detected by the identity of the resolved card or
   section, not by the spelling of the reference. Repeats in independent
   chains are not cycles.
4. **Frontmatter diagnostics**: reported at the offending key or value where
   that position can be determined, otherwise at the start of the block.
5. **HMD015**: also covers an import whose directory exists but whose named
   card does not.
6. **Messages**: they are not standardized. Shared tests compare identifier,
   severity, path, line, and column, not message text.
7. **Empty values**: an empty tag is HMD013; an empty heading identifier is
   never addressable and never produces HMD011.
8. **Imported search paths**: a later path that crosses the namespace
   boundary doesn't overwrite an earlier match. It is reported as HMD003 on
   its own, and HMD016 still applies to later valid matches.
9. **Frontmatter boundaries**: an unclosed `---` is no frontmatter; `...`
   doesn't close a block; an empty block is an empty mapping.
10. **Autodiscovery**: a card can enable or disable it, and the inherited
    configuration applies otherwise.
11. **The definition of a card**: inside the namespace root, a card extension,
    outside any nested vault, valid UTF-8.
12. **Name ordering**: candidates and diagnostics are ordered by Unicode code
    point (not UTF-16 unit, not locale).
13. **Grammar**: `:` and `\` reserved, `.` and `..` only in relative
    references, an unclosed `[[` is text, whitespace trimmed around a
    page reference, and the `import` grammar's spacing rules (with card 0018).

## Steps

1. For each item, check Python, Rust (where it resolves), and TypeScript, and
   record which ones disagree.
2. Fix each disagreement against the text, never the other way round.
3. Pin each item with a shared case, or a unit test where the case format
   can't express it.

## Done when

All three suites pass with a case or test for every item above, and the
ledgers hold no entry for any of them.

## Closed

Closed on 2026-11-24. All 13 items hold in Python, TypeScript, and, where it
resolves, Rust, each pinned by a shared case or a unit test. The fixes:
anchors from `^` (Carol), HMD008 depth and position, frontmatter positions,
messages left out of the comparison, and `nav` validated in TypeScript
(Bob), and cycles by identity and imported paths that cross the boundary
(Dave). The ledgers hold no entry for any item. TypeScript's remaining entry,
`publication-private-link`, belongs to its unported publication model,
which the release card lists as a known gap.
