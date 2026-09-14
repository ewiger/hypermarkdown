# HyperMarkDown in the editor — Requirements

**Status:** Draft v0.1 — design notes, nothing implemented
**Source:** [`initial_sketch.md`](initial_sketch.md) §14 (requirements 87–97) and
§15 (architecture)
**Date:** 2026-08-06
**Specified by:** [HMD-0020](../../proposals/HMD-0020/README.md) (core),
[HMD-0021](../../proposals/HMD-0021/README.md) (extension)

---

## 0. Framing

The source sketch states the thesis in one line: **"Preview is the product.
Everything else is supporting cast."** This document turns §14's prose into
individually testable requirements so the proposals have something to trace
against.

Each requirement carries a stable ID (`VSX-NNN`), an RFC-2119 keyword, and the
sketch number it derives from where one exists. IDs are stable once written;
new requirements take the next free number rather than renumbering.

**One architectural change from the source.** Sketch §15 makes `hmd lsp` the
spine and the extension a thin LSP client, on the strength of principle P5
(*one implementation*). That principle is retired here — see §8 — and the
parser, resolver, and renderer are reimplemented in TypeScript. The reasoning
belongs to [HMD-0020](../../proposals/HMD-0020/README.md); the consequence
visible in this document is that no requirement below depends on a Python
process being present at runtime.

---

## 1. Surface (87–88, 95)

**VSX-001** (MUST) The extension contributes a view container holding one
webview view. Its default placement is the secondary side bar where the API
allows it, and the activity bar otherwise — derived from sketch 87's
"Claude Code-style placement".

**VSX-002** (MUST) The webview presents its views as a tab strip drawn inside
the single webview, not as sibling VS Code views. v1 ships `rendered` and
`graph`; `mind map` joins the same strip later (88).

**VSX-003** (MUST) A command opens the same preview content as an editor tab
beside the source document, for readers who want the full column width.

**VSX-004** (MUST) The preview follows the active `.hmd` editor. A pin toggle
freezes it on one card so the user can navigate the source without losing the
view.

**VSX-005** (MUST) The preview shows the namespace path of the card it is
displaying as a breadcrumb (95).

**VSX-006** (MUST) All preview chrome derives its colours from VS Code theme
variables and is legible under light, dark, and high-contrast themes.

---

## 2. Rendered preview (89, 93, 96)

**VSX-010** (MUST) The preview renders every construct of
[HMD-0001](../../proposals/HMD-0001/README.md) §2: wikilinks, aliased links,
heading links, block anchors, block references, and the three embed forms.

**VSX-011** (MUST) An embed renders as a visually distinct card, labelled with
the card and fragment it came from, and collapsible. Flattening an embed into
anonymous inline text is a defect: the embed boundary is the structure the
preview exists to show.

**VSX-012** (MUST) A link that does not resolve renders as a red link (sketch
28) and offers an action that creates the missing card at the location the
resolver would have found it.

**VSX-013** (MUST) The preview updates from the editor's in-memory buffer as
the user types, without requiring a save (93). This is the feature's defining
interaction — source on the left, the rendered card on the right, keeping up —
and every other requirement in this section is subordinate to it.

**VSX-014** (MUST) Scrolling is synchronised in both directions between the
source editor and the rendered preview (89).

**VSX-015** (MUST) The free syntax of sketch 11–17 renders: callouts,
footnotes, inline and display math, tables, task lists, strikethrough, and
fenced code with syntax highlighting.

**VSX-016** (MUST) A D2 fence renders as its **committed artifact**, compiled
ahead of time by the `d2` CLI rather than by the extension. An unrendered fence
shows its source with an action that renders it — a diagram not yet compiled is
not a defect in the card and must not look like one. Specified by
[HMD-0022](../../proposals/HMD-0022/README.md).

**VSX-017** (MUST) Rendering is deterministic and offline. The same buffer and
the same workspace produce the same preview, with no network access (P1).

**VSX-018** (MUST) The preview tolerates partial input. A buffer caught
mid-keystroke routinely contains an unterminated construct — a half-typed
`[[to`, an unclosed fence, frontmatter with no closing `---`. Every such state
renders: the incomplete construct appears as literal text, the rest of the card
renders normally, and the panel never blanks, never shows an error page, and
never flickers between states. A preview that disappears while you type is
worse than one that updates on save.

**VSX-019** (MUST) View state survives an update. Scroll position, which embed
cards are collapsed, and keyboard focus persist across a re-render, so typing
in the middle of a long card does not throw the reader back to the top or
re-expand everything they had folded away.

## 3. Navigation (90–92, 94, 97)

**VSX-020** (MUST) Clicking a resolved wikilink in the preview opens its target
in the source editor, at the addressed heading or block where the link carries
a fragment (94).

**VSX-021** (MUST) Clicking any rendered element reveals the source line it was
produced from (94).

**VSX-022** (MUST) An embed card's header navigates to the embedded card's
source, not to the embedding card.

**VSX-023** (MUST) The cards linking to the current one are reachable from the
preview and navigate on click (25, 97). A `backlinks` tab answered this until
the graph arrived; the graph's card scope, pointed at what links here, is the
same answer drawn rather than listed, and carrying both would offer it twice.

**VSX-024** (SHOULD) A `graph` tab renders the resolved link graph, clickable
for navigation and filterable by namespace and tag, with a local mode centred
on the current card (90, 92).

**VSX-025** (MAY) A `mind map` tab renders the namespace hierarchy or the link
hierarchy as a tree (91). Deferred past v1.

---

## 4. Diagnostics

**VSX-030** (MUST) The extension publishes diagnostics to the Problems panel
using the rule IDs, severities, and positions of HMD-0001 §8 — `HMD001`
through `HMD016`. A diagnostic in the editor and the corresponding line of
`hmd lint --format json` describe the same defect at the same position.

**VSX-031** (MUST) Diagnostics cover every open `.hmd` document.
(SHOULD) They cover the whole namespace tree once the workspace index is
built, so a red link in an unopened card is still visible.

**VSX-032** (MUST) Diagnostics are produced without invoking Python.

**VSX-033** (MUST) Diagnostics stay quiet under an actively typing author. A
construct being typed is not yet a defect, so diagnostics on the line holding
the cursor are withheld until the author moves away or stops typing. The
preview updates faster than the Problems panel does, deliberately: the preview
is feedback, and a squiggle is a verdict.

---

## 5. Authoring aids

**VSX-040** (MUST) `.hmd` has its own language identifier and a TextMate
grammar, so the format does not contend with the built-in markdown language for
the preview pane or for highlighting (sketch §15).

**VSX-041** (SHOULD) Typing `[[` offers completion over the names the resolver
would bind at that position — the card's own spine and imports, not a flat list
of every file.

**VSX-042** (SHOULD) Go-to-definition on a link or embed opens the resolved
target.

**VSX-043** (MAY) Hovering a link shows the resolved path and a rendered
excerpt of the target.

**VSX-044** (MAY) Renaming a card updates inbound links. Deferred; it needs
whole-tree write access and an undo story.

---

## 6. Workspace and performance

**VSX-050** (MUST) The extension indexes the namespace root and keeps the index
current under file creation, deletion, rename, and change, including changes
made outside VS Code.

**VSX-051** (SHOULD) Parsing, resolving, and rendering the active document
completes within 100 ms for a 100 KiB card, so VSX-013 stays live-on-type.

**VSX-052** (SHOULD) A cold index of 1 000 cards completes within 2 s.
(MUST) Subsequent updates are incremental — a single-card edit never rebuilds
the whole index.

**VSX-053** (MUST) The extension honours `.hmd/config.toml`: the `wiki` root,
`[discovery] autodiscovery`, and `[discovery] mode`, per HMD-0001 §5.3.

**VSX-054** (MUST) The extension does not write to the workspace except through
an explicit user action, and every such action is undoable.

---

## 7. Runtime and packaging

**VSX-060** (MUST) Opening a card, the preview, diagnostics, the index, and
every other path a reader or an editing author touches have no runtime
dependency on Python, on the `hmd` CLI, or on any other external binary.
Interpreter discovery is the single largest onboarding cliff available to this
feature, and it is avoidable.

(MAY) An explicitly invoked command may require a build tool, and must say
plainly which one when it is missing. Diagram rendering is the first such case
([HMD-0022](../../proposals/HMD-0022/README.md) §7); `d2` is an author-time tool
like a formatter, and requiring it of the person *writing* a diagram is ordinary
where requiring it of the person *reading* a card is not.

**VSX-061** (MUST) The extension works in a workspace with no `.hmd/config.toml`
and no prior setup, falling back to the default root.

**VSX-062** (MUST) The webview makes no network requests and runs under a
content security policy that forbids remote content and inline script without a
nonce.

**VSX-063** (SHOULD) The extension ships as one bundled VSIX with no
`node_modules` payload.

**VSX-064** (MUST) The parser, resolver, and renderer are publishable as a
standalone npm package that does not import the `vscode` API, so a future web
playground or JS build tool consumes the same code.

---

## 8. Conformance and the retirement of P5

Principle **P5 — one implementation** is retired. It was never going to survive
the first non-Python parser, and pretending otherwise pushes the drift risk
into the future instead of managing it now. What replaces it is sketch 110–112,
promoted from regression protection to the load-bearing contract.

**VSX-070** (MUST) The TypeScript parser and resolver run the same conformance
corpus as the Python implementation, from the same fixture directory.

**VSX-071** (MUST) The Python implementation is canonical. Where TypeScript
does not yet match it, the divergence is recorded as an expected failure with a
reason, never silently tolerated — and a case that starts passing unexpectedly
fails the build, so the ledger cannot rot.

**VSX-072** (MUST) A rule ID means the same thing in both implementations.
Diverging on the *meaning* of `HMD002` is a spec violation; not yet
*implementing* `HMD002` is a tracked gap.

---

## 9. Deferred

Named here so they are visibly out of scope rather than forgotten:

- **`hmd lsp`, and a language server of any kind.** Sketch 68 and §15. The
  functionality that would justify one — completion, rename, cross-editor
  reuse — is small in v1, and if the toolchain ever grows to need it the
  implementation language is an open question of its own.
- **A Rust implementation.** Mentioned only to record that it is a live
  possibility and that VSX-070 is what would make it cheap.
- **Queries, templates, inline properties, tags** — sketch 10, 34–41, 56–61,
  79–86.
- **Wiki mode, generated pages, the interactive site graph** — sketch 98–109.
  Book-mode MkDocs output is specified by HMD-0002 on the Python side.
- **Real-time collaboration.**

---

## 10. Open questions

| # | Question | Notes |
|---|---|---|
| V1 | Can an extension *default* its view container into the secondary side bar, or must the user drag it there once? | Decides VSX-001's fallback. Spike before HMD-0021 is accepted. |
| V2 | Does the preview render raw HTML embedded in a card? | Python-Markdown passes it through; a webview doing the same accepts workspace content as script. See HMD-0021 Security. |
| V3 | Should the graph view (VSX-024) share a renderer with the eventual MkDocs wiki-mode graph (sketch 109)? | Both want the same JSON; only the host differs. |
| V4 | Marketplace publisher identity and extension ID. | Blocks first publish, nothing before it. |
| V5 | Is there a web-extension (browser VS Code) build, given VSX-064 already forbids Node APIs in the core? | Cheap if decided early, expensive if retrofitted. |
