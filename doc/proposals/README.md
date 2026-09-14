# Proposals

This is the index for numbered technical specifications and substantial
decisions. Proposals work like lightweight ADRs or RFCs.

Reserve a number in this index before creating its folder. Use a stable ID such
as `HMD-0001`, with the proposal itself at `HMD-0001/README.md`.

`HMD-0002` through `HMD-0019` are reserved for the Python and MkDocs line of
work. Editor and JavaScript proposals start at `HMD-0020`, so the two streams
can reserve numbers without coordinating. When the Python line exhausts `0019`
it continues at **`HMD-0100`**, leaving `0020`–`0099` to the editor line.

| ID | Status | Title | Progress |
| --- | --- | --- | --- |
| [HMD-0001](HMD-0001/README.md) | drafted | MVP — grammar, resolver, and `hmd lint` | [lang](../status/lang.md), [hmd](../status/hmd.md) |
| [HMD-0002](HMD-0002/README.md) | drafted | MkDocs book-mode rendering | [hmd](../status/hmd.md), [pages](../status/pages.md) |
| [HMD-0003](HMD-0003/README.md) | drafted | HQL — the Hyper Query Language (stub, no syntax) | [lang](../status/lang.md) |
| [HMD-0004](HMD-0004/README.md) | drafted | The hyper web — namespaces beyond one tree (stub, no mechanism) | [lang](../status/lang.md) |
| [HMD-0005](HMD-0005/README.md) | drafted | The HyperMarkDown rename — domain, repository, and registries | [hmd](../status/hmd.md) |
| [HMD-0020](HMD-0020/README.md) | drafted | `@hypermarkdown/core` — the TypeScript document model | [ts-core](../status/ts-core.md) |
| [HMD-0021](HMD-0021/README.md) | drafted | The VS Code extension — the HyperMarkDown preview surface | [vsc-ext](../status/vsc-ext.md) |
| [HMD-0022](HMD-0022/README.md) | drafted | Diagrams as committed artifacts | [ts-core](../status/ts-core.md), [vsc-ext](../status/vsc-ext.md) |
| HMD-0023 | reserved | Searching the wiki from the preview | — |
| [HMD-0024](HMD-0024/README.md) | drafted | The `tools/` layout, and a Python language server | [hmd](../status/hmd.md) |

## Progress is tracked per tool

Work is tracked in [`doc/status/`](../status/), one file per thing that ships:
[`lang.md`](../status/lang.md) for the format itself, [`hmd.md`](../status/hmd.md)
for the canonical Python line, [`ts-core.md`](../status/ts-core.md) and
[`vsc-ext.md`](../status/vsc-ext.md) for the TypeScript implementation and its
editor, and [`pages.md`](../status/pages.md) for the site. Those files are the
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
