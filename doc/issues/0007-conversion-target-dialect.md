# 0007 — Conversion should name its output target

**Column**: backlog
**Opened**: 2026-08-07
**Found by**: reviewing the feature list for what survives `hmd → md`

## What

The erasure direction (`hmd → md`) is described as producing "ordinary
markdown", as though that were one thing. It is not. At minimum there are three
useful targets and they disagree about what is expressible:

- **plain markdown** — the conservative floor, roughly CommonMark. No tables,
  no task lists, no strikethrough, no footnotes.
- **GFM** — what GitHub renders when it shows a `.md` in a repository, which is
  where converted output is most likely to be read.
- **HTML** — a single self-contained file. Not a markdown dialect at all; the
  bottom of the compilation, where every feature is expressible.

Conversion should take the target as an option rather than assuming one.

## Why

The choice is load-bearing because of which features are *bought* rather than
owned. F11–F20 are Python-Markdown extensions the format inherits, so erasure
never touches them — it emits them unchanged and the target renderer either
understands them or does not. That makes the dialect, not the format, the thing
that decides whether output survives.

Sorting the feature list by target:

| Feature | HTML | GFM | Plain markdown |
| --- | --- | --- | --- |
| F13 fenced code | yes | yes | yes |
| F14 tables | yes | yes | no |
| F15 task lists | yes | yes | no |
| F20 strikethrough | yes | yes | no |
| F16 footnotes | yes | no | no |
| F11/F12 callouts | yes | no | no |
| F17 math | yes | no | no |
| F18 D2 diagrams | yes | no | no |

The rows that are `no` in both markdown columns are the interesting ones,
because they are the features whose survival depends on a fallback that does not
exist yet. An `!!! note` emitted verbatim into a GFM target renders as a
paragraph beginning with three exclamation marks. F18 already has the right
shape of answer — a `data:` URI image, which every target accepts — and nothing
else does.

GFM also has a partial answer for callouts specifically: its alert syntax
(`> [!NOTE]`) covers a subset of F11, though not F12's collapsibility.

**HTML is the column with no gaps**, and that is what makes it worth having
rather than merely possible. Every degradation question the other two targets
raise is answered there by construction: `pymdownx.details` already emits
`<details>` for F12, MathJax already handles F17, and F18's `data:` URI is
native. The fallback policy below only has to cover the markdown targets.

It is also the only target that is *purely* one-directional. `md → hmd`
conversion can read plain markdown or GFM back; nothing reads HTML back into
HyperMarkDown, and nothing should try. That asymmetry is a feature — it makes
HTML unambiguously a build product, which is the same argument
[the memory note](../memory/decisions.md) makes for erasure generally.

## Open

- Which targets are worth supporting? `plain`, `gfm`, `html`, and possibly
  `mkdocs` (identity — emit what the site already consumes).
- What is the fallback policy for a markdown target that cannot express a
  feature: degrade it (callout → blockquote), render it to an image the way F18
  does, or refuse and report? A silent pass-through that renders as literal
  `!!!` is the one option that is clearly wrong. HTML does not need this.
- Does the target affect the F6 embed boundary? For the markdown targets, no —
  neither can express it, which confirms the loss belongs to erasure rather than
  to the target. **HTML is the exception**: a `<section data-hmd-embed-src=…>`
  wrapper could preserve the boundary that Layer 1 discards, which would make
  the single-file target strictly more faithful than the site. Worth deciding
  deliberately rather than by default, since it edges HTML toward Layer 2's job.
- How self-contained is "single file"? Inlining CSS and F18's `data:` URIs is
  easy; F17 currently depends on MathJax, which is a script tag pointing
  outward. Either vendor it or pre-render the math.
- The HTML target does not yet keep the promise the book makes for it.
  `hmd render --to html` runs Python-Markdown over the expanded card and returns
  a **body fragment**: no document wrapper, no CSS, no MathJax, and — the
  substantive gap — no diagrams, because `diagram.py` is wired into
  `mkdocs_plugin.py` alone, so a ` ```d2 ` fence reaches HTML as a code block.
  `doc/public/presentation.md` states the target as lossless, which is the
  design; closing this row is what makes the statement true.
- Does `md → hmd` need the same option in reverse? Only for the markdown
  targets — HTML has no reverse direction.

## Not blocking

Nothing in the MVP depends on this. Conversion as a command does not exist yet
and no proposal owns it. This card exists so
the target question is attached to conversion before conversion gets specified,
rather than discovered after it hardcodes one output.
