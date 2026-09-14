# HMD-NNNN: <Title>

**Status**: drafted | accepted | rejected | withdrawn
**Created**: YYYY-MM-DD
**Source**: [document this record was derived from](<path>)

<!--
ADR-style proposal skeleton. Copy to doc/proposals/HMD-NNNN/README.md and
reserve the ID in doc/proposals/README.md. Fill each section; delete the guidance
comments and any section that genuinely does not apply. House rules:
  - Do NOT create a sibling tracker. Work is tracked per tool, in doc/status/ —
    lang.md, hmd.md, ts-core.md, vsc-ext.md, pages.md — and those files are the
    only place it is tracked: not doc/memory/, not doc/wiki/, not this record.
    Add rows to whichever tracker owns the code, citing this proposal, and list
    them in the Progress column of doc/proposals/README.md. Each tracker carries
    Done, then a TODO split into planned work / broken / limitations / open
    questions and blockers. This file records the decision; the tracker records
    the state. See doc/wiki/tracking.hmd.
  - Never write progress into this record. A spec section says what the system
    MUST do, in the present tense, whether or not it is built yet.
  - Normative statements use RFC 2119 keywords in CAPS: MUST, MUST NOT, SHOULD, MAY.
    Reserve them for real requirements; use plain prose for rationale.
  - Pin critical values exactly (hex, byte layout, sizes with units, digests). Never
    leave one "TBD" in an accepted record — if unknown, it lives under Open Questions.
  - Put wire formats, formulas, and step algorithms in ```text fences.
  - State a rule, then justify it in the next sentence.
  - Link shared workflow/build/style docs; do not paste them in.
  - A record is a COMPLETE TEXT. State plainly what the thing is and what it does.
    Do not thread the prose with identifiers — feature IDs (F21), question IDs (Q7),
    section refs (§5.3), sketch requirement numbers, or links to sibling proposals —
    in place of saying the thing. Restate the constraint instead of citing where it
    lives. An identifier may follow a claim so a reader can find the row; it may
    never BE the claim. Collect surviving pointers into one "See also" section at
    the end, plus footnotes if needed. A reader must never need archeology across
    several files to parse a sentence. Trackers under doc/status/ are exempt — their
    tables are lists of IDs by nature.
-->

## Companion notes
<!-- Optional. One bullet per sibling doc, each saying what it covers. Omit if none. -->

- [`some-note.md`](some-note.md) — what this companion document defines.

## Abstract
One dense paragraph, present tense, stating *what changes*. No motivation, no selling.

## Motivation
Why the change is needed, and why now. Enumerate the concrete purposes:

- purpose one
- purpose two

Call out domain-specific risk (compatibility, security, operational, data loss)
when relevant.

## Goals
<!-- Optional. Delete if the Abstract already bounds scope. -->

- what this proposal sets out to guarantee

## Non-goals
<!-- Optional but recommended when scope is easy to over-read. -->

- what this proposal explicitly does NOT do

## Specification
Normative description of behavior and constants. Break into subsections titled by
what they cover, not by number — a named heading survives an edit and reads on its
own, while "§5.3" sends the reader to another file to find out what it meant. Open
each with a one-line framing sentence, then state rules as bullets.

### <First rule area>
Framing sentence.

- Rule stated with MUST / SHOULD / MAY, then its rationale.

Serialization layouts, formulas, and algorithms go in fences:

```text
field_a | field_b | field_c | field_d
```

### <Second rule area>
Constants are pinned to exact values:

- identifier: `<identifier>`
- size: `16 MiB` (`16777216` bytes)
- digest: `<hex>`

## Backwards Compatibility
What breaks, what stays compatible, and any migration requirements.

## Security Considerations
Threat-model changes, new attack surface, and mitigations. Include resource bounds
(allocation limits, rate limits) for any new verifier or serving surface.

## Deployment / Activation
How the change rolls out, as an ordered list (flags, staged environments, the
activation point, compatibility windows):

1. implement behind a feature flag
2. deploy verification and deterministic test fixtures
3. activate in a staging environment at a defined point
4. only then activate in production

## Reference Implementation
The real files/modules to change and the tests to add:

- `src/<module>` for <what>
- unit and integration tests covering <what>
- any tooling needed to regenerate fixtures

## Test Plan
Concrete coverage. Name the suites and commands; link the shared build/test docs.

Unit tests MUST include:

- deterministic cases covering each rule and its boundaries

Integration tests MUST include:

- an end-to-end scenario, and rejection of the wrong case with the exact error
  reason `<reason>`

```bash
<build command>
<run the relevant test suite>
```

## Open Questions
Every unresolved decision, each phrased as a question. These MUST be resolved (values
"frozen") before Status moves from drafted to accepted. Mirror them in the owning tracker under
*Open questions and blockers*, which is where they are worked; this list is the
normative one.

- What exact value should `<constant>` take?
- <other open decision>

## Changelog
Dated bullets mirroring status transitions.

- YYYY-MM-DD: drafted
