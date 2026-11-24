# 0020 — Validate name resolution across Python, Rust, and TypeScript

**Column**: todo
**Opened**: 2026-11-24
**Related**: [the format's tracker](../status/lang.md),
[the release card](0016-prepare-the-0-1-specification-release.md),
[issue 0017](0017-verify-path-suffix-resolution.md),
[[hmd-lang-spec#resolution-algorithm]],
[[hmd-lang-spec#resolving-a-reference-within-a-directory]],
[[hmd-lang-spec#rules-the-algorithm-must-satisfy]],
[the conformance corpus](../../examples/conformance/README.md)

## What

The specification's resolution algorithm was corrected on 2026-11-24 so that
its pseudocode agrees with its normative rules. The precedence is unchanged.
What changed:

- a written card extension reaches every phase;
- `[[./]]` and `[[../]]` resolve only to a folder note;
- a boundary violation is `Escapes` in every phase, never a missing card;
- a named import whose card has another extension falls through to the next
  phase;
- every imported search path is probed, so HMD016 names each shadowed card;
- two paths or names reaching one card are one candidate.

The corrected algorithm was reviewed by reading it, not by running it. Make
all three implementations produce the same resolutions and diagnostics for it.
The specification is authoritative: no implementation defines the expected
behaviour.

Issue 0017 covers path-suffix matching, which is one row of this card. Its
cases count here too.

## Acceptance criteria

The shared corpus has passing cases in all three implementations for:

- absolute and explicit relative references;
- resolution relative to the source document;
- Unix-style path separators on every platform;
- explicit extension selection in every resolution phase;
- extension priority and shadowed cards;
- an ordinary card colliding with a folder note;
- direct directory references, `[[./]]` and `[[../]]`;
- named import precedence;
- wildcard import precedence and HMD016;
- single-component and multi-component suffix matching;
- both recursive discovery modes;
- disabled autodiscovery;
- ambiguous references, with deterministic candidate order;
- namespace containment and symbolic links;
- nested vault isolation;
- Unicode NFC normalisation;
- heading and block fragment resolution;
- duplicate candidate elimination.

## Approach

1. Extend `examples/conformance/cases/`. Every case states its tree, source
   document, configuration, reference, expected resolution, and expected
   diagnostics.
2. Run the same cases against Python, Rust, and TypeScript.
3. Fix each discrepancy in the implementation. Record each ambiguity in the
   specification as an open question in the format's tracker.

The expected results come from the specification, not from the canonical
implementation's output. Today every `expected.json` is generated from Python,
so a case that tests a correction must be written from the text and checked
by hand.

## Known discrepancies

Found by reading the canonical implementation, `resolve.py`, against the
corrected text. None is fixed yet.

- **Explicit extension in Phase 0.** A named import is returned whatever
  extension the reference wrote.
- **Direct directory references.** `[[./]]` binds `<parent>/<dir>.hmd` before
  the directory's folder note.
- **Escapes in an absolute path.** `[[/a/../../x]]` is not normalised before
  binding, so it reads as unresolved instead of `Escapes`.
- **Duplicate search paths.** Importing one directory twice reports its card
  as shadowed by itself (HMD016).
- **A folder note in the recursive search.** `[[foo]]`, reached from a sibling
  module when `a/foo.hmd` and `a/foo/index.hmd` both exist, is HMD002 with
  both as candidates, on top of HMD012. The card shadows the module's folder
  note in every phase, so the only candidate is `a/foo.hmd`, and the pair is
  reported once, as HMD012, now a warning.

The Rust crate and the TypeScript implementation have not been read for this
card.

## Out of scope

Changing the resolution precedence.
