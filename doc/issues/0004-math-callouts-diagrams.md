# 0004 — Math, callouts, and D2 diagrams

**Column**: done
**Opened**: 2026-08-07
**Closed**: 2026-08-07
**Related**: [HMD-0022](../proposals/HMD-0002/README.md) on the editor branch

## What

The three pieces of "free" syntax from HMD-0001 §9 that were enabled in
configuration but not actually working on the site.

| | Was | Now |
| --- | --- | --- |
| Callouts | worked, untested, undemonstrated | tested and shown |
| Math | `arithmatex` marked the spans, nothing typeset them | MathJax loads and typesets |
| D2 | a `d2` fence was an anonymous code block | rendered, or a labelled placeholder |

## What HMD-0022 contributes

HMD-0022 belongs to the TypeScript implementation and its §1 no-subprocess rule does not
apply here: a site build has a build step and no webview, so the `d2` binary
stays the engine. What carries across is the semantics its §7 fixes, so the two
lines do not drift into disagreeing about what a diagram *is*:

- A `d2` fence is a diagram; its body is opaque to the resolver and produces no
  links and no graph edges. The scanner already guaranteed this by masking
  fences.
- A missing engine degrades to a labelled placeholder showing the source — never
  a blank, never a build failure (§5). A diagram that is merely not drawn is not
  a defect in the card.
- A failure is shown *with* the source, not instead of it.
- Rendered SVG reaches the page as a `data:` URI `<img>`, never as inline markup
  (§6). Diagram source comes from a cloned repository and SVG is a scripting
  context; an `<img>` cannot execute its payload.
- The bounds are shared verbatim: 2s per render, 64 KiB of source, 64 cache
  entries (§4).

The difference between the lines is one of engine, not of semantics.

## Decisions

- **No `mkdocs-d2-plugin`.** It fails a build when the binary is absent and
  inlines the SVG as markup. Both are wrong for the reasons above, and the
  replacement is ~120 lines.
- **d2 is a real local dependency, not an optional nicety.** CI takes the binary
  from the published image so every run pins one version.
- **MathJax loads from a CDN.** The only runtime network dependency the site
  has; the build itself stays offline.

## Guard

`tests/test_diagram.py` covers the bounds, the cache, the placeholder, and that
hostile SVG reaches the DOM base64-encoded rather than as markup.
`tests/test_mkdocs.py` asserts callouts, math spans, and diagrams survive a real
build, including a diagram embedded from another card.
