# @hypermarkdown/core

[![npm](https://img.shields.io/npm/v/%40hypermarkdown%2Fcore.svg?color=cb3837&label=npm)](https://www.npmjs.com/package/@hypermarkdown/core)
[![Node](https://img.shields.io/badge/node-%3E%3D20-5fa04e)](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd-ts-core/DEVELOP.md)
[![Documentation](https://img.shields.io/badge/docs-hypermarkdown.org-ffb300)](https://hypermarkdown.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd-ts-core/LICENSE)

Parser, resolver, and renderer for [HyperMarkDown](https://github.com/ewiger/hypermarkdown),
in TypeScript, with no Python and no editor API.

Specified by [HMD-0020](https://github.com/ewiger/hypermarkdown/blob/main/doc/proposals/HMD-0020/README.md). The Python
package under [`tools/hmd/`](https://github.com/ewiger/hypermarkdown/tree/main/tools/hmd) is **canonical**: where the two disagree,
Python is right and this one carries the bug.

One of three tools in the [HyperMarkDown monorepo](https://github.com/ewiger/hypermarkdown); the format
itself is documented at [hypermarkdown.org](https://hypermarkdown.org/).

```
npm install @hypermarkdown/core
```

## Use

```ts
import { MemoryHost, Renderer, Workspace, check } from "@hypermarkdown/core";

const workspace = await Workspace.load(
  MemoryHost.from({
    "shared/tokens.hmd": "# Tokens\n\n## Rotation\n\nEvery 90 days.\n",
    "specs/login.hmd": "# Login\n\nsee [[tokens#Rotation]]\n\n![[tokens]]\n",
  }),
);

check(workspace);                              // HMD001..HMD016 diagnostics
new Renderer(workspace).render("specs/login.hmd"); // the document IR
```

## The filesystem port

The package imports no Node builtins, so it runs in a browser, in a web
extension, and in an in-memory test without a temporary directory. Everything
reaches the world through one interface:

```ts
interface WorkspaceHost {
  readFile(rel: string): Promise<string>;
  listDirectory(rel: string): Promise<DirEntry[]>;
}
```

`MemoryHost` ships for tests. The VS Code extension supplies one over
`vscode.workspace.fs`; a Node host is three lines.

## The IR

Ordinary GFM is an opaque HTML island; every HyperMarkDown construct survives
as a typed node. That split is the design: the consumer needs no markdown
knowledge, and no consumer can lose an embed boundary by treating it as text.

```text
Document := { irVersion, path, breadcrumb, frontmatter, headings, anchors, blocks }
Block    := HtmlBlock { key, html, span }
          | EmbedBlock { key, target, resolution, document, failure, depth, span }
```

Every block carries a `key` derived from content and sibling occurrence, not
from its line number, so a consumer can patch a live view instead of rebuilding
it. Every block-level element inside `html` carries `data-line`, which is what
makes scroll sync and click-through possible at all.

## Conformance

`npm test` runs the shared corpus at
[`examples/conformance/`](https://github.com/ewiger/hypermarkdown/tree/main/examples/conformance) plus a
parity check that shells out to `hmd lint` and requires byte-identical
diagnostics on `examples/small` and `doc/wiki`. Known divergences are listed in
[`conformance-xfail.json`](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd-ts-core/conformance-xfail.json); a ledgered case that starts
passing fails the build.

Work points are tracked in
[`doc/status/ts-core.md`](https://github.com/ewiger/hypermarkdown/blob/main/doc/status/ts-core.md), and what has changed is
in [CHANGELOG.md](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd-ts-core/CHANGELOG.md).

## Working on it

[DEVELOP.md](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd-ts-core/DEVELOP.md) is this package's guide — build, the two constraints
that are easy to break, and how the ledger is kept honest.

## License

MIT — see [LICENSE](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd-ts-core/LICENSE).
