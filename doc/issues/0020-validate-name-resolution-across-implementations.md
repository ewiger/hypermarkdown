# 0020 — Validate name resolution across Python, Rust, and TypeScript

**Column**: todo
**Opened**: 2026-11-24
**Related**: [the format's tracker](../status/lang.md),
[the release card](0016-prepare-the-0-1-specification-release.md),
[issue 0017](archive/0017-verify-path-suffix-resolution.md),
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

Issue 0017, path-suffix matching, is closed into this card; it is one row of
the acceptance criteria.

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

## Discrepancies found

Found by running the cases in all three implementations, against the
corrected text. A cross marks the implementations that had it.

| Discrepancy | Python | TypeScript | Rust |
| --- | --- | --- | --- |
| **Explicit extension in Phase 0.** A named import is returned whatever extension the reference wrote | ✗ | ✗ | ✗ |
| **Direct directory references.** `[[./]]` binds `<parent>/<dir>.hmd` before the directory's folder note | ✗ | ✗ | ✗ |
| **`..` in an absolute path.** `[[/a/../top]]` reads as missing. Since decided: `.` and `..` belong to relative references alone, so it is HMD010, and a relative reference whose last component is `.` or `..` names a directory | ✗ | ✗ | ✗ |
| **An explicit extension in the recursive search.** `[[z.markdown]]` does not reach a shadowed `z.markdown` | ✗ | ✗ | ✗ |
| **Duplicate search paths.** Importing one directory twice reports its card as shadowed by itself (HMD016) | ✗ | ✗ | |
| **A folder note in the recursive search.** With `a/foo.hmd` and `a/foo/index.hmd`, `[[foo]]` from a sibling module is HMD002 with both as candidates. The card shadows the note when the note is matched by its directory's name, so the only candidate is `a/foo.hmd`; `[[foo/index]]` still reaches the note | ✗ | ✗ | ✗ |
| **A symbolic link out of the root** is read as a card, and a path through a linked directory reads as missing instead of `Escapes` | ✗ | ✗ | ✗ |
| **A nested vault.** A path into one is HMD001 instead of HMD003, `Unresolved` instead of `Escapes` in Rust | ✗ | ✗ | ✗ |
| **Candidate order.** Candidates sort by UTF-16 code unit, so a character outside the Basic Multilingual Plane comes before U+FF51 | | ✗ | |
| **The root's folder note.** `[[./]]` and `[[../]]` cannot reach it | | ✗ | |

Rust emits no diagnostics: the crate is a resolver. Its runner used to
compare resolutions only, where a missing card and a path out of the
namespace both read as a null target; it now also compares each reference's
outcome with the case's HMD001, HMD002, or HMD003. HMD016 stays in its
ledger, since the crate reports no shadowed search path.

Hosts now say which entries are links out of the root: `DirEntry.leavesRoot`
in TypeScript, set by the test host and by the VS Code extension's host on
`file:` roots, and `EntryKind::LeavesRoot` in Rust. A link inside the root to
a file is read as the file; a link to a directory is not walked.

## Coverage

| Acceptance criterion | Case |
| --- | --- |
| Absolute and explicit relative references | `resolve-absolute-relative` |
| Resolution relative to the source document | `resolve-absolute-relative`, `resolve-directory-references` |
| Unix-style path separators | `resolve-unix-separators` |
| Explicit extension selection in every phase | `resolve-explicit-extension`, `resolve-named-import` |
| Extension priority and shadowed cards | `resolve-extension-priority` |
| A card colliding with a folder note | `resolve-folder-note-collision` |
| `[[./]]` and `[[../]]` | `resolve-directory-references`, `resolve-folder-note-collision` |
| Named import precedence | `resolve-named-import` |
| Wildcard import precedence and HMD016 | `resolve-wildcard-import` |
| Single- and multi-component suffix matching | `resolve-path-suffix` |
| Both recursive discovery modes | `resolve-mode-recursive`; `both` in every other case |
| Disabled autodiscovery | `resolve-autodiscovery-off`, `resolve-autodiscovery-off-project` |
| Ambiguity and candidate order | `resolve-ambiguous-order` |
| Containment and symbolic links | `resolve-containment-symlinks`, `resolve-absolute-relative` |
| Nested vault isolation | `resolve-nested-vault` |
| Unicode NFC | `resolve-unicode-nfc` |
| Heading and block fragments | `resolve-fragments` |
| Duplicate candidate elimination | `resolve-duplicate-candidates`, `resolve-wildcard-import` |

Issue 0017 is closed into this card: `resolve-path-suffix` holds its cases.

## Out of scope

Changing the resolution precedence.
