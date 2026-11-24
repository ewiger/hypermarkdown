# 0019 — Review lexical compatibility with CommonMark

**Column**: todo
**Opened**: 2026-11-24
**Related**: [the format's tracker](../status/lang.md),
[issue 0015](0015-commonmark-examples-as-a-test-dataset.md),
[issue 0018](0018-validate-the-grammar.md),
[[hmd-lang-spec#lexical-model]], [[hmd-lang-spec#conformance-to-the-standard]]

## What

The *Lexical model* section permits a known divergence in 0.1. A line-oriented
scanner may differ from a full CommonMark parser on pathological input. Two
examples are a wikilink inside an HTML block, and a fence opened inside a
blockquote. At the same time, *Conformance to the Standard* requires
implementations to recognise the same constructs in the same document.

The two rules can conflict. If an implementation built on a full CommonMark
parser and one built on a scanner both conform, the same document may yield
different links, embeds, or anchors in each. Find out whether that is
possible, and where.

The standard does not change until a semantic decision is made. The
proofreading of 2026-11-24 left the divergence paragraph as it was for this
reason.

## Steps

1. **List the affected cases.** Start with the two the specification names,
   then look for others: HTML blocks of each CommonMark kind, fences and code
   spans inside blockquotes and list items, lazy continuation lines, and
   unclosed fences and comments.
2. **Record what each implementation does today** for every case: the
   canonical one, the TypeScript one, and the Rust crate. Compare that with
   what a CommonMark 0.31.2 reference parser reports as code, HTML, or text.
3. **Decide whether conforming implementations can disagree.** For each case,
   say whether two implementations that both follow the standard can
   recognise different syntax.
4. **Propose resolutions**: narrow the divergence to named cases, require the
   CommonMark reading, or keep it and state each permitted outcome. Weigh each
   against the cost to the existing implementations.

## Out of scope

Changing the standard, which waits on the decision. The CommonMark example
dataset ([issue 0015](0015-commonmark-examples-as-a-test-dataset.md)) is the
natural source of cases, but this card does not depend on it being finished.
