# HMD-0022: D2 diagrams

**Status**: drafted
**Created**: 2026-08-07
**Source**: [HyperMarkDown in the editor — Requirements](../../models/requirements/vscode-extension.md) (VSX-016)

## Companion notes

- [HMD-0020](../HMD-0020/README.md) — the document IR this proposal extends with
  a third block kind, and the ledger that carried D2 as a gap.
- [HMD-0021](../HMD-0021/README.md) — the webview whose content security policy
  constrains how a rendered diagram reaches the DOM.
- [`.grem/styles/doc/slides/prompt.md`](../../../.grem/styles/doc/slides/prompt.md)
  — existing house practice, which already treats `d2` as a tool the project
  installs and documents `terrastruct/d2` for machines without one.

## Abstract

`d2` is a command-line tool this project depends on. This proposal adds a
`DiagramBlock` to the document IR behind an `irVersion` bump to `2`, has the
core recognise a ```` ```d2 ```` fence and carry its source without rendering it,
and has the consumer that *can* run a process render it — `d2` on `PATH`, then
`docker run terrastruct/d2` — caching by source and degrading to the fence's
source with a stated reason when neither is installed. Rendered SVG reaches the
DOM as a `data:` URI `<img>`, so diagram source from a cloned repository cannot
execute script in a webview. Source size, render timeout, and cache size are
pinned and shared with the Python implementation. The interactive graph view stays a
separate renderer with a separate job.

## Motivation

Every other item in sketch 11–17 is a library. D2 is a Go program, and pretending
otherwise costs more than accepting it.

- **The dependency is already accepted.** The slides style compiles `.d2` with
  `d2`, rasterises with `rsvg-convert`, and documents `terrastruct/d2:latest`
  for machines without a local install. The toolchain question was settled
  before this proposal existed; what was missing was saying so.
- **The alternatives were worse.** A bundled WebAssembly engine costs megabytes
  in the VSIX, a second version to keep aligned with the CLI, and a research
  step to find out whether a usable artifact exists. A committed-artifact
  convention — a content-addressed pool, digest stamps, staleness detection —
  costs a filesystem convention, a render command, and a class of stale-artifact
  bugs. Both were designed and both were dropped: the tool is already installed,
  so calling it is the smaller thing.
- **A reader still needs nothing.** The core runs no processes, so parsing,
  resolution, and diagnostics are untouched by any of this. Only the *drawing*
  of a diagram needs `d2`, and its absence is a legible state rather than an
  error.

**What this must not break.** A card whose diagram cannot be drawn — no `d2`, no
Docker, a syntax error in the fence — must read as "not drawn", never as blank
and never as a defect in the card.

## Goals

- One statement about where the CLI dependency is, and where it is not.
- Rendering that is bounded, cached, and identical in both lines.
- A degraded state a reader understands without being told.
- A normative fence between the diagram renderer and the graph view.

## Non-goals

- **A bundled engine**, in WebAssembly or JavaScript.
- **A committed-artifact convention.** No `.hmd/diagrams/`, no digest stamps, no
  staleness detection, no render command. Considered and dropped as more
  machinery than the problem has.
- **Changing the Python implementation**, which renders through the same binary at build
  time.
- **The interactive graph view.** HMD-0021 §10 owns it; §5 fixes the boundary.
- **Mermaid**, rejected by the source sketch as superseded by D2.

## Specification

### 1. What the core does

- A fence whose info string's first word is `d2`, case-insensitively, MUST
  produce a `DiagramBlock`. Every other fence stays an ordinary code block
  inside an `HtmlBlock`.
- The core MUST NOT render. It runs no subprocess and performs no I/O
  (HMD-0020 §1), so it cannot know whether a renderer exists — and a parser that
  needs a diagram compiler installed is a parser nobody embeds.

```text
DiagramBlock := {
  kind:     "diagram"
  key:      string
  language: string        // the info string's first word, lowercased
  source:   string        // the fence body, verbatim
  dataUri:  string | null // filled by the consumer that can render
  failure:  string | null // why there is no diagram
  span:     Span
}
```

- `Block` becomes `HtmlBlock | EmbedBlock | DiagramBlock`, and `IR_VERSION`
  becomes **2**.
- `source` MUST be carried whether or not the diagram rendered. It is what the
  consumer renders from, and what the reader sees when it cannot.
- `key` follows HMD-0020 §7: content and sibling occurrence, never the line
  number.

### 2. What the consumer does

- A consumer that can run a process SHOULD render each `DiagramBlock` and fill
  `dataUri`, or fill `failure` with a reason a human can act on.
- It MUST try, in order: `d2` on `PATH`; then
  `docker run --rm -i terrastruct/d2:latest`. The Docker fallback is what makes
  the dependency soft, and it is already the documented fallback in the slides
  style.
- A renderer that exists but rejects *this* diagram is still the renderer. Only
  a missing executable moves to the next candidate; a syntax error must not
  silently fall through to Docker and produce the same error slowly.
- With neither available, `failure` MUST name both things that were looked for.
  "No diagram renderer found" without saying what was searched for is a message
  that generates a support question instead of answering one.
- The renderer discovered MAY be remembered for the session. It cannot change
  without the user changing their machine.

### 3. Caching

- A rendered diagram MUST be cached by its **source** and nothing else. The same
  fence in two cards is one render.
- The cache MUST be bounded to **64** entries, evicted least-recently-used. An
  unbounded cache in a long-lived editor process is a leak with a slow fuse, and
  64 live diagrams in one session is not the case worth serving.
- The cache MUST be in memory. Persisting it introduces invalidation, a schema,
  and a file the user did not ask for, none of which is earned yet.

### 4. Shared bounds

Both lines refuse the same input, so a diagram that fails in a site build fails
in the editor for the same stated reason.

- **Source size: 64 KiB.** A larger fence fails before any renderer is invoked.
- **Render timeout: 2 seconds** for a local engine.
- **Cache: 64 entries**, least-recently-used.

**One deliberate exception.** The Docker fallback may pull an image on first
use, which cannot complete in two seconds. That path alone takes a **20-second**
ceiling. It is a property of the fallback, not of the format.

The Python implementation implements these in `tools/hmd/src/hypermarkdown/diagram.py`; the
TypeScript implementation exports them from `@hypermarkdown/core`. Both MUST name the
same numbers in the same units, so a change here is a change to two files.

### 5. The boundary with the graph view

HMD-0021 §10 defers an interactive graph tab rendering the link graph through a
JavaScript graph library.

- The diagram path MUST NOT render the graph view, and the graph view's renderer
  MUST NOT render `DiagramBlock`s. D2 emits static SVG, which is right for a
  documentation diagram and wrong for click-to-navigate exploration; a
  force-directed layout is right for exploration and cannot draw a sequence
  diagram. Two renderers, two jobs — the source sketch §15 reached this already,
  and it should not be relitigated when the graph tab lands and a diagram
  pipeline is sitting there looking reusable.

### 6. Security

Diagram source is untrusted input from a cloned repository, and its output is
SVG, which is a scripting context.

- Rendered SVG MUST reach the DOM as `<img src="data:image/svg+xml;base64,…">`
  and MUST NOT be inserted as markup. An `<img>` executes no script, no event
  handlers, and no external references from its payload, which turns the whole
  class of SVG-injection attacks into a rendering limitation. HMD-0021 §11's CSP
  already admits `data:` for `img-src` and nothing else.
- The consequence is accepted and stated: diagrams are not interactive and links
  inside them do not work. That is the right trade for a documentation diagram,
  and §5 already sends interaction elsewhere.
- The source MUST go to the renderer on **stdin** and the SVG MUST come back on
  **stdout**. No shell string, no temporary file named from user content, no
  argument built from a card.
- The subprocess MUST be bounded by §4 and killed on timeout.
- The renderer MUST NOT be given the workspace path, the card path, or anything
  else from the environment. Its whole input is the fence body.

### 7. Where the CLI dependency is, and is not

- `d2`, Docker, and `rsvg-convert` MAY be required by: drawing a diagram in the
  preview, the slides build script, and a MkDocs site build.
- They MUST NOT be required by: opening a card, the preview *as a whole*,
  diagnostics, the index, or resolution. A card with an undrawn diagram renders
  completely; only that one block shows its source instead of a picture.
- **VSX-060 is narrowed, not repealed.** Its promise — install the extension,
  open a card, it works — is unchanged. What changes is that one block kind
  draws only when a tool is present, and says so plainly when it is not.

### 8. Parity with the Python implementation

- Both lines agree that a ```` ```d2 ```` fence is a diagram, that its body is
  opaque to the resolver, and that it produces no links and no graph edges.
- Both render through the same binary, share the bounds of §4, deliver SVG the
  same way (§6), and degrade the same way.
- `mkdocs-d2-plugin` is not used: it fails a build when the binary is absent and
  inlines SVG as markup, and both are wrong here.
- The `d2-diagrams` entry in
  [`conformance-xfail.json`](../../../tools/hmd-ts-core/conformance-xfail.json)
  is removed: with both lines rendering the same way it is no longer a
  divergence.
- The conformance corpus MUST NOT gain a case asserting diagram output. The
  corpus arbitrates grammar and resolution; it has no opinion about SVG.

## Backwards Compatibility

- **`IR_VERSION` moves from 1 to 2.** HMD-0020 §7 already requires a consumer
  receiving an unknown version to refuse to render rather than guess, and the
  webview implements it, so a stale webview after an update shows a legible
  message instead of a broken page. This is the first exercise of that
  mechanism.
- **No card changes meaning.** A ```` ```d2 ```` fence was a code block and becomes a
  diagram block; it was never a link target and produced no edges either way.

## Security Considerations

Consolidated in §6, which is normative: untrusted SVG delivered through an
element that cannot execute it, stdin-only invocation with no shell
interpolation, hard time and size bounds, and no environment passed to the
renderer.

The residual risk is supply-chain: `terrastruct/d2:latest` is a moving tag, and
a compromised image would run with the user's privileges. Mitigation is to pin a
digest once the image is in real use; until then the Docker path is second in
the order of §2 and reached only when no local `d2` exists.

## Deployment / Activation

1. Land `DiagramBlock`, `IR_VERSION` 2, and the unrendered presentation. This
   ships value alone: a `d2` fence becomes a labelled diagram-not-drawn instead
   of an anonymous code block.
2. Land the engine of §2 with the `PATH` renderer, then the Docker fallback,
   then the missing-tool message.
3. Land the cache and bounds of §3 and §4.
4. Remove the `d2-diagrams` ledger entry.

## Reference Implementation

```text
tools/hmd-ts-core/src/
  ir.ts                      DiagramBlock, IR_VERSION 2
  render.ts                  fence detection, DiagramBlock construction
  diagram/fence.ts           languages, shared bounds, the cache key
  diagram/sha256.ts          the cache key's digest, sync and dependency-free
tools/hmd-vsc-ext/
  src/diagram/engine.ts      d2 then Docker, the LRU, the data: URI
  src/store.ts               attachDiagrams over an IR, including inside embeds
  media/render.ts            the image, or the source with its reason
```

## Test Plan

Unit tests MUST include:

- A ```` ```d2 ```` fence produces a `DiagramBlock`; ```` ```python ```` does not.
- The info string is matched case-insensitively and on its first word only.
- `source` survives verbatim; the core leaves `dataUri` and `failure` null.
- Two different diagrams in one card get distinct block keys.
- The cache key depends on the source and nothing else.
- With no renderer, the block shows its source and the reason.
- A `failure` renders *beside* the source, not instead of it.
- A `data:` URI reaches the DOM as an `<img>`, and no `<svg>` element appears in
  the document.
- A diagram carries a `data-line`, so it participates in scroll sync.

```bash
npm run -w @hypermarkdown/core test
npm run -w tools/hmd-vsc-ext test
```

## Open Questions

- Is `terrastruct/d2:latest` pinned to a digest, and who updates it?
- **One rendered SVG cannot serve two themes.** D2's default palette is drawn
  for a light background, so the preview shows diagrams on a light surface
  regardless of the editor theme. The alternatives are rendering twice, passing
  `--dark-theme` and being wrong in light themes, or accepting the light
  surface. The third is implemented.
- Should a failed diagram raise a diagnostic? It is visible in the preview, and
  a new rule ID would have to be allocated by the canonical implementation
  (HMD-0020 §9).
- Should `DiagramBlock` generalise to other fence languages now, given
  `language` is already a field, or stay D2-only until a second one is real?
- Does the preview honour `rsvg-convert` for a PNG fallback, as the slides style
  does, or is SVG sufficient inside an editor?

## Changelog

- 2026-08-07: drafted
- 2026-08-07: reframed from a bundled WebAssembly engine to committed artifacts,
  then again to the plain CLI dependency implemented here. The artifact pool —
  content addressing, digest stamps, staleness, a render command — was designed
  and dropped as more machinery than the problem has.
