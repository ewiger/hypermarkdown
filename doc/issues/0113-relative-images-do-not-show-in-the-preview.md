# 0113 — A relative image in a card is not shown in the preview

**Column**: todo
**Opened**: 2026-11-13
**Found by**: reading the preview's code while checking it against issue 0010.
Not yet reproduced in a running editor, and reproducing it is the first step

## What

`![chart](chart.png)` in a card shows the picture on the built site and, as
the code reads, a broken image in the preview. Three things stand in the way:

- **Nothing rewrites the path.** The core renders the image with markdown-it
  and keeps `src="chart.png"` as written. The preview puts that HTML into the
  page unchanged, and the page has no base address, so the path is resolved
  against the webview's own address and not against the card's folder.
- **The webview may not read the file.** Its `localResourceRoots` is the
  extension's `media` folder only (`src/preview/panel.ts`), so a workspace
  file is refused even under the right address.
- **The content policy is narrow.** `img-src` allows the webview's own source
  and `data:` (`src/preview/html.ts`). That admits a rewritten workspace
  image, and refuses an `https` one.

Ordinary links are not affected. A click on a plain Markdown link is resolved
by the host from the card's own folder, a folder note included
(`openHref` in `src/preview/controller.ts`).

## Shape

- **The host resolves an image path as it resolves a link**: against the
  folder of the card the image is written in, or against the vault root for a
  path starting with `/`. An image may leave the vault, but not the workspace.
- **The resolved file reaches the page as a webview resource**, which means
  the workspace folder, or the vault, joins `localResourceRoots`.
- **An image inside an embed** is resolved from the embedded card, since the
  preview keeps the embed boundary.
- **A web image** needs a decision: allow `https:` in `img-src`, or show a
  placeholder that names the address. A card's text decides what the editor
  fetches, so this is a policy question and not a detail.
- **A missing image** is shown as missing, with its path, and not as an empty
  box.

## Done when

A card with a relative image, a folder note with one, and a card embedding
either each show the picture in the preview; a test covers the path
resolution; and the extension's record says what a web image does.
