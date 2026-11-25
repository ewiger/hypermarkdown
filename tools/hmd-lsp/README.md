# hmd-lsp

[![Rust](https://img.shields.io/badge/rust-1.95%2B-b7410e)](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd-lsp/DEVELOP.md)
[![Documentation](https://img.shields.io/badge/docs-hypermarkdown.org-ffb300)](https://hypermarkdown.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd-lsp/LICENSE)

The [HyperMarkDown](https://github.com/ewiger/hypermarkdown) language server.
It tells an editor what each `[[reference]]` in an open card resolves to.

`hmd-lsp` is one native program. It speaks the
[Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
over standard input and output, so any editor that speaks the protocol can use
it: VS Code, Neovim, Helix, Zed, Emacs. It needs no interpreter and no runtime.

It is one of the tools in the
[HyperMarkDown monorepo](https://github.com/ewiger/hypermarkdown). The format
itself is documented at [hypermarkdown.org](https://hypermarkdown.org/).

## What it answers

| Request | Answer |
| --- | --- |
| Semantic tokens | The page, the fragment, and the display text of each reference. A reference that names no card, names several cards, or leaves the namespace carries a modifier that says so |
| Go to definition | The card a reference names. An ambiguous reference leads to every card it could name |
| Hover | The card a reference names, and the rule that found it |
| Diagnostics | One for each reference that does not resolve to a card |

The server reads the text in the editor, not the text on disk. A reference to
a card that exists only as an unsaved document resolves.

## What it does not answer

The server resolves references, and it does not lint. It reports three
diagnostics, for the three ways a reference can fail to resolve. Every other
rule of the linter is absent here: a missing heading, a repeated block anchor,
a malformed frontmatter key. Run
[`hmd lint`](https://github.com/ewiger/hypermarkdown/tree/main/tools/hmd) for
those.

Completion and rename are not written yet.

## Install

There is no release yet. Build the program from this directory:

```sh
cargo build --release
```

The program is `target/release/hmd-lsp`.

## Use

An editor starts the server. Point the editor at the program and at the `hmd`
language, which is the files with the `.hmd` extension.

Neovim 0.11 or later:

```lua
vim.filetype.add({ extension = { hmd = "hmd" } })
vim.lsp.config("hmd", {
  cmd = { "hmd-lsp" },
  filetypes = { "hmd" },
  root_markers = { ".hmd" },
})
vim.lsp.enable("hmd")
```

Helix, in `languages.toml`:

```toml
[language-server.hmd-lsp]
command = "hmd-lsp"

[[language]]
name = "hmd"
scope = "source.hmd"
file-types = ["hmd"]
roots = [".hmd"]
language-servers = ["hmd-lsp"]
```

## Settings

The server reads one setting, from the `initializationOptions` of the client's
first request:

| Setting | Default | Meaning |
| --- | --- | --- |
| `diagnostics` | `true` | Whether the server publishes diagnostics. A client with another source of the same diagnostics sets it to `false` |

## Tokens

The token types are standard ones, so a theme colours them with no
configuration:

| Part of a reference | Token type |
| --- | --- |
| The page, as in `[[tokens]]` | `class` |
| The fragment, as in `#Rotation` | `property` |
| The display text after the vertical bar | `string` |

The modifiers are the server's own. A theme or an editor setting gives each a
colour:

| Modifier | The reference |
| --- | --- |
| `unresolved` | names no card |
| `ambiguous` | names more than one card |
| `outside` | has a path that leaves the namespace |
| `embed` | is an embed, written `![[…]]` |

## Licence

MIT. See [`LICENSE`](LICENSE).
