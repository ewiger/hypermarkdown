# HMD-0031 — Platforms

Names and paths whose resolution depends on the filesystem the tree sits on,
against a specification that requires the same result on every platform.

## Case is not stated

**What the text says.** A name in a reference and a name on disk are compared
after both are normalised to NFC. Determinism requires the same resolutions on
whichever platform. Nothing is said about letter case.

**Why it matters.** On a case-insensitive filesystem, the default on macOS and
Windows, an implementation that asks the filesystem whether `Alice.hmd` exists
is told yes when the file is `alice.hmd`. On Linux the same link is a forward
reference. The tree is identical; the result is not.

**Candidate resolutions.**

- **Exact comparison everywhere.** After NFC, names compare exactly, case
  included. An implementation on a case-insensitive filesystem reads the
  directory and compares names itself rather than asking whether a path
  exists. Existing links that relied on the filesystem become HMD001.
- **Case-insensitive comparison everywhere.** Names compare after case
  folding, as heading keys do. Then two cards differing only in case collide,
  and need a diagnostic of their own.
- Either way, a reference that would match only under the other rule could
  get a hint, so the change is diagnosable.

## Card identity is implied, not stated

**What the text says.** Diagnostics carry a root-relative path with POSIX
separators, and candidate lists are sorted by it. Nothing says that this path
is a card's identity everywhere else, in resolutions and expansions.

**Why it matters.** A Windows implementation could report `docs\owl.hmd`, or a
drive-qualified path, in a resolution and pass every check on diagnostics.

**Candidate resolution.** A card's identity is its root-relative POSIX path
after NFC, in every result; no native form appears in one.

## Symbolic links

**What the text says.** Path normalisation happens before the containment
check, and symbolic links are not followed out of the root.

**Why it matters.** The rule is stated and untested. A link inside the root
that points elsewhere inside the root is not addressed: is it a second card at
a second path, or not a card?

## Open questions

- Are names compared case-sensitively or case-insensitively, on every
  platform?
- Does a reference that matches only by the other rule get a diagnostic or a
  hint, and with which identifier?
- Is a symbolic link that stays inside the root a card at its own path?
- Can the corpus cover symbolic links and case-only names on every runner's
  platform, or are those cases skipped where the filesystem cannot hold them?
