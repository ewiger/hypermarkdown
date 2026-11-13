# 0112 — A plain Markdown link in the preview does nothing

**Column**: doing
**Opened**: 2026-11-13

## What

In the preview, a wiki link follows its card, and a plain Markdown link,
`[bar](../foo/bar.md)`, does not. Clicking it moves the editor to the line the
link is written on, as clicking any other text does. A web link,
`[HQL](https://hql-lang.org/)`, is just as dead.

The core resolves a wiki link and puts the card it names on the anchor as
`data-hmd-path`, and the preview's click handler follows only those. A plain
link is rendered by markdown-it as `<a href="...">` and nothing more. A webview
cannot navigate, so the click goes to the next rule down, which reveals the
source line.

## Shape

- **The preview hands the `href` to the host as written.** A bare `#fragment`
  stays in the page, as it does in a browser.
- **The host resolves a path the way a Markdown reader does**: against the
  folder of the card the link sits in, or against the vault root for a path
  starting with `/`. A link may leave the vault, but not the workspace.
- **A card is followed as a wiki link is**: the preview moves to it unless
  pinned, the source opens beside it, and a fragment naming a heading lands
  on that heading. Any other file opens in the editor, and a folder is
  revealed in the explorer. A target that does not exist is reported.
- **`http`, `https` and `mailto` open outside the editor.** Every other scheme
  is refused. `command:` most of all, because a card's text must not run
  editor commands.

## Done when

Clicking `[bar](../foo/bar.md)`, a link to a card, and an `https` link in the
preview each open their target, and the extension's record says so.
