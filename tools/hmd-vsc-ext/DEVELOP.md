# Developing the VS Code extension

The loop for *this* tool: two bundles, an Extension Development Host, and a
manual walkthrough for the things unit tests cannot see.
[The repository's `DEVELOP.md`](../../DEVELOP.md) covers what is shared, and
[`tools/hmd-ts-core/DEVELOP.md`](../hmd-ts-core/DEVELOP.md) covers the
implementation this extension renders with — a preview bug is as likely to live
there as here.

Specified by [HMD-0021](../../doc/proposals/HMD-0021/README.md); work points are
tracked in [`doc/vsc-ext/STATUS.md`](../../doc/vsc-ext/STATUS.md).

## Prerequisites

Node 20 or later. Python is **not** required to run the extension — that is a
design constraint, not an oversight. It *is* required for the conformance gate in
the core package, which asks the canonical implementation what the right answer
is.

```bash
npm install          # from the repository root — both TypeScript tools
uv sync --locked     # only for the core's parity check
```

## Build

```bash
npm run build                  # core (tsc) then this extension (esbuild)
npm run typecheck              # both packages, no emit
npm run -w tools/hmd-vsc-ext watch   # rebuild both bundles on save
```

Two bundles come out, both gitignored: `dist/extension.js` for the Node
extension host, and `media/webview.js` for the sandboxed webview. They are
separate contexts and neither can reach the other's globals — the message
protocol between them is the whole interface.

## Test

```bash
npm run -w tools/hmd-vsc-ext test    # renderer under jsdom, protocol, panel, CSP
```

The unit suites cover the parts that can be exercised without an editor: the
webview renderer against jsdom, the store-to-webview protocol, panel and pin
behaviour, and the content security policy. Everything that needs a real VS Code
window is the integration suite, which is parked — see the bottom of this file.

## Run it — the Extension Development Host

```bash
npm run example            # examples/cs-alg-sorting — callouts, math, diagrams
npm run example:small      # examples/small — namespaces, imports, a red link
npm run example:wiki       # this repository's own doc/wiki
```

Each builds both bundles, then opens a second VS Code window with the example as
its workspace and every other extension disabled. The same four scripts exist on
the workspace root and on this package, so they run from either directory. Add
`--print` to see the command without running it:

```bash
npm run example:small -- --print
```

**Why a script and no `launch.json`.** F5 runs whichever launch configuration VS
Code last remembered, and that memory lives in workspace storage — invisible, and
not resettable from a file. Reducing the file to a single entry did not help,
because the stored pointer survives. A command has no memory, so the launch
configurations were deleted rather than maintained alongside something that
works.

The script passes `-n`. Without it `code` hands its arguments to an
already-running instance, which ignores `--extensionDevelopmentPath` and quietly
opens an ordinary window — the most likely reason a manual
`code --extensionDevelopmentPath=…` appears to do nothing.

**Do not target `examples/` itself.** `examples/small` uses absolute refs such as
`/shared/tokens`, which are absolute to *its own* root. A root one level up turns
every one of them red: `hmd lint --root examples` reports 3 errors and 12
warnings that do not exist when each tree is linted on its own.

While a host window is running:

- **Cmd+R** reloads the extension after a rebuild. Much faster than relaunching,
  but it does not rebuild — keep `npm run -w tools/hmd-vsc-ext watch` in a terminal for
  a tight loop.
- **Help → Toggle Developer Tools** shows the extension host's console, including
  anything the extension logs or throws.
- The webview is a separate context. Its breakpoints and console need
  **Developer: Open Webview Developer Tools** from the command palette *in the
  host window*.

**If you need breakpoints.** No debugger configuration ships. Add a throwaway
`.vscode/launch.json` of `type: extensionHost` with `--extensionDevelopmentPath`
and an `outFiles` glob over `dist`; the bundles carry source maps, so breakpoints
in TypeScript resolve. It is deliberately not committed — one person's debugger
setup is not worth the F5 ambiguity it reintroduces for everyone else.

## What to exercise by hand

In order, against `examples/small`. These are the behaviours no unit test sees:

1. **The ⚡ is in the editor title bar before you open anything.** The extension
   activates on a workspace containing `.hmd` files, so the button is there on any
   editor, not only on a card. Open `specs/auth/login.hmd` and click it: a preview
   tab opens **in that column**, titled `login`.
2. **Split the window and lock the right group** (`View: Toggle Editor Group
   Lock`), then click the ⚡ in the left group. The tab must land in the left
   group. A third group appearing means something reverted to `ViewColumn.Beside`.
3. **Line 38, `![[token#^definition]]`.** It must render as a bordered card headed
   `glossary/token.hmd`, with a `▾` toggle and an "embed" badge — not as anonymous
   inline prose. Clicking the header opens the *embedded* card.
4. **`glossary/index.hmd` line 11.** `[[idempotency]]` renders red with a dashed
   underline; clicking it offers to create the card where the resolver would next
   have looked.
5. **The Problems panel.** Exactly one entry, `HMD001` at
   `glossary/index.hmd:11:3`. Cross-check with
   `uv run hmd lint --root examples/small`.
6. **Type without saving.** The preview follows about 150 ms behind. Type `[[to`
   and stop: the preview keeps rendering with `[[to` as literal text, and no
   squiggle appears on the cursor's line. Move away and wait ~500 ms — the
   diagnostic then arrives.
7. **Scroll either pane.** They track each other without fighting.
8. **Backlinks tab** on `glossary/token.hmd`: inbound cards listed, link and
   embed edges labelled differently.
9. **Collapse an embed card, then edit the source.** The card stays collapsed and
   the preview does not jump to the top. This is keyed DOM patching, and it is the
   behaviour most likely to regress silently.

`examples/cs-alg-sorting` is the feature-rich fixture and what `npm run example`
opens: five sorting algorithms, seven D2 flowcharts, KaTeX throughout, `!!!` and
`???` callouts, block embeds, and cross-card links. It lints clean under
`--strict`, and every diagram in it compiles with `d2`.

**Diagrams need `d2`, and a released build brings its own.** The extension
resolves a renderer in one order, highest first (issue 0107):

1. `hyperMarkdown.diagram.d2Path` — an explicit path, for deliberately testing
   another build of d2. It does **not** fall through: a setting pointing at
   nothing is reported, not quietly replaced by the bundled binary.
2. `toolchain/bin/d2` inside the extension — the pinned
   [`hypermarkdown-toolchain`](https://github.com/ewiger/hypermarkdown-toolchain)
   release, staged into the VSIX per target platform by the release workflow.
   This is the deterministic default, and the same binary CI and the published
   site render with.
3. `d2` on `PATH`.
4. Nothing. The block shows its source and says what was looked for — a diagram
   that is not drawn is not a defect in the card.

There is no Docker fallback and no download at run time. An editor is not a
place to acquire software, and `terrastruct/d2:latest` was never a pin.

A **source checkout** has no `toolchain/`, so the Extension Development Host
lands on step 3 or 4. Either install `d2`, or stage the pinned one into the
checkout exactly as the release does:

```bash
node ../../scripts/toolchain.mjs --dest tools/hmd-vsc-ext/toolchain
brew install d2      # or see https://d2lang.com
```

`npm run package` stages it for you. Everything but diagrams renders with no
external tool.

**Expected rough edges.** `login.hmd` exercises callouts, math, task lists,
tables, footnotes, code fences, all six link constructs, and a D2 diagram; all of
them should render. What remains ledgered is narrower — `~x~` subscript, setext
headings, raw HTML (escaped here by design), and column numbers after
astral-plane characters — and the full list with reasons is
[`conformance-xfail.json`](../hmd-ts-core/conformance-xfail.json).

## Package the VSIX

```bash
npm run -w tools/hmd-vsc-ext package
code --install-extension tools/hmd-vsc-ext/hmd-0.1.0.vsix
```

Reload the window afterwards, and uninstall from the Extensions panel when you
are done — this one modifies your editor, unlike the development host. The VSIX
is ~440 KB, mostly KaTeX's fonts, and carries no `node_modules`:
[`.vscodeignore`](.vscodeignore) keeps it to the two bundles and the static
assets they need. `README.md`, `CHANGELOG.md`, and `LICENSE` travel too — the
marketplace renders the first two as its Details and Changelog tabs, which is why
this tool has its own rather than borrowing the repository's. `DEVELOP.md` does
not travel: a build guide in front of someone who installed a preview is noise.

**There is no working live-version badge for the VS Marketplace, and the badge
here is deliberately static.** Both providers are gone: shields.io retired its
whole `visual-studio-marketplace/*` family — those URLs render a grey *retired
badge* rather than failing — and `vsmarketplacebadges.dev`, which replaced it,
began answering `500` on 2026-08-11, hours after the listing went up. It had
served `v0.1.0` correctly earlier the same day, so this is an unreliable host
rather than a wrong URL, and a retry is not a fix.

So the marketplace badge is a shields *static* badge naming the extension ID,
which cannot break and cannot go stale. The live version number comes from the
Open VSX badge beside it, which works and is the same build. The installs badge
is dropped rather than replaced — it had the same dead provider and no
substitute exists.

If a live provider appears, it has to be on the trusted-host list `vsce` carries
in `out/package.js` or `vsce package` refuses the SVG outright; `img.shields.io`
is on that list, which is why the static badge packages. VS Code's own manifest
linter flags these URLs anyway; its list is older than `vsce`'s, and packaging is
the check that decides.

**Every link in `README.md` and `CHANGELOG.md` MUST be absolute.** `vsce`
rewrites a relative link against the *repository root* and ignores
`repository.directory`, so `../../doc/…` ships as
`…/blob/HEAD/../../doc/…` and 404s on the listing. Nothing catches this locally
except reading the packaged file, which is what the check below does.

**The identifier is `hypermarkdown.hmd` and is permanent.** Renaming
means a second listing and every install of the first one stranded on it, so do
not change `name` or `publisher`.

## Release it

The extension carries **its own version**. It is not the language's and not the
`hmd` tool's: a release here never implies either, and neither waits for it. The
tags say so — `vsc-ext-v0.1.0` here, `v0.1.0` for PyPI, and
[`release.yml`](../../.github/workflows/release.yml) filters on `v[0-9]*` so the
two never trigger each other.

Publication runs in
[`release-vsc-ext.yml`](../../.github/workflows/release-vsc-ext.yml): it packages
one VSIX, checks the tag against `package.json`, and uploads *that file* to Open
VSX and to the GitHub release. Packaging twice would publish a build nobody
verified.

**The Marketplace step is currently skipped, and the last step of a release is
manual.** See [below](#the-marketplace-job-is-temporarily-skipped) — the job is
written and correct, but the gallery has not yet exposed the configuration it
needs. Tag, let the workflow run, then upload the VSIX from the GitHub release
by hand.

```bash
# 1. version, changelog, and a green tree
#    - bump "version" in package.json
#    - move the [Unreleased] entries into a new [X.Y.Z] section with today's date
#    - add the two link references at the bottom of CHANGELOG.md
npm run typecheck && HMD_REQUIRE_PARITY=1 npm test && npm run -w tools/hmd-vsc-ext package

# 2. tag and push — Open VSX and the GitHub release are automatic
git tag vsc-ext-v0.1.0 && git push origin vsc-ext-v0.1.0

# 3. the Marketplace, by hand, from the release the workflow just cut
gh release download vsc-ext-v0.1.0 --pattern '*.vsix'
```

Upload that file on
[the publisher page](https://marketplace.visualstudio.com/manage/publishers/hypermarkdown)
— **New extension → Visual Studio Code** for a listing that does not exist yet,
the update flow thereafter. Download rather than repackage: the file on the
release is the one every gate ran against, and a fresh `vsce package` is bytes
nobody verified. The browser is the whole credential story here; nothing is
logged in, nothing is stored, nothing expires.

**Verifying the upload is not the same check as Open VSX's.** The Marketplace
re-zips what it serves, so the VSIX on the CDN never hashes to the asset on the
release even when the upload was perfect — compare the *members*, not the file:

```bash
python3 - <<'PY'
import zipfile, hashlib
a = zipfile.ZipFile('mkt.vsix'); b = zipfile.ZipFile('hmd-0.1.0.vsix')
print([n for n in b.namelist()
       if hashlib.sha256(a.read(n)).digest() != hashlib.sha256(b.read(n)).digest()] or 'identical')
PY
```

Open VSX serves the uploaded bytes unchanged, so there a plain `shasum -a 256`
on both files is the right check. Do not carry one recipe over to the other.

A dry run without minting a tag: **Actions → Release (VS Code extension) →
Run workflow**. That path packages and verifies and publishes nowhere.

If Open VSX has to be reached by hand — a publish job to redo, or a workflow that
never got the chance to run — it takes a token from anywhere:

```bash
npx ovsx publish --packagePath hmd-0.1.0.vsix -p "$OVSX_PAT"
```

### The Marketplace job is temporarily skipped

**This is a limitation of the gallery, not of this repository.** The `marketplace`
job is written, reviewed, and believed correct; what is missing is on Microsoft's
side.

- `vsce publish --oidc` has shipped, and the workflow uses it.
- The exchange requires a **trusted publishing policy** on the publisher, naming
  this repository and `release-vsc-ext.yml`. The Marketplace does not currently
  expose that configuration for the `hypermarkdown` publisher.
- So the job is gated on the repository variable
  `MARKETPLACE_TRUSTED_PUBLISHING` and does not run.
- **To re-enable, once the policy can be configured:** set that variable to
  `true` in the repository settings. No code change and no release — the job
  underneath the gate is already the one that should run.

Because a skipped job would otherwise take its dependents with it, the
`github-release` job runs on `always()` and tolerates `marketplace` being
skipped, refusing only when it actually failed. That release is where the manual
upload gets its VSIX, so it is the one job that has to survive.

**`--oidc` cannot be run from a laptop, and that is not a gap to work around.**
The flag asks the *runner* for a token — GitHub Actions injects
`ACTIONS_ID_TOKEN_REQUEST_URL` under `id-token: write`, and the policy on the far
side trusts a repository and a workflow file, not a person. A developer machine
has no such claim to present, and `vsce` deliberately does not fall back to a PAT
when the exchange fails. So the choice is CI or the browser, never local
automation; until the policy exists, it is the browser.

**Do not route around this** with a `VSCE_PAT`, an Azure DevOps organisation, an
Azure subscription, or a service principal. Waiting costs one upload per release.
The alternatives cost a credential that is retired on **2026-12-01** and would
have to be unwound again — see below.

### What has to exist first, once

Both registries are accounts, not repository settings, and neither can be
created by CI:

| Registry | Set up | Secret |
| --- | --- | --- |
| [VS Marketplace](https://marketplace.visualstudio.com/manage) | A publisher with ID `hypermarkdown` — done. The old `hyper-markdown` publisher is retained unused rather than released, because a publisher name returned to the pool is one an impostor can register under. Then a **trusted publishing** policy on the new one naming this repository and `release-vsc-ext.yml` — *not yet offered by the gallery*, which is why uploads are manual. | none |
| [Open VSX](https://open-vsx.org/) | Log in with GitHub and sign the publisher agreement. No `ovsx create-namespace` is needed: `hypermarkdown` already exists — `hyper-markdown` never did — and as of 2026-08-10 it is **verified**, claimed through [open-vsx.org#12443](https://github.com/EclipseFdn/open-vsx.org/issues/12443) against a DNS TXT record on `hypermarkdown.org`. Verification closes the namespace to non-members, so `OVSX_PAT` MUST belong to the account that filed that claim. | `OVSX_PAT` |

**The Marketplace holds no secret of ours, and that is the point.** `vsce
publish --oidc` exchanges a GitHub-issued identity token for a credential that
lives for minutes, so there is nothing to leak and nothing to rotate. What
replaces the token is configuration on the publisher: the policy must name the
workflow *file*, so renaming `release-vsc-ext.yml` breaks publication until the
policy is updated. There is no PAT fallback — a policy that does not match fails
the release rather than reaching for a stored token.

This project never had a `VSCE_PAT`, and should not acquire one. Azure DevOps
retires global PATs on **2026-12-01**, which is the whole reason the older
recipe — an Azure DevOps organisation, a token scoped to all accessible
organisations with **Marketplace → Manage** — is not written here. It works
until it abruptly does not. Microsoft's own
[publishing docs](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
still document that route and an Entra ID managed-identity one, and both drag in
an Azure DevOps organisation this repository has no other use for.

**`--oidc` is pinned to a prerelease of `vsce`, on purpose.** The flag is not in
a stable release yet, and the workflow names an exact version rather than
`@next`, which is a tag that moves. Bumping it is a deliberate edit; when a
stable `@vscode/vsce` carries the flag, drop the pin.

**Optional, and it is what puts the blue check on the listing:** verify the
publisher's domain. Marketplace → publisher settings → verify `hypermarkdown.org`
with the TXT record it gives you.

### Reading the listing before it is public

The gallery page is built from `package.json` and the two markdown files, so most
of it can be checked from the VSIX:

```bash
npm run -w tools/hmd-vsc-ext package
cd tools/hmd-vsc-ext && unzip -o -d /tmp/vsix hmd-vsc-ext-*.vsix >/dev/null
grep -c 'blob/HEAD/\.\.' /tmp/vsix/extension/readme.md   # MUST be 0
```

| On the listing | From |
| --- | --- |
| Title, blurb, icon, banner | `displayName`, `description`, `icon`, `galleryBanner` |
| Body and the Changelog tab | `README.md`, `CHANGELOG.md` |
| Badges under the title | `badges[]` — from a host on `vsce`'s trusted list, or packaging fails |
| Categories, tags | `categories`, `keywords` |
| Resources: Repository, Issues, Homepage, License, Q&A | `repository`, `bugs`, `homepage`, `license`, `qna` |
| "Preview" flag | `preview` — drop it when the graph tab lands |
| Feature Contributions tab | `contributes` — settings and commands, rendered by VS Code itself |

## Regenerating the gallery icon

`media/logo.svg` is the bolt, copied byte-for-byte from
`doc/wiki/assets/logo.svg`. `vsce` will not accept an SVG for the manifest's
`icon` field, so a PNG is committed beside it. It is generated once, not on every
build — the CI runner has no guaranteed librsvg, and the source does not change:

```bash
sed 's/viewBox="0 0 24 24"/viewBox="-4 -4 32 32"/' media/logo.svg > /tmp/padded.svg
rsvg-convert -w 128 -h 128 -b none /tmp/padded.svg -o media/logo.png
```

The widened `viewBox` is the padding: rendered from the original the bolt runs
edge to edge, which reads as clipped at gallery size.

The same restriction reaches the README: `vsce package` fails outright on any
`<img>` pointing at an SVG, remote URL included, so the masthead image in
`README.md` is `doc/wiki/assets/logo.png` — the unpadded bolt, committed beside
the SVG and regenerated the same way:

```bash
rsvg-convert -w 256 -h 256 -b none doc/wiki/assets/logo.svg -o doc/wiki/assets/logo.png
```

Command icons in `package.json` are unaffected; VS Code accepts SVG there, which
is why `media/logo.svg` still ships.

## Before you open a pull request

```bash
npm run typecheck && npm run build
HMD_REQUIRE_PARITY=1 npm test        # both TypeScript suites
npm run -w tools/hmd-vsc-ext package       # the VSIX is a CI gate too
```

Then walk the manual list above if you touched the preview, the protocol, or the
panel surface.

## The integration suite is parked

Written, compiling, and parked on branch `feat/vsc-ext-1` rather than merged. It
runs the extension inside a real VS Code via `@vscode/test-cli` and covers what
unit tests cannot: activation, the language id, diagnostics reaching the Problems
panel, command registration, and a re-lint of an unsaved buffer.

It does not run on macOS today, and neither blocker is in this code:
`@vscode/test-electron` 2.5.2 spawns `Contents/MacOS/Electron`, VS Code 1.132
ships that binary as `Code`, and symlinking around the rename invalidates the
`.app` signature so macOS kills the process with `SIGKILL`. Untested next step is
`@vscode/test-electron` 3.1.0. Neither blocker exists on a Linux runner, so when
this is unparked it belongs in CI under `xvfb-run`, not on a laptop. The harness
also downloads ~305 MB (~912 MB unpacked) on first run, which is why it is not
part of `npm test`.

That branch's own README still names the package `packages/vscode-HyperMarkDown`
— it predates the `tools/` layout and will need the rename when it is unparked.
