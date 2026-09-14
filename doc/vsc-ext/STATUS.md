# STATUS — the TypeScript line

Where the implementation stands against
[HMD-0020](../proposals/HMD-0020/README.md) and
[HMD-0021](../proposals/HMD-0021/README.md). One row per work point; update the
row in the same commit that changes the code.

It sits under `doc/` rather than inside either tool because the milestones
interleave across both of them: the `C` rows are
[`tools/hmd-ts-core`](../../tools/hmd-ts-core/) and the `E` rows are
[`tools/hmd-vsc-ext`](../../tools/hmd-vsc-ext/). One tracker filed in one tool
would have named the wrong owner for half its rows. The Python tool,
`tools/hmd`, is not tracked here — it tracks per proposal, in
`doc/proposals/HMD-NNNN/STATUS.md`, which is the repository's normal convention
and the one this file is the standing exception to.

**Legend** — `done` shipped and gated by a test · `wip` in progress ·
`ready` specified, unblocked, not started · `blocked` waiting on a decision ·
`unspec` no normative text exists yet.

**Snapshot** (2026-09-14): C1–C7, E1–E5, E7, E8 done; E9 — the bundled-`d2`
release — is prepared and waits only on its tag. 158 tests green: 107 in
`@hypermarkdown/core`, 51 in the extension. That includes diagnostic parity with
`hmd lint` on `examples/small`, `examples/cs-alg-sorting` and `doc/wiki` —
byte-identical on every rule except HMD017, which is ledgered as unimplemented
and currently fires nowhere (see below). Callouts, math, and D2 diagrams render
(HMD-0022), and `d2` now travels inside the extension from a pinned toolchain
release, so a diagram draws on a fresh install with nothing configured (issue
0107). E6 (graph tab), the publication model, and the Python corpus runner are
the next blocks.

---

## Milestones

| # | Milestone | State | Gate |
| --- | --- | --- | --- |
| C1 | `@hypermarkdown/core` scaffold | **done** | `npm run -w @hypermarkdown/core typecheck` |
| C2 | Scanner, grammar, slugs, frontmatter | **done** | `test/scan.test.ts`, `test/parse.test.ts` |
| C3 | Four-phase resolver and workspace index | **done** | `test/resolve.test.ts` |
| C4 | Lint rules HMD001–HMD016 | **done** | `test/parity.test.ts` |
| C5 | Conformance corpus and ledger | **done** | `test/corpus.test.ts` |
| C6 | IR, expansion, markdown-it renderer | **done** | `test/render.test.ts` |
| C7 | Callouts, math, D2 diagrams | **done** | `test/extensions.test.ts` |
| E1 | Extension skeleton, language, grammar | **done** | `npm run -w tools/hmd-vsc-ext build` |
| E2 | Index, watchers, diagnostics | **done** | `test/protocol.test.ts` |
| E3 | Rendered tab, embeds, scroll sync | **done** | `test/renderer.test.ts` |
| E4 | Backlinks, breadcrumb, create-card, pin | **done** | `test/renderer.test.ts` |
| E5 | Packaging | **done** | `npm run -w tools/hmd-vsc-ext package` |
| E6 | Graph tab | **ready** | HMD-0021 §10 |
| E7 | Editor-column surface, logo | **done** | `test/panel.test.ts` |
| E8 | First marketplace release, `0.1.0` | **done** | live on both registries, 2026-08-11; E8.4 reopened |
| E9 | Bundled `d2`, one build per platform, `0.2.0` | **done** | `test/engine.test.ts`; tag `vsc-ext-v0.2.0` |

## Work points

### C — `@hypermarkdown/core`

| ID | Work point | Spec | State |
| --- | --- | --- | --- |
| C2.1 | `scan.ts` — masking, offset preservation, construct finders | HMD-0020 §3 | done |
| C2.2 | `slug.ts` — the `toc` slugify and dedup algorithm | §4 | done |
| C2.3 | `frontmatter.ts` — `---` fence, `js-yaml` under JSON_SCHEMA, reserved keys | §5 | done |
| C2.4 | `parse.ts` — grammar of HMD-0001 §2, never throws on partial input | §3, §7 | done |
| C3.1 | `workspace.ts` — phases 0–3, spine walk, sweep, folder notes | §6 | done |
| C3.2 | `WorkspaceHost` port; no Node builtins in `src/` | §1 | done |
| C4.1 | `lint.ts` — all 16 rules, sorted, no new rule IDs | §9 | done |
| C4.2 | `nav` mapping, visibility inheritance, HMD017 | HMD-0002 §2 | **blocked** — see below |
| C5.1 | `examples/conformance/cases/` generated from the canonical implementation | §10 | done |
| C5.2 | `conformance-xfail.json`, ledger honoured, passing entry fails the build | §10 | done |
| C5.3 | Python corpus runner | §10 | **ready** — belongs to the branch owning `tools/hmd/` |
| C6.1 | `expand.ts` — page, `#Section`, `#^id`, depth 16, cycle stack | §8 | done |
| C6.2 | `render.ts` — sentinel substitution, per-block `data-line`, block keys | §3, §7 | done |
| C6.3 | `graph.ts` — nodes, edges, reverse edge map for backlinks | HMD-0021 §9 | done |
| C6.4 | `parse/callout.ts` — `!!!` admonitions and `???`/`???+` details | §3.3 | done |
| C7.1 | `parse/math.ts` — KaTeX with arithmatex smart-dollar semantics | §3.3 | done |
| C7.2 | `diagram/fence.ts` — fence detection, shared bounds, cache key | HMD-0022 §1 | done |
| C7.3 | `diagram/sha256.ts` — sync digest, no Node builtins | HMD-0022 §3 | done |
| C7.4 | `DiagramBlock`, `IR_VERSION` 2 | HMD-0022 §1 | done |

### E — the extension

| ID | Work point | Spec | State |
| --- | --- | --- | --- |
| E1.1 | Manifest: language `hmd`, grammar, commands, settings | HMD-0021 §1 | done |
| E1.2 | TextMate grammar including `text.html.markdown` | §2 | done |
| E1.3 | esbuild: `dist/extension.js` + `media/webview.js` | §12 | done |
| E2.1 | `VsCodeHost` over `vscode.workspace.fs`, root discovery | §8 | done |
| E2.2 | `Store` — index, watchers, unsaved-buffer overrides | §8, §5.1 | done |
| E2.3 | Diagnostics at 500 ms, suppressed on the cursor's line | §7, §5.1 | done |
| E3.1 | Webview shell, CSP with per-load nonce | §11 | done |
| E3.2 | `patchBlocks` — keyed DOM patching, state preserved | §5.1 | done |
| E3.3 | Embed cards: header, collapse, failure card, nesting | §5 | done |
| E3.4 | Scroll sync: anchors, interpolation, echo lockout | §6 | done |
| E3.5 | Click-through: links, embed headers, reveal-source | §6 | done |
| E4.1 | Backlinks tab, link and embed edges distinguished | §9 | done |
| E4.2 | Breadcrumb, pin toggle | §3 | done |
| E4.3 | `createCard` through `WorkspaceEdit` | §5 | done |
| E4.4 | `diagram/engine.ts` — `d2` then Docker, 64-entry LRU, data: URI | HMD-0022 §2–§6 | done |
| E4.5 | KaTeX stylesheet and woff2 fonts copied into the VSIX | HMD-0020 §3.3 | done |
| E5.1 | `.vscodeignore`, VSIX with no `node_modules` | §12 | done |
| E5.2 | Integration suite under `@vscode/test-cli` | Test Plan | **blocked** — see below |
| E6.1 | Graph tab under the §10 contract | §10 | ready |
| E7.1 | Preview is an editor tab; view container removed | §3 | done |
| E7.2 | `editor/title` button gated on `hyperMarkdown.hasRoot` | §3 | done |
| E7.3 | Several panels, each titled after its card | §3 | done |
| E7.4 | `WebviewPanelSerializer` restores card and pin | §3 | done |
| E7.5 | The ⚡ as tab icon, title-bar icon, and gallery PNG | issue 0104 | done |
| E7.6 | Preview follows the editor and its own links; pin toggle in the title bar | §3 | done |
| E8.1 | Gallery metadata: `preview`, `galleryBanner`, `badges`, `qna`, `homepage` | §1 | done |
| E8.2 | README and CHANGELOG as the Details and Changelog tabs, links absolute | HMD-0024 | done |
| E8.3 | `release-vsc-ext.yml`: one VSIX to Marketplace, Open VSX, and the release | §12 | done |
| E8.4 | Publisher accounts, Marketplace publishing, the `OVSX_PAT` secret | — | **wip** — federated, no stored credential; see below |
| E8.5 | `hypermarkdown.org/tools/vscode/` landing page | — | done |
| E9.1 | `scripts/toolchain.mjs` — fetch the pinned archive, check its digest, unpack it | issue 0107 | done |
| E9.2 | `diagram/options.ts` — configured path, then bundled, then `PATH`, then placeholder | issue 0107 | done |
| E9.3 | `hyperMarkdown.diagram.d2Path`; the Docker fallback removed | issue 0107 | done |
| E9.4 | One VSIX per `--target`, each carrying `toolchain/bin/d2`, gate asserts it is there | HMD-0021 §12 | done |
| E9.5 | `0.2.0` on the Marketplace and Open VSX | — | **done** — all six validated on both, 2026-09-14 |

## Open

- **E8.4 — the Marketplace publishes with no stored credential.**

  `release-vsc-ext.yml` and `publish-marketplace.yml` both do an OIDC
  `azure/login@v2` and then `vsce publish --azure-credential`. There is no
  `VSCE_PAT`, and there is not going to be one.

  Two credentials were tried and abandoned first, and neither is worth
  revisiting:

  - **Trusted publishing (`--oidc`) never shipped.** microsoft/vsmarketplace#1422
    has been open since August 2025, the gallery exposes no policy UI, and no
    released `vsce` carries the flag — 3.9.2, the lockfile's, offers `--pat` and
    `--azure-credential` and nothing else. The job that waited for it pinned the
    single prerelease that had the flag, so "flip a variable, no code change"
    had quietly stopped being true.
  - **A PAT never published anything.** Two CI runs died on
    `Request timeout: /_apis/gallery`, and recreating the token changed nothing.
    Global PATs — the "all accessible organizations" scope the Marketplace
    requires — also stop working **2026-12-01**, so the bridge expired before it
    carried anything across.

  What had been blocking `--azure-credential` all along was **authorisation, not
  tooling**. `vsce` builds a `ChainedTokenCredential` and asks it for the Azure
  DevOps scope; the gallery answers `InvalidAccessException` unless that exact
  principal is a member of the publisher. The grant is keyed on the Azure DevOps
  **profile id** — the publisher's Members → Add search accepts nothing else,
  not a client id, object id, or resource id — and a profile id can only be read
  by querying Azure DevOps *as* the identity in question.

  On 2026-09-14 the human user's profile id was added as a **Contributor** on
  publisher `hypermarkdown`, and a local `vsce publish --azure-credential`
  published `0.2.0 darwin-arm64` in seconds, with no PAT and no timeout. That
  settles the mechanism.

  **The remaining step is that CI's app registration is a different principal
  and needs its own grant.** App `hypermarkdown-vsce-publish`
  (`ddea9a06-accf-4772-9479-11dc9cbb0b83`, no client secret and none possible
  without adding one) authenticates from CI and reports Azure DevOps profile id
  **`3e09813b-4c7c-6612-9b06-160401c25aeb`**. That GUID is what goes into the
  publisher's Members → Add, as Contributor, once, in a browser.
  `.github/workflows/ado-profile-id.yml` is the throwaway that produced it;
  delete it once the grant is made.

  One detail that is easy to get wrong: `azure/login@v2` is required rather than
  setting the Azure environment variables directly. `EnvironmentCredential` is
  first in `vsce`'s chain and does **not** read `AZURE_FEDERATED_TOKEN_FILE`, so
  a bare federated token never reaches it. `azure/login` performs the OIDC
  `az login` itself, and `AzureCliCredential`, next in the chain, picks the
  session up. Microsoft documents only the Azure Pipelines route, through a
  user-assigned managed identity; from GitHub the app registration federates
  directly and no managed identity exists. An app registration is also the right
  object rather than a managed identity because it lives in the directory rather
  than in a subscription, so it outlives `Azure subscription 1`; both are free.

  The credential is bound to `...:environment:vscode-marketplace`, so only a job
  in that gated environment can mint a token — the `environment:` key is
  load-bearing rather than a deployment label.

  **And the subject is the immutable form.** This repository has
  `use_immutable_subject` on, so GitHub presents
  `repo:<owner>@<owner_id>/<repo>@<repo_id>:environment:...` rather than
  `repo:<owner>/<repo>:environment:...`. The first CI run failed on exactly
  that, with `AADSTS700213: No matching federated identity record found for
  presented assertion subject` — which names the subject it presented, so the
  error carries its own fix. Both spellings are now registered on the app, so
  the setting can be flipped either way without a dead pipeline.
  `gh api repos/<owner>/<repo>/actions/oidc/customization/sub` reports which is
  live. The ID-qualified form is the better one to be on: it survives a rename
  of the owner or the repository, where the plain form silently stops matching.

  Still worth taking and neither blocking: verifying the domain
  `hypermarkdown.org` on the publisher, which reports `verified: false` today
  and is what puts the check beside the name on the listing; and deciding
  whether the `preview` flag comes off at E6 (the graph tab) or at C4.2 (the
  publication model). Today it names both.

  Open VSX is unaffected and publishes automatically from `OVSX_PAT`.

- **E9.5 is closed, and it is worth recording how it was read wrong twice.**
  All six targets of `0.2.0` are validated on the gallery and on Open VSX, and
  the GitHub release `vsc-ext-v0.2.0` carries all six VSIXes. It was believed to
  be `darwin-arm64` only as late as the morning of 2026-09-14.

  Two ways the query lies, both of which cost time:

  - **`ExcludeNonValidated`.** The `flags: 1073` recipe that has been passed
    around sets that bit, so a package still in validation is simply *absent*
    from the response rather than reported as pending. Three targets were live
    and invisible. Use `flags: 17` — `IncludeVersions` plus
    `IncludeVersionProperties` — which lists every target and the state of each.
  - **Open VSX's `/versions`** serves a stale CDN copy; add a cache buster
    before concluding anything is missing there.

  Trust the gallery API over `vsce`'s own output either way.

- **E5.2 — integration tests.** Written, compiling, and **parked on
  `feat/vsc-ext-1`** (commit `cb8c6e4`). Two blockers, neither in our code:
  `@vscode/test-electron` 2.5.2 spawns `Contents/MacOS/Electron` and VS Code
  1.132.0 ships that binary as `Code`; and symlinking around the rename
  invalidates the `.app` signature, so macOS kills the process with `SIGKILL`.
  Untested next step is `@vscode/test-electron` 3.1.0. Neither blocker exists on
  a Linux runner, so when this is unparked it belongs in CI under `xvfb-run`,
  not on a laptop. The harness also downloads ~305 MB (~912 MB unpacked) on
  first run, which is why it is not in the default test command.
- **C5.3 — the Python corpus runner.** The corpus is written and the TypeScript
  side runs it. Until Python runs it too, the contract is enforced in one
  direction only, and `test/parity.test.ts` is doing the real work by shelling
  out to `hmd lint`.
- **C4.2 — the publication model, and HMD017 with it.** The canonical
  implementation grew `nav` as a mapping of `order` and `visibility`, a
  visibility that inherits from the nearest ancestor folder note and defaults to
  private, and HMD017, which warns when a published card links to one that is
  not. This implementation still reads the HMD-0001 closed key set of `tags`,
  `use`, `import`, ignores `nav`, and has no notion of a card being published.
  HMD017 is ledgered in `conformance-xfail.json` under `rules`, so parity drops
  it from the canonical side and compares every other rule byte for byte; the
  suite fails if this implementation ever emits it, so the ledger cannot go
  stale. The port is four files — `nav` into the reserved keys and mapping
  parsing in `frontmatter.ts`, `NavConfig` in `model.ts`, a `visibility` walk in
  `workspace.ts` modelled on `autodiscoveryEnabled`, and the rule in `lint.ts`.
  **Open question**: HMD-0020 specifies HMD001–HMD016 and says nothing about
  publication, which is HMD-0002's, so the port needs a spec amendment naming
  which proposal owns visibility in the TypeScript core before it is written.
  A second reason to wait: what HMD017 *should* do is itself unsettled on the
  canonical side. Issue 0008 opens the question of whether a public card linking
  to a private one yields a blocked link, an unlisted-but-reachable page, or
  nothing at all, and the answer is meant to be configurable per site. Porting
  the current warning now would mean porting it twice.

  Note that the divergence is latent rather than active as of 2026-08-08. Main
  cleared its own six HMD017 warnings by de-linking rather than by settling the
  policy, so no card in `doc/wiki`, `examples/small`, or
  `examples/cs-alg-sorting` triggers the rule and parity would pass on today's
  content even with the ledger entry removed. The entry stays because the rule
  is genuinely unimplemented, not because a fixture currently catches it: the
  moment a published card links to a private one again, the canonical side warns
  and this one stays silent.
(V1, the secondary-side-bar question, is closed: E7 removed the view container
rather than finding a place to put it.)
