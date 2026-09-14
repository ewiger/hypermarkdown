# 0101 — The live-editing behaviours are only checked by hand

**Column**: backlog
**Opened**: 2026-08-07

## What

Four behaviours are specified, implemented, and verified only by a human opening
the Extension Development Host. Each is a plausible silent regression.

| Check | Specified by | Automated today |
| --- | --- | --- |
| Editing a `d2` fence to something invalid shows the compiler's own error beside the source | HMD-0022 §2 | the *state* is tested; the live edit path is not |
| Typing `$n$` typesets without a save | VSX-013 | the *typesetting* is tested; the unsaved-buffer path is not |
| `I have $5 and you have $10` stays prose | HMD-0020 §3.3 | yes, unit-tested |
| Collapsing a callout and editing above it leaves it collapsed | VSX-019 | no — and it is broken, see [0100](0100-callout-open-state-lost.md) |

The pattern is that the *pure* half of each behaviour has a unit test and the
*live* half — buffer to preview, without a save — has none. That half is where
the interesting failures are, and it is exactly what the integration suite
parked on `feat/vsc-ext-1` was written to cover.

## Why

Writing [0100](0100-callout-open-state-lost.md) took a probe under jsdom to confirm, and the probe found the bug in
one run. The behaviours in this table are one step further out than jsdom can
reach: they need a real editor with a real unsaved buffer.

Every one of them is the sort of defect that survives a release, because the
feature demonstrably works when you check it once by hand and the failure only
appears on the second keystroke.

## Done when

- The integration suite is unparked and running in CI (see
  `doc/status/vsc-ext.md`, E5.2).
- It covers each row above end to end: edit an unsaved buffer, assert what the
  preview holds.
- `tools/hmd-vsc-ext/DEVELOP.md`'s manual walkthrough shrinks to the things a
  human should still eyeball — layout, theming, whether it feels fast.

## Depends on

`@vscode/test-electron` running on a Linux CI runner, which is where neither of
its macOS blockers exists.
