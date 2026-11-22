# 0015 — CommonMark's own examples as a test dataset

**Column**: todo
**Opened**: 2026-11-22
**Related**: [the format's tracker](../status/lang.md),
[CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/)

## Decided

Taken on 2026-11-22, while preparing the 0.1 release:

- **The baseline is CommonMark 0.31.2**, and the specification names it
  without explaining it.
- **Conformance to that baseline is tested, not described.** This card is how.
- **It is a parallel track.** The 0.1 release does not wait on it.

## What

CommonMark's specification is prose, but it embeds about 650 numbered
examples, each a Markdown input with its exact expected HTML. Every serious
parser runs them as its conformance suite. HyperMarkDown does not, so nothing
checks that its scanner agrees with CommonMark about what is code and what is
text.

The scanner masks code spans, fenced code, and HTML comments before it looks
for links. If it masks a region CommonMark does not consider code, or misses
one it does, a link appears or disappears where it should not. The
specification admits this as a known divergence; this card measures it.

## Steps

1. **Vendor the examples** in a folder of their own, with their own licence
   file: they are CC BY-SA 4.0, and the conformance corpus is MIT.
2. **Add a masking oracle.** For each example, compare the regions the
   scanner masks with the code and HTML regions a reference parser reports.
   Every mismatch is a bug in the scanner, or a case the specification has to
   rule on.
3. **Check that nothing appears from nowhere.** An example with no `[[` must
   yield no HyperMarkDown construct at all.
4. **Fuzz.** Generate inputs, run the same comparison, and minimise every
   mismatch into a readable case.
5. **Later: differential testing across parsers** — cmark, commonmark.js,
   markdown-it, pulldown-cmark — keeping each disagreement as a case, with the
   reference parser's branch coverage as the measure of completeness.

Step 5, and defining the constructs over the CommonMark parse instead of a
masked scan, are separate backlog rows in the format's tracker.

## Done when

- The examples run in CI against the canonical scanner and the TypeScript
  one, with the masking oracle and the no-construct check.
- Every mismatch found is either fixed or recorded as a case the
  specification rules on.
