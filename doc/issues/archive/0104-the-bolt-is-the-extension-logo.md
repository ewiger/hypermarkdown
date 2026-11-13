# 0104 — The extension has no logo, and the project already has one

**Column**: done
**Opened**: 2026-08-08

## What

Adopt the ⚡ bolt from `doc/wiki/assets/logo.svg` on the `feat/mvp` branch — an
amber `#ffb300` single-path glyph on a 24×24 viewBox, already serving as the
MkDocs site's `theme.logo` and `theme.favicon` — as the extension's identity:
the preview tab's icon, the editor title-bar button, and the Extensions view.

`media/icon.svg` is replaced rather than kept. It draws two rounded cards and
the link between them in `currentColor` strokes, which was a reasonable glyph
for an activity-bar container and is the wrong shape now: stroke art at tab
size reads as noise, and [0103](0103-preview-lives-in-an-editor-column.md)
deletes the container that was its only consumer.

## Why

The bolt already identifies the project everywhere a reader meets it. An
extension whose tab is unmarked in a column of marked tabs is the one the eye
has to hunt for, which is the whole argument for the tab surface in the first
place. There is also no marketplace icon at all today, so the Extensions view
shows the default placeholder.

## Constraints

Three, none of them obvious.

**The gallery icon must be a PNG.** `vsce` rejects SVG for the manifest's
top-level `icon` field. So the bolt ships twice: `media/logo.svg` for the tab
and the title bar, and a 128×128 `media/logo.png` for the Extensions view,
generated once with `rsvg-convert` and committed. It must not become a build
step — the CI runner has no guaranteed librsvg, and the source has not changed
since it was drawn.

**A filled silhouette is the load-bearing property.** VS Code renders some
contributed icons in colour and masks others to a monochrome glyph, and the
manifest gives no say in which. A single filled path survives both readings;
the stroke-based `icon.svg` survives only one. This is also why no light/dark
pair is needed — amber carries against both editor backgrounds.

**The duplicate across branches is deliberate.** `feat/mvp` owns
`doc/wiki/assets/`, this branch owns the TypeScript tools. Sharing the file would mean
one of the streams reaching into the other's directory, which is the thing the
disjoint-file-set discipline exists to prevent. The asset is 273 bytes and
frozen; a copy is cheaper than a merge conflict.

## Done when

- `media/logo.svg` is byte-identical to `feat/mvp`'s
  `doc/wiki/assets/logo.svg`, and `media/icon.svg` is gone.
- The manifest carries `"icon": "media/logo.png"`, and
  `npm run -w tools/hmd-vsc-ext package` builds a VSIX that accepts it.
- A preview tab shows the bolt, and so does the editor title-bar button.
- `tools/hmd-vsc-ext/DEVELOP.md` records the `rsvg-convert` invocation, so the
  PNG can be regenerated without anyone having to reconstruct the padding.
