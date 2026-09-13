# 0107 — Nothing pins `d2`

**Column**: done

**Opened**: 2026-09-13

**Closed**: 2026-09-14

## Problem

`d2` is the project's only native binary. It is currently acquired in three places, none of them pinned:

* `.github/workflows/ci.yml` — `docker create terrastruct/d2:latest`, then `docker cp`.
* `.github/workflows/pages.yml` — the same logic, copy-pasted.
* `tools/hmd-vsc-ext/src/diagram/engine.ts` — `d2` on `PATH`, else `docker run terrastruct/d2:latest`, else a placeholder.

`:latest` is not a pin. Identical cards can render differently in two runs and nothing records why.

Upstream has also moved: the canonical repository is now `d2lang/d2`, not
`terrastruct/d2` (the old GitHub URL redirects). On Docker Hub both namespaces
are still published in lockstep, but `d2lang/d2` is the one described as
canonical. So all three call sites name a moving tag in a namespace upstream has
already migrated away from — the rename cost nothing today only because the
redirect happens to work.

Upstream publishes per-release binaries for every platform we need, plus
`SHA256SUMS` and an SPDX SBOM, e.g. for `v0.9.0`:
`d2-v0.9.0-{linux,macos,windows}-{amd64,arm64}.tar.gz`. None of our three call
sites use them.

Native runtime dependencies need one reproducible distribution boundary instead of being acquired independently by CI, docs and editor integrations.

## Target state

Create a **new, separate Git repository**:

```text
hypermarkdown-toolchain
```

This is a repository of its own, not a directory in this one. It is **not**:

* a `tools/hmd-toolchain/` package inside the `hypermarkdown` monorepo;
* a uv workspace member;
* a branch, a submodule, or a `doc/` artefact.

It has its own remote, its own issue tracker, its own release tags, and its own
CI. HyperMarkDown consumes it only as published release artifacts over HTTPS —
never as source, never as a checkout.

The reason it must be separate: a toolchain release is immutable and versioned
independently of HyperMarkDown (see *Release relationship* below). Vendoring it
into this repository would couple the two version lines and reintroduce the
unpinned acquisition this issue exists to remove.

The repository owns pinned native dependencies used by HyperMarkDown.

Initially it contains only D2.

A `hypermarkdown-toolchain` release contains:

* the exact pinned D2 version;
* immutable artifacts for:

  * Linux x86_64
  * Linux arm64
  * macOS x86_64
  * macOS arm64
  * Windows x86_64
* SHA-256 checksums;
* a machine-readable manifest recording the toolchain version and D2 version.

Example:

```text
hypermarkdown-toolchain v0.1.0

d2: 0.x.y

artifacts:
  hypermarkdown-toolchain-0.1.0-linux-x86_64.tar.gz
  hypermarkdown-toolchain-0.1.0-linux-arm64.tar.gz
  hypermarkdown-toolchain-0.1.0-macos-x86_64.tar.gz
  hypermarkdown-toolchain-0.1.0-macos-arm64.tar.gz
  hypermarkdown-toolchain-0.1.0-windows-x86_64.zip
```

Each archive exposes a stable layout:

```text
bin/
  d2
manifest.json
```

The main HyperMarkDown repository pins a **toolchain release**, not D2 directly.

For example:

```text
HYPERMARKDOWN_TOOLCHAIN_VERSION=0.1.0
```

Bumping D2 therefore happens in `hypermarkdown-toolchain`; HyperMarkDown only bumps the toolchain version it consumes.

## CI and docs consumption

`.github/workflows/ci.yml` and `.github/workflows/pages.yml` must no longer know how D2 is obtained.

Add one bootstrap/install script in the HyperMarkDown repository that:

1. reads the pinned `hypermarkdown-toolchain` version;
2. detects the current OS and architecture;
3. downloads the corresponding release artifact;
4. verifies its SHA-256;
5. extracts it into a stable cache/build location;
6. exposes `bin/d2` to the caller.

Both CI and Pages use this script.

There must be no:

```text
terrastruct/d2:latest
d2lang/d2:latest
docker run ...:latest
```

or other direct acquisition of D2 in HyperMarkDown workflows.

## VS Code extension consumption

`tools/hmd-vsc-ext` consumes `hypermarkdown-toolchain` during the extension release build.

D2 is bundled into the VSIX so diagram rendering works out of the box and uses the same pinned version as CI and documentation builds.

The VS Code release workflow builds a platform-specific VSIX matrix.

For each target it:

1. reads the pinned `hypermarkdown-toolchain` version;
2. downloads the matching toolchain artifact;
3. verifies its checksum;
4. extracts `d2`;
5. copies it into the extension package under a stable internal path;
6. packages the VSIX for that VS Code target platform.

Example extension layout:

```text
extension/
  dist/
  toolchain/
    bin/
      d2
```

On Windows:

```text
extension/
  toolchain/
    bin/
      d2.exe
```

The extension performs **no runtime download** of D2.

`engine.ts` resolves D2 in this order:

```text
explicit configured D2 path
→ bundled D2 from the VSIX
→ D2 on PATH
→ placeholder / diagnostic
```

The explicit setting remains first so developers and advanced users can intentionally test another D2 build.

The bundled toolchain is the deterministic default.

## Toolchain boundary

`hypermarkdown-toolchain` contains native runtime dependencies consumed by HyperMarkDown implementations and integrations.

It does **not** contain:

* the `hmd` CLI;
* the future HMD LSP server;
* the `hql` CLI;
* the VS Code extension itself.

Those remain first-party HyperMarkDown components.

The toolchain only packages native executable dependencies such as D2.

If the future `hmd lsp` becomes responsible for diagram rendering, direct D2 execution may move from the VS Code extension into the LSP. The same pinned `hypermarkdown-toolchain` remains the source of the D2 binary.

## Release relationship

HyperMarkDown and `hypermarkdown-toolchain` have independent versions.

Example:

```text
hypermarkdown-toolchain 0.1.0
HyperMarkDown            0.4.0
VS Code extension        0.3.2
```

HyperMarkDown records the exact compatible toolchain version.

A toolchain release is immutable after publication.

## Done when

* `hypermarkdown-toolchain` exists as its own repository, separate from this one.
* D2 is pinned there to an exact version.
* Multi-platform toolchain release artifacts are produced.
* SHA-256 checksums and a manifest are published.
* HyperMarkDown pins one `hypermarkdown-toolchain` release.
* `ci.yml` acquires D2 only through the shared toolchain bootstrap script.
* `pages.yml` acquires D2 only through the same script.
* `tools/hmd-vsc-ext` release builds consume the pinned toolchain artifact.
* Platform-specific VSIX packages contain the pinned D2 binary.
* `engine.ts` contains no `:latest` fallback and performs no Docker-based D2 acquisition.
* The extension resolution order is documented.
* No HyperMarkDown component acquires D2 directly from upstream.

## What shipped

`hypermarkdown-toolchain` exists at
<https://github.com/ewiger/hypermarkdown-toolchain>, MIT, with its own CI and
release workflow.
[`v0.1.0`](https://github.com/ewiger/hypermarkdown-toolchain/releases/tag/v0.1.0)
pins d2 to 0.9.0 from `d2lang/d2` and publishes the five archives with
`SHA256SUMS`. Each carries `bin/d2`, upstream's MPL-2.0 licence text, and a
`manifest.json` naming the toolchain version, the d2 version and the upstream
digest it was built from. Building the same `toolchain.json` twice produces the
same `SHA256SUMS`, and the release workflow checks that before publishing, then
runs the archive for each of the five platforms on that platform.

In this repository:

* [`toolchain.json`](../../toolchain.json) is the pin — the toolchain version
  and the digest of every archive.
* [`scripts/toolchain.mjs`](../../scripts/toolchain.mjs) is the one way to
  honour it. It downloads an archive, checks it against the digest committed
  here rather than a checksum fetched beside it, unpacks it, and prints `bin/`.
  `--platform` stages a platform other than the host's; `--github-path` appends
  to `PATH` for the rest of a job.
* `ci.yml` and `pages.yml` both call that one line. Neither knows how d2 is
  obtained, and the site is now built with the binary CI tested rather than with
  a second copy-pasted acquisition.
* The extension is released as six platform-specific VSIXes — `linux-x64`,
  `linux-arm64`, `darwin-x64`, `darwin-arm64`, `win32-x64`, `win32-arm64` —
  each with the pinned `d2` at `toolchain/bin/`. The release workflow stages it
  per target and then *verifies every VSIX contains it*, so a `.vscodeignore`
  edit cannot quietly ship a package that draws nothing.
* `engine.ts` resolves configured path → bundled → `PATH` → placeholder, with no
  Docker and no run-time download. The configured path deliberately does not
  fall through: a setting that points at nothing is reported, because a setting
  that appears to do nothing is worse than one that fails.

Two deliberate departures from the target state above:

* **`win32-arm64` ships the x86_64 binary.** The toolchain publishes no
  windows-arm64 archive; Windows runs it under emulation, which is the trade VS
  Code itself ships.
* **The pin carries digests, not just a version.** The issue's example was
  `HYPERMARKDOWN_TOOLCHAIN_VERSION=0.1.0`. A version alone would have to trust a
  `SHA256SUMS` downloaded from the same release as the archive, which proves
  only that the two agree. The digests are committed here, reviewed here, and
  are what makes an immutable release immutable *to us*.
