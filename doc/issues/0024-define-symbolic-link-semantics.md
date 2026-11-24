# 0024 — Define symbolic link semantics

**Column**: backlog
**Opened**: 2026-11-24
**Related**: [the format's tracker](../status/lang.md),
[[hmd-lang-spec#the-namespace]], [[hmd-lang-spec#name-resolution]]

## What

The specification forbids following a symbolic link out of the namespace
root. It says nothing else about links, so two implementations can disagree
on a tree that contains one. This is the one deliberately open decision of
the 0.1 batch. The specification stays as it is until the user approves a
proposal.

## Scope

Investigate and report current behavior in Python, Rust, and TypeScript for:

- symbolic links pointing within the same namespace;
- symbolic links pointing outside the namespace;
- symbolic links crossing nested vault boundaries;
- symbolic link cycles;
- duplicate paths referring to the same physical card, and which path a
  resolution or a candidate list reports;
- consistency across operating systems.

Then propose consistent, platform-independent rules that define predictable
behavior without unnecessarily restricting legitimate filesystem
organization.

## Done when

The user has approved a rule for each case above, it is in the
specification, and each case has a shared test.
