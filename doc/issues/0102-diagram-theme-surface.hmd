# 0102 — Diagrams render on a white surface in every theme

**Column**: backlog
**Opened**: 2026-08-07

## Symptom

A rendered `d2` diagram sits on a white background regardless of the editor
theme. In a dark theme it is a bright rectangle in a dark card — readable, and
visibly foreign.

## Cause

`d2`'s default palette is drawn for light backgrounds. One rendered SVG carries
one palette, and the preview shows the SVG it was given. The white surface is
deliberate: it is the alternative to inverting the image, which would distort
every colour the diagram's author chose.

## Options

1. **Render twice**, once with `--theme` and once with `--dark-theme`, and pick
   by `window.activeColorTheme.kind`. Correct. Doubles render time and cache
   entries, and the cache key of HMD-0022 §3 has to grow a theme component.
2. **Render on demand at theme-switch time.** Same correctness, no doubled
   cache, at the cost of a visible re-render when the user changes theme.
3. **Keep the white surface.** What ships today.

## Why it is not urgent

A diagram is legible in all three cases. This is a polish item that becomes
worth doing when someone works in a dark theme all day and finds it grating —
and that judgement is worth waiting for rather than guessing.

## Done when

Whichever option is chosen, HMD-0022's Open Questions loses the theme entry and
gains a decision.
