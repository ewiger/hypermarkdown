# 0018 — Validate the grammar

**Column**: todo
**Opened**: 2026-11-24
**Related**: [the format's tracker](../status/lang.md),
[the release card](0016-prepare-the-0-1-specification-release.md),
[[hmd-lang-spec#grammar]], [[hmd-lang-spec#lexical-model]],
[the conformance corpus](../../examples/conformance/README.md)

## What

A release requirement for 0.1, kept separate from the specification's prose
and from the corpus that exists today.

The *Grammar* section states the format's constructs as productions, and the
prose around them adds rules the productions do not express. Nothing checks
that the productions and the prose say the same thing. Nothing checks either
that the three implementations recognise what the productions admit and reject
what they exclude.

The corpus cannot show this today. Each case is a whole tree, and
`expected.json` holds only diagnostics and resolutions. What the scanner
recognised, how it split a reference into its parts, and where each part sits
in the source are never compared. The Rust runner compares resolutions only.
A grammar disagreement is visible only when it happens to change a diagnostic
or a resolution.

## Scope

Every production in *Grammar*: `embed`, `wikilink`, `target`, `page_ref`,
`absolute`, `relative`, `path_component`, `unqualified`, `bare_name`,
`unqualified_path`, `segment`, `reserved`, `fragment`, `heading_text`,
`heading_first`, `heading_char`, `block_id`, and `display`. Also the syntax
defined in prose: *Block anchors*, *Frontmatter block*, and the masked regions
of *Lexical model*, since masking decides what is recognised at all.

Rendering is out of scope.

## Steps

1. **Validate every production against the normative prose.** For each one,
   record whether the production and the prose around it agree. Record each
   rule the prose adds that the production does not express, such as a
   non-empty `heading_text`, a non-empty `display`, or the stripped card
   extension.
2. **Write language-neutral positive and negative cases for every
   production**, including the boundaries: each reserved character in each
   position, empty components, `./` and `../` alone, the length limit of
   `block_id`, and a construct inside and beside each masked region.
3. **Run the same cases against Python, TypeScript, and Rust.**
4. **Compare, independently of rendering:**
   - the syntax recognised: which construct, or none;
   - the parsed reference components: the kind of page reference, its path
     components, the card extension, the fragment kind and text, and the
     display;
   - source positions: the byte offsets, line, and code-point column of each
     construct;
   - diagnostics, HMD010 in particular.
5. **Correct each discrepancy** in the grammar or in the implementation,
   whichever is wrong, and record which one it was.

## Open

- **Where the expected output comes from.** Every `expected.json` in the corpus
  today is generated from the canonical implementation. For grammar cases the
  expected output has to come from the productions and the prose. Otherwise
  step 5 can never find the canonical implementation wrong. Decide whether
  these cases are written by hand and reviewed, and how that fits the corpus's
  rule on canonicity.
- **The shape of a grammar case.** Most of these cases need one card and no
  tree. They also need an output the current `expected.json` does not have.
  Decide whether that output goes into a new file beside it or into a separate
  kind of case. Also decide what each runner must expose to produce it,
  including the Rust crate, which emits no diagnostics.

## Done when

- Every production has a recorded verdict against the prose, and every
  disagreement found is corrected.
- Every production has positive and negative cases in the corpus.
- All three implementations pass those cases on recognised syntax, components,
  and positions, and Python and TypeScript also pass them on diagnostics. Any
  remaining difference is a ledger entry that says where it is tracked.
