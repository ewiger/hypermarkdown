# 0111 — Run needs `hql` installed by hand

**Column**: doing
**Opened**: 2026-10-19

## What

HQL cells shipped in `0.4.0`, and **Run** works only if the reader has put
`hql` on `PATH` or named it in `hyperMarkdown.hql.path`. A fresh install draws
every saved output and cannot run a single cell.

The extension already looks for a bundled `toolchain/bin/hql` before `PATH`.
Nothing puts it there: the toolchain release carries `d2` alone.

## Shape

- **The toolchain carries `hql`**, pinned to an HQL release by version and
  digest, beside `d2`, with HQL's licence. The archives stay reproducible.
- **The default is the bundled `hql`.** A platform-specific VSIX carries the
  toolchain's `hql` exactly as it carries `d2`, so Run works on a fresh
  install.
- **`hyperMarkdown.hql.path` overrides it**, for someone testing another HQL
  build deliberately. A path that names nothing is reported, never quietly
  replaced. `hql` on `PATH` stays the last resort, for a source checkout.
- **Platforms HQL does not publish** — Linux ARM64 and Windows, as of HQL
  0.4.2 — get a toolchain archive without `hql`, and fall back to `PATH`. When
  HQL publishes them, a toolchain release picks them up.

## Done when

Toolchain `0.2.0` is released with `hql` 0.4.2, the extension pins it, a VSIX
for macOS and Linux x86_64 runs a cell with nothing installed, and the
extension's record states where `hql` comes from.
