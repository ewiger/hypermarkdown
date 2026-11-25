# Proposals

This is the index for numbered technical specifications and substantial
decisions. Proposals work like lightweight ADRs or RFCs.

Reserve a number in this index before creating its folder. Use a stable ID such
as `HMD-0001`, with the proposal itself at `HMD-0001/README.md`.

`HMD-0002` through `HMD-0019` are reserved for the Python and MkDocs line of
work. Editor and JavaScript proposals start at `HMD-0020`, so the two streams
can reserve numbers without coordinating. When the Python numbering exhausts `0019`
it continues at **`HMD-0100`**, leaving `0020`–`0099` to the editor line.

| ID | Status | Title | Progress |
| --- | --- | --- | --- |
| [HMD-0001](HMD-0001/README.md) | drafted | MVP — grammar, resolver, and `hmd lint` | [lang](../status/lang.hmd), [hmd](../status/hmd.hmd) |
| [HMD-0002](HMD-0002/README.md) | drafted | MkDocs book-mode rendering | [hmd](../status/hmd.hmd), [pages](../status/pages.hmd) |
| [HMD-0003](HMD-0003/README.md) | superseded | HQL — the Hyper Query Language, now [its own project](https://hql-lang.org/) with its own documentation | [lang](../status/lang.hmd) |
| [HMD-0004](HMD-0004/README.md) | drafted | The hyper web — namespaces beyond one tree (stub, no mechanism) | [lang](../status/lang.hmd) |
| [HMD-0005](HMD-0005/README.md) | drafted | The HyperMarkDown rename — domain, repository, and registries | [hmd](../status/hmd.hmd) |
| [HMD-0006](HMD-0006/README.md) | drafted | Extended URI for transclusion and link referencing when addressing inside a card | [lang](../status/lang.hmd) |
| [HMD-0020](HMD-0020/README.md) | drafted | `@hypermarkdown/core` — the TypeScript document model | [ts-core](../status/ts-core.hmd) |
| [HMD-0021](HMD-0021/README.md) | drafted | The VS Code extension — the HyperMarkDown preview surface | [vsc-ext](../status/vsc-ext.hmd) |
| [HMD-0022](HMD-0022/README.md) | drafted | Diagrams as committed artifacts | [ts-core](../status/ts-core.hmd), [vsc-ext](../status/vsc-ext.hmd) |
| HMD-0023 | reserved | Searching the wiki from the preview | — |
| [HMD-0024](HMD-0024/README.md) | drafted | The `tools/` layout, and a Python language server | [hmd](../status/hmd.hmd) |
| [HMD-0025](HMD-0025/README.md) | drafted | The graph tab — the vault as a picture | [vsc-ext](../status/vsc-ext.hmd) |
| [HMD-0026](HMD-0026/README.md) | drafted | HQL cells — a card as a notebook | [ts-core](../status/ts-core.hmd), [vsc-ext](../status/vsc-ext.hmd), [lang](../status/lang.hmd) |
| [HMD-0027](HMD-0027/README.md) | drafted | `hypermarkdown` — the resolver as a Rust crate | [rs-core](../status/rs-core.hmd) |
| [HMD-0028](HMD-0028/README.md) | drafted | The `[hql]` and `[semantics]` tables, and the semantic index | [semantics](../status/semantics.hmd), [hmd](../status/hmd.hmd) |
| [HMD-0029](HMD-0029/README.md) | drafted | Markdown files are cards | [lang](../status/lang.hmd), [hmd](../status/hmd.hmd), [ts-core](../status/ts-core.hmd), [rs-core](../status/rs-core.hmd), [semantics](../status/semantics.hmd) |
| [HMD-0030](HMD-0030/README.md) | drafted | Diagram cells — `d2#show` and `mermaid#show`, drawn like HQL cells with Show in place of Run | [vsc-ext](../status/vsc-ext.hmd), [ts-core](../status/ts-core.hmd), [hmd](../status/hmd.hmd), [lang](../status/lang.hmd), [pages](../status/pages.hmd) |
| [HMD-0031](HMD-0031/README.md) | drafted | Freeze — every open finding against 0.1, consolidated before fixing | [lang](../status/lang.hmd) |

## Progress is tracked per tool

Work is tracked in [`doc/status/`](../status/), one file per thing that ships:
[`lang.hmd`](../status/lang.hmd) for the format itself, [`hmd.hmd`](../status/hmd.hmd)
for the canonical Python implementation, [`ts-core.hmd`](../status/ts-core.hmd) and
[`vsc-ext.hmd`](../status/vsc-ext.hmd) for the TypeScript implementation and its
editor, [`rs-core.hmd`](../status/rs-core.hmd) for the Rust resolver crate,
[`semantics.hmd`](../status/semantics.hmd) for the semantic index builder, and
[`pages.hmd`](../status/pages.hmd) for the site. Those files are the
**only** place work is tracked; there is no repository-wide task list and no
board.

A proposal is a *record* and carries no tracker of its own. The split is
decision versus state: the record changes when the design changes, and the
tracker changes with the commits. A proposal's rows are spread across whichever
trackers own the code — the Progress column above says which — because a
proposal is an argument and a tool is a thing you can ship, and the second is
what a reader wants the state of. See
[`doc/wiki/tracking.hmd`](../wiki/tracking.hmd) for the convention in full.

The editor line also keeps a board in [`doc/issues/`](../issues/) for defects
found against a running extension; a card there becomes a tracked row when it is
picked up.
