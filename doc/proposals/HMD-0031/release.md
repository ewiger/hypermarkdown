# HMD-0031 — Release

What the release itself has to settle: what may change after the tag, what is
frozen together, and questions that would otherwise be answered by whichever
tool ships first.

## What may change after the tag

**What the text says.** The version changes when the constructs change, and
nothing else moves it. Each version's changes are recorded in the language's
changelog. Diagnostic identifiers are never renumbered once released.

**Why it matters.** The extension erratum in [`errata.md`](errata.md) changes
no construct, yet an implementation that followed the pseudocode behaves
differently afterwards. The text does not say whether such a fix is part of
0.1, a 0.1 revision, or 0.2.

**Candidate resolution.** A change that alters no corpus result and no stated
behaviour is an erratum to 0.1. A change that alters a result, adds a
construct, or adds a diagnostic is a new version. The open part is how an
erratum is named.

## What is frozen together

The release card lists dating 0.1 in the changelog, tagging it, giving the
specification a stable address, and correcting the roadmap, which still calls
1.0 the first version. The corpus is the other half of the contract, and is
not in that list. Tagging the specification, the corpus, and the changelog
together, at one commit, makes "conforms to 0.1" mean one thing.

## The site does not render CommonMark

**What the release card says.** The site renders with Python-Markdown, which
keeps older Markdown rules such as four-space list indentation, and will
likely fail many of CommonMark's examples. Once the baseline is declared,
either the canonical renderer moves to a CommonMark-compliant one, or the
specification says that for 0.1 only scanning has to agree with CommonMark.

**Why it matters.** The specification now names CommonMark 0.31.2 as the
baseline for every piece of inherited syntax it does not restate. The project's
own site then disagrees with the baseline on ordinary input.

## The heading anchor's embed

**What the tracker asks.** An anchor at the end of a heading's line names that
heading and is not part of its text. Does `![[card#^setup-linux]]` expand the
heading's whole section, as a heading fragment does, or only the heading line,
as any other block anchor would?

**Why it matters for 0.1.** The specification now recommends exactly that
anchor as the remedy for HMD011. A recommended remedy whose embed behaviour is
undecided will be decided by the first implementation to meet it.

## Readability

The release card proposes nine readability actions, from rewriting the
introduction to adding a glossary, and they await confirmation one by one.
They change no meaning and are listed here only so the inventory is complete.

## Open questions

- Is an erratum published as a numbered revision, such as 0.1.1, or as a dated
  entry under 0.1 in the changelog?
- Is the corpus tagged with the specification?
- Does the site move to a CommonMark renderer, or does 0.1 say only scanning
  must agree with CommonMark?
- Does an embed of a heading's anchor expand the section or the line?
- Which readability actions belong to 0.1?
