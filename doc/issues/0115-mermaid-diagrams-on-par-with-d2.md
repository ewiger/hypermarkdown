# 0115 — Mermaid diagrams, on par with D2

**Column**: todo
**Opened**: 2026-11-22
**Related**: [HMD-0022](../proposals/HMD-0022/README.md), [the D2 card](archive/0004-math-callouts-diagrams.md), [the toolchain card](archive/0107-toolchain-repository-for-native-binaries.md), [the diagram surface card](0102-diagram-theme-surface.md)

## What

A ```` ```mermaid ```` fence is a diagram, with the same standing as a
```` ```d2 ```` fence, in every tool and on every surface where D2 draws today.
Mermaid is open source, it is the diagram language most Markdown readers already
know, and GitHub, GitLab, and Obsidian draw it natively. A card written elsewhere
with a Mermaid block should draw here too, not fall back to code.

**On par** means there is nothing D2 gets that Mermaid does not:

| | D2 today | Mermaid after this |
| --- | --- | --- |
| The format | a ```` ```d2 ```` fence is a diagram, its body opaque to the resolver | the same for ```` ```mermaid ```` |
| The TypeScript implementation | `DiagramBlock` with `language: "d2"` | `DiagramBlock` with `language: "mermaid"` |
| The site build | `diagram.py` renders through the `d2` binary | the same module renders through a Mermaid renderer |
| The editor preview | the `d2` bundled in the toolchain, then `PATH` | a bundled Mermaid renderer, then `PATH` |
| The toolchain | `d2` pinned per platform in `toolchain.json` | the Mermaid renderer pinned beside it |
| CI | checks `d2 --version` | checks the Mermaid renderer the same way |
| Delivery | SVG as a `data:` URI `<img>` | the same |
| Bounds | 64 KiB of source, 2 s per render, 64 cache entries | the same numbers, or a stated reason why not |
| Degraded state | the source, labelled, with the reason | the same |
| Syntax highlighting | plain body | plain body |
| The public pages and the README | D2 listed with the rich content | Mermaid listed beside it |

## Why now

HQL already writes Mermaid. Its `| mermaid` format step emits a fenced
`mermaid` block (see [the cell output page](../public/cell-output.md)), and
every preview and site build then shows that output as code. One half of the
toolchain produces a diagram that the other half refuses to draw.

## This reverses a decision

Mermaid was rejected as "superseded by D2" when the format was first sketched,
and four places still say so. Each has to change in the same pass, or the
specification will contradict the tools:

- [the source sketch](../models/requirements/initial_sketch.md), under its list
  of free syntax: "Explicitly excluded: … Mermaid (superseded by D2)".
- [HMD-0001](../proposals/HMD-0001/README.md), in its grammar: Mermaid is
  excluded from the MVP grammar as rejected by the source.
- [HMD-0022](../proposals/HMD-0022/README.md), in its non-goals. Its open
  question about whether `DiagramBlock` should take another fence language once
  one is real gets its answer here.
- [the feature list](../wiki/hmd-feature-list.hmd): F23 goes from `rejected` to
  `shipped`.

D2 does not become second to Mermaid. Both are first-class, and neither is the
default.

## The hard part is the renderer

D2 is a single Go binary, which is why it fits the toolchain repository and the
2-second bound. Mermaid is a JavaScript library that lays out text through a
browser, and its reference CLI, `mmdc` from `@mermaid-js/mermaid-cli`, drives a
headless Chromium. Options, in the order to evaluate them:

1. **A single native renderer**, if one exists that draws Mermaid faithfully
   enough. Fits the toolchain repository as it is, and fits the shared bounds.
   Coverage of Mermaid's diagram types has to be measured, not assumed.
2. **`mmdc` in the toolchain**, with Node and a pinned Chromium. Faithful, since
   it is Mermaid itself. Costs hundreds of megabytes per platform in the VSIX
   and a cold start that will not fit in 2 seconds. Docker
   (`minlag/mermaid-cli`) as the fallback, mirroring how D2 started.
3. **Render inside the webview with `mermaid.js`, then hand the SVG back as a
   `data:` URI `<img>`.** Smallest install for the editor. But it puts
   diagram source into a script context in the preview, which the security
   section of HMD-0022 is written to prevent, and it does nothing for the
   site build, which has no browser. It would need its own security argument,
   and the site would still need options 1 or 2.

Whichever is chosen applies to both lines. A diagram drawn by one renderer in the
editor and another on the site would break parity with itself.

## Questions the proposal has to answer

- **Bounds.** Do the shared numbers hold for Mermaid, or does Mermaid get its own
  timeout the way the Docker fallback got 20 seconds? The numbers stay shared
  between the two implementations either way.
- **Security level.** Mermaid has `click` directives, links, and HTML labels.
  Inside an `<img>` none of them run, so the stated cost carries over:
  diagrams are not interactive. The renderer should run with
  `securityLevel: "strict"` anyway. Check whether HTML labels, which Mermaid
  draws as `foreignObject`, still show in an `<img>`; if they do not,
  `htmlLabels: false`.
- **Theme.** Mermaid ships a dark theme, so the white-surface question of
  [the diagram surface card](0102-diagram-theme-surface.md) has a second
  engine. The answer should cover both.
- **Configuration in the fence.** Mermaid accepts `%%{init: …}%%` directives and
  frontmatter config inside the body. Is that honoured, filtered, or refused?
- **Versions.** Pin the Mermaid version in `toolchain.json` beside `d2`, bumped
  in the toolchain repository like every other binary.
- **The cover's live editor** shows a diagram as its text, D2 included. Mermaid
  gets the same treatment and nothing more, unless option 3 is chosen. In that
  case the browser demo could draw it, and that has to be a decision, not a side
  effect.

## Done when

- A proposal for the renderer (a new one, or an amendment to HMD-0022) is
  accepted, and it answers the renderer choice and the questions above. Which
  fence draws is already answered by HMD-0030: a `mermaid#show` cell, while a
  plain `mermaid` fence is a listing. That also means a Mermaid block written
  for GitHub or Obsidian shows as code here until its fence is renamed.
- `DIAGRAM_LANGUAGES` in `tools/hmd-ts-core/src/diagram/fence.ts` and
  `LANGUAGES` in `tools/hmd/src/hypermarkdown/diagram.py` both contain
  `mermaid`. The engines draw it, and the degraded state reads the same as for
  D2.
- The toolchain pins the renderer, the VSIX carries it, and CI checks it.
- The tests of the D2 card and of HMD-0022 exist for Mermaid as well: fence
  detection, the cache key, the placeholder with its reason, base64 delivery of
  hostile SVG, and a real site build with an embedded Mermaid diagram.
- The four places listed above, the README, the features page, and the tools
  pages say Mermaid alongside D2.
