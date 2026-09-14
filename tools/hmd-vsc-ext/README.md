<div align="center">

<img src="https://raw.githubusercontent.com/ewiger/hypermarkdown/main/doc/wiki/assets/logo.png" width="76" height="76" alt="">

# HyperMarkDown for VS Code

[![Open VSX](https://img.shields.io/open-vsx/v/hypermarkdown/hmd?color=ffb300&label=open%20vsx)](https://open-vsx.org/extension/hypermarkdown/hmd)
[![VS Marketplace](https://img.shields.io/badge/marketplace-hypermarkdown.hmd-ffb300?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=hypermarkdown.hmd)
[![Documentation](https://img.shields.io/badge/docs-hypermarkdown.org-ffb300)](https://hypermarkdown.org/tools/vscode/)

</div>

Live preview for [HyperMarkDown](https://hypermarkdown.org/) (`.hmd`)
knowledge bases: source on the left, the rendered card on the right, keeping up
as you type.

![The extension previewing a card: source on the left, rendered card on the
right, with resolved links, a table, a callout, and a d2 diagram.](https://raw.githubusercontent.com/ewiger/hypermarkdown/main/doc/assets/hmd-vsc-ext-screenshot-1.png)

HyperMarkDown is ordinary markdown plus links into a knowledge graph: you write
the *name* of a card and it is resolved for you, a card can be built out of other
cards, and a linter checks the whole graph. Every `.md` file is already valid
`.hmd`. The format itself — every construct, the resolution rules, the rule IDs —
is documented at [hypermarkdown.org](https://hypermarkdown.org/). This page is
about the extension.

## Install

```
ext install hypermarkdown.hmd
```

- **VS Code** —
  [the marketplace listing](https://marketplace.visualstudio.com/items?itemName=hypermarkdown.hmd),
  or search *HyperMarkDown* in the Extensions view.
- **Cursor, Windsurf, VSCodium** —
  [Open VSX](https://open-vsx.org/extension/hypermarkdown/hmd).
- **From a VSIX** — every CI run attaches one, and each release carries it:
  [releases](https://github.com/ewiger/hypermarkdown/releases?q=vsc-ext).

Then open any `.hmd` file and click the ⚡ at the top right of the editor.
Nothing else is required: no interpreter, no virtualenv, no configuration.
Requires VS Code 1.90 or newer.

> **Preview release.** Everything below is built and gated by tests. The graph
> tab and the publication model are not here yet — see [Known gaps](#known-gaps).

## What it does

- **Rendered preview**, updating from the unsaved buffer, scroll-synced with the
  editor in both directions.
- **Embeds render as cards** — labelled with the card and fragment they came
  from, collapsible, and navigating to the embedded card rather than the
  embedding one. An embed flattened into anonymous prose is a defect here.
- **Red links** for targets that do not resolve, with a create-the-card action.
- **Backlinks** for the current card, listing link and embed edges separately.
- **Diagnostics** in the Problems panel using the `HMD001`–`HMD016` rule IDs,
  identical to `hmd lint`.
- **Math, callouts, and D2 diagrams.** KaTeX ships inside the extension, and so
  does [`d2`](https://d2lang.com): the build for your platform carries a pinned
  [`hypermarkdown-toolchain`](https://github.com/ewiger/hypermarkdown-toolchain)
  release, the same binary the documentation site is built with, so a `d2` fence
  draws on a fresh install with nothing to configure and nothing downloaded at
  run time. Set `hyperMarkdown.diagram.d2Path` to use a different `d2`.
- **Syntax highlighting** for `.hmd` as its own language.

## What it needs

The extension is the preview and the viewer, and it carries its own
implementation of the format for them. Nothing has to be installed to render a
card: no interpreter to find, no virtualenv to activate, and no subprocess
between a keystroke and the preview. The
[`hmd` CLI](https://pypi.org/project/hypermarkdown/) remains the canonical
implementation and CI checks the two against a shared conformance corpus.

Completion and the other language-server features are not here yet. They arrive
with the Python language server, which lives with the canonical implementation
— so a later version will want Python for those, while the preview keeps
rendering without it.

## Settings

| Setting | Default | Effect |
| --- | --- | --- |
| `hyperMarkdown.root` | `""` | Namespace root. Empty discovers it from `.hmd/config.toml`, falling back to `doc/wiki`. |
| `hyperMarkdown.preview.scrollSync` | `true` | Keep preview and editor on the same source line. |
| `hyperMarkdown.preview.embeds` | `expanded` | Whether embed cards start expanded. |
| `hyperMarkdown.diagnostics.scope` | `workspace` | Publish diagnostics for every indexed card, or only open ones. |

## Commands

- **HyperMarkDown: Open Preview in This Column** — a preview tab in the editor
group you are in
- **HyperMarkDown: Open Preview to the Side** — the same, in the group beside it
- **HyperMarkDown: Pin Preview to This Card** — stop following the active editor
- **HyperMarkDown: Create Missing Card** — write the card a red link points at
- **HyperMarkDown: Rebuild Index** — re-scan the namespace root

## Where the preview appears

The preview is an editor tab, not a side-bar view. Click the ⚡ at the top right
of any editor group and a preview opens **in that group** — including when the
neighbouring group is locked, which is where "open to the side" gives up and
splits a third group instead.

A preview follows the active editor: click another card in the Explorer or the
tab bar and the preview re-renders on it. Clicking a `[[wikilink]]` moves the
preview to the target and opens its source alongside, leaving focus in the
preview so the next link is one click away.

Open as many as you like — each is titled after its card. To hold one on a card
while you read elsewhere, click the 📌 in its title bar; the breadcrumb shows
`pinned` while it is held. Tabs come back on their own cards after a window
reload.

## Known gaps

Every divergence from the canonical `hmd` CLI is ledgered with its reason in
[`conformance-xfail.json`](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd-ts-core/conformance-xfail.json),
and a ledgered entry that stops diverging fails the build. The ones worth knowing
about while you write:

- **Raw HTML in a card is escaped** rather than passed through. Deliberate, and
  a divergence from the MkDocs build: a webview rendering HTML out of a
  workspace is a script-injection surface reachable from any cloned repository.

What has changed is in
[CHANGELOG.md](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd-vsc-ext/CHANGELOG.md);
work points are tracked in
[`doc/vsc-ext/STATUS.md`](https://github.com/ewiger/hypermarkdown/blob/main/doc/vsc-ext/STATUS.md).
Bugs and questions go to
[the issue tracker](https://github.com/ewiger/hypermarkdown/issues).

## Contributing

The extension lives in
[the HyperMarkDown repository](https://github.com/ewiger/hypermarkdown/tree/main/tools/hmd-vsc-ext);
its parser, resolver, and renderer come from
[`@hypermarkdown/core`](https://github.com/ewiger/hypermarkdown/tree/main/tools/hmd-ts-core),
so a rendering fix usually belongs there rather than here.
[DEVELOP.md](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd-vsc-ext/DEVELOP.md)
is the contributor's guide — how to build, run, and test the extension, and how
the VSIX is published — and links on to the specification behind it.

## License

MIT — see
[LICENSE](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd-vsc-ext/LICENSE).
