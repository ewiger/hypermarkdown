# HMD-0005: The HyperMarkDown rename — one identity across domain, repository, and registries

**Status**: drafted
**Created**: 2026-08-10

## Abstract

The project is named **HyperMarkDown**, written as one word in prose and as
`hypermarkdown` wherever a name must be machine-readable. The hyphenated
spelling `hyper-markdown` is retired from the domain, the repository URL, the
Python distribution, the Python import package, the MkDocs plugin key, the npm
scope, and the VS Code publisher. `hypermarkdown.org` becomes the canonical
host and `hyper-markdown.org` redirects to it. The Python distribution is
republished on PyPI under the new name and the old project is abandoned rather
than migrated, because PyPI has no rename. The file extension `.hmd`, the `hmd`
command, the `HMD-NNNN` proposal prefix, the `tools/hmd*` directory names, and
the VS Code settings and command namespace `hyperMarkdown.*` are all unchanged:
they were never spellings of the hyphenated name and changing them would break
users for no gain.

## Motivation

The project acquired a second identity before it had finished establishing its
first. A domain was registered without the hyphen, the GitHub repository was
renamed to match, and the two live registries then drifted apart from each other
— so the name now has to be settled deliberately rather than left to whichever
service was configured most recently.

The concrete purposes:

- **The registries already disagree, and one of them breaks the next release.**
  The Open VSX namespace `hypermarkdown` exists; `hyper-markdown` does not. The
  VS Marketplace publisher `hyper-markdown` exists; `hypermarkdown` does not.
  The release workflow names `hyper-markdown` for both, so a `vsc-ext-v*` tag
  pushed today fails in the Open VSX job against a namespace that was never
  created.
- **An extension ID cannot be changed after the first publish.** `publisher.name`
  is the extension's permanent identity on both galleries, it is what an install
  command contains, and it is what every link to the listing resolves through.
  The extension is unpublished right now, which makes this the last moment the
  decision is free.
- **A domain move silently invalidates canonical URLs.** `site_url` feeds every
  canonical link and every `<loc>` in `sitemap.xml`. Left pointing at the old
  host it keeps telling search engines that the retired name is the real one.
- **Renaming a GitHub repository does not follow a PyPI trusted publisher.**
  The publisher is pinned to an owner, a repository name, a workflow file, and
  an environment. The rename already invalidated it, so the Python release path
  is broken until it is reconfigured — and it fails at publish time, after a
  green build.
- **The hyphen is a liability in a name that is spoken and typed.** It has to be
  said aloud, it is guessed wrong, and it forces the `--` escape in shields.io
  badge URLs. The domain has already dropped it.

## Goals

- One spelling of the name reaches users, on the site, in both galleries, on
  PyPI, on npm, and in every README.
- No currently working install, link, or site build breaks without a documented
  replacement that keeps working.
- The release paths for both the Python tool and the extension are green before
  either is tagged.

## Non-goals

- This does not rename the format's file extension, its command, or its
  proposal prefix. `.hmd` and `hmd` are the names users type most often and
  neither contains the hyphen.
- This does not renumber, restructure, or re-file anything under `tools/`.
- This does not change the language itself, its version, or its specification's
  normative content. The specification's prose is re-spelled; nothing it
  requires changes.
- This does not migrate the published PyPI project. There is no such operation.

## Specification

### How the name is spelled

The name is written **HyperMarkDown** in prose, headings, titles, and any
human-facing label, with three capitals and no space. In identifiers, URLs, and
registry names it is written `hypermarkdown`, lowercase and unhyphenated.

- Prose, `site_name`, `displayName`, command categories, configuration titles,
  language aliases, and README headings MUST use `HyperMarkDown`.
- Domains, package names, scopes, publishers, entry-point keys, and import
  paths MUST use `hypermarkdown`.
- No file, string, or configuration key introduced from this point MAY use
  `hyper-markdown`, except the compatibility aliases named below.

### What deliberately keeps its current spelling

Four families of identifier are out of scope, and each is out of scope for its
own reason rather than by oversight.

- The extension's settings and command namespace stays `hyperMarkdown.*`
  (`hyperMarkdown.root`, `hyperMarkdown.openPreview`, and the rest). These are
  written into users' `settings.json` and keybindings; renaming a settings key
  does not migrate the old value, it silently ignores it, so the change would
  cost every existing user their configuration and buy a spelling nobody reads.
  It is already unhyphenated camelCase and reads as the new name.
- The MkDocs plugin class becomes `HyperMarkDownPlugin`, tracking the prose
  capitalisation. It is an internal symbol reachable only through the entry
  point, so no user sees it and nothing outside this repository names it; the
  two workflow assertions that do are updated with it. This was left open when
  the record was drafted and resolved on the same day it was written.
- `.hmd`, the `hmd` command, the `HMD-NNNN` prefix, `.hmd/config.toml`, and the
  `tools/hmd`, `tools/hmd-ts-core`, `tools/hmd-vsc-ext` directory names are
  abbreviations of the name, not spellings of it, and none contains a hyphen in
  the disputed position.
- The `hmd-vsc-ext` extension name — the second half of the extension ID — is
  unchanged. Only the publisher moves.

### The canonical host, and the state DNS has to reach

`hypermarkdown.org` is canonical. `mkdocs.yml` MUST set
`site_url: https://hypermarkdown.org/` and `doc/robots.txt` MUST name
`https://hypermarkdown.org/sitemap.xml`, in the same commit — a repository guard
already fails the build when those two disagree.

That commit MUST NOT land before the new host serves valid TLS, because a
canonical URL and a sitemap that name a host failing certificate validation are
worse than ones naming a stale host: a crawler can follow a redirect and cannot
follow a handshake failure.

The apex `hypermarkdown.org` MUST resolve to exactly the four GitHub Pages
addresses and nothing else:

```text
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

It currently carries two further A records, `3.33.130.190` and
`15.197.148.33`, both reverse-resolving to `awsglobalaccelerator.com` — the
shape of a registrar's domain-forwarding service. They MUST be removed. GitHub
provisions a Let's Encrypt certificate by answering an HTTP challenge on the
apex, and a record set that sends some fraction of requests to a host which
knows nothing about that challenge is why the apex serves over HTTP today and
fails over HTTPS. `www.hypermarkdown.org` already resolves by `CNAME` to
`ewiger.github.io` and is correct as it stands.

The retired host redirects rather than resolving anywhere useful. GitHub Pages
serves exactly one custom domain per site, so `hyper-markdown.org` cannot be a
second alias of the same Pages site — which is why it answers 404 today rather
than redirecting as intended. The forwarding records currently on the new domain
are what the old one needs. The redirect MUST preserve the path, so that
`hyper-markdown.org/wiki/hmd-lang-spec/` reaches the same card on the new host
and every link already published stays alive; a bare redirect to the new home
page discards inbound deep links.

### The repository and the URLs that point at it

Every URL naming `github.com/ewiger/hypermarkdown` becomes
`github.com/ewiger/hypermarkdown`, including the raw asset URL for the logo in
the repository README, the badge targets, the `repository` and `bugs` fields in
both `package.json` files, and the `[project.urls]` table. GitHub redirects the
old paths indefinitely, so nothing breaks while this is in flight — but a
redirect is a courtesy that hides which name is current, and a published README
is the wrong place to depend on one.

The local clone's `origin` MUST be repointed with `git remote set-url`. It works
through the redirect today, which is exactly why it is easy to leave wrong.

### The Python distribution, its module, and the project left behind

PyPI has no rename. A distribution's name is the project, and a new name is a
new project with its own release history, its own trusted publisher, and its own
install line.

- The distribution becomes `hypermarkdown`. `pip install hypermarkdown` is the
  install line from this point.
- The import package moves from `src/hypermarkdown/` to `src/hypermarkdown/`,
  so `import hypermarkdown` matches what was installed. The version stays a
  single literal in that package's `__init__.py`, read dynamically by the build.
- The published `hyper-markdown` project is **abandoned, not migrated**. 0.1.1
  stays installable under the old name because PyPI does not permit removing it
  and nothing is gained by trying. It is pruned later, deliberately, once the new
  name has releases behind it.
- A new trusted publisher MUST be configured on PyPI for project
  `hypermarkdown` — owner `ewiger`, repository `hypermarkdown`, workflow
  `release.yml`, environment `pypi` — and the same on TestPyPI for the
  `testpypi` environment. Both are *pending* publishers until the first upload,
  which is the supported way to bootstrap a project that does not exist yet.
  Without them the release fails with a 403 after a green build.

### The plugin key, and the alias that keeps existing sites building

The MkDocs entry point becomes `hypermarkdown`, and the old key is retained as a
second entry point resolving to the same class:

```text
[project.entry-points."mkdocs.plugins"]
hypermarkdown = "hypermarkdown.mkdocs_plugin:HyperMarkDownPlugin"
hyper-markdown = "hypermarkdown.mkdocs_plugin:HyperMarkDownPlugin"
```

The alias exists because this key is the one renamed identifier that appears
inside files this project does not own. Every site built against the plugin
names it verbatim in its own `mkdocs.yml`, and dropping the key turns that into
a hard build failure with a message about an unrecognised plugin — a failure
whose cause is a rename the site's author never saw. Two entry points pointing
at one class cost a line.

The alias is a compatibility measure and MUST be documented as one: this
project's own `mkdocs.yml` uses `hypermarkdown`, and the old key is not the
supported spelling. When it is withdrawn is an open question, not a silence.

### The TypeScript package

`@hypermarkdown/core` becomes `@hypermarkdown/core`. The package has never been
published to npm and neither scope is claimed, so this is a rename with no
compatibility surface at all — every consumer is inside this repository. The npm
workspace root's own private name follows for consistency.

### The extension's identity on both galleries

The extension ID becomes `hypermarkdown.hmd`.

- The publisher `hypermarkdown` MUST be created on the VS Marketplace before any
  `vsc-ext-v*` tag is pushed. It does not exist yet; the old `hyper-markdown`
  publisher does, and is left unused.
- The Open VSX namespace `hypermarkdown` already exists and is empty, so no
  `ovsx create-namespace` is needed. The workflow's current reference to a
  `hyper-markdown` namespace is wrong today and MUST be corrected — that
  namespace was never created, which makes this a live release blocker rather
  than a cosmetic edit.
- Both environment URLs in the release workflow follow the new ID, as does the
  commented-out Marketplace job's account of which publisher needs a trusted
  publishing policy.

The publisher choice follows the gallery that was already configured correctly.
Open VSX carries the new name; the Marketplace publisher is free to create and
costs nothing.

### The wiki card that carries the project's name

`doc/wiki/hyper-markdown.hmd` is renamed to `doc/wiki/hypermarkdown.hmd`, and
the two wikilinks that reach it — one in the kanban card, one in the tracking
card — are updated with it. The card's published URL changes from
`/wiki/hyper-markdown/` to `/wiki/hypermarkdown/`, which the old domain's
path-preserving redirect does not repair, since the path itself changed rather
than the host. That is accepted: the card is nine days old, the site has no
established inbound links to it, and a card named after the project under the
retired spelling is the single most visible place the old name would survive.

## Backwards Compatibility

What keeps working, and by what mechanism:

- `pip install hyper-markdown` continues to install 0.1.1 indefinitely. It never
  receives another release, and it is pruned at a time of our choosing.
- `plugins: [hyper-markdown]` in a third party's `mkdocs.yml` keeps building,
  through the retained entry-point alias.
- Links to `github.com/ewiger/hypermarkdown` keep resolving, through GitHub's
  permanent rename redirect.
- Links to `hypermarkdown.org/<path>` keep resolving, through the
  path-preserving redirect, once it is configured — it is not configured today.
- Every `hyperMarkdown.*` setting and command in a user's VS Code configuration
  is untouched.

What breaks, and why it is acceptable:

- `import hyper_markdown` stops working for anyone who installed the new
  distribution. The package is 0.1.x, alpha-classified, and the import path was
  never the documented interface — the `hmd` command and the plugin key were.
- The wiki card's URL changes, as described above.
- Anything pinned to `hyper-markdown==0.1.1` stays on that version forever
  rather than resolving new releases. This is the intended consequence of
  abandoning rather than migrating, and it is why the old project is pruned
  only after the new one has a release history.

## Security Considerations

The rename creates one genuine hazard: an abandoned PyPI project and an
unclaimed npm scope are both names users may still type. `hyper-markdown` on
PyPI stays owned by this project and MUST NOT be transferred or deleted while
its install line is still reachable from any published document — deleting it
frees the name for anyone to register and serve arbitrary code to a stale pin.
Pruning it is a decision to take once, deliberately, with that in mind. For the
same reason the `@hyper-markdown` npm scope is left unregistered rather than
registered and released: an unclaimed scope resolves to nothing, whereas a
published-then-unpublished package leaves a name someone else can take.

The Marketplace publisher `hyper-markdown` is retained, unused, for the same
reason — a publisher name released back into the pool is one an impostor can
register and publish an extension under.

Nothing about trusted publishing weakens: the new PyPI publisher binds the same
four facts as the old one, and no long-lived token is introduced anywhere.

## Deployment / Activation

The order matters, because three of these steps are release blockers and two of
them fail only at publish time.

1. **Fix DNS**, and confirm the apex resolves to exactly the four GitHub Pages
   addresses. Set the Pages custom domain to `hypermarkdown.org`.
2. **Wait for the certificate**, then enable *Enforce HTTPS*. Confirm
   `https://hypermarkdown.org/` serves the site before touching `site_url`.
3. **Configure the path-preserving redirect** from `hyper-markdown.org`, using
   the forwarding records currently misapplied to the new domain.
4. **Create the Marketplace publisher** `hypermarkdown`, and confirm the Open VSX
   namespace of the same name.
5. **Register pending trusted publishers** on PyPI and TestPyPI for project
   `hypermarkdown`.
6. **Land the code and prose rename** as the commits described below, with
   `site_url` and `robots.txt` moving together.
7. **Exercise both release paths without publishing**: `workflow_dispatch` on the
   extension workflow runs every gate and publishes nowhere, and the Python
   workflow's TestPyPI path does the same for the wheel.
8. **Tag**, extension first, since its identity is the one that becomes
   immutable.

## Reference Implementation

The rename lands as separable commits, each of which leaves the tree green.
Roughly 436 occurrences of the hyphenated spelling and 63 of `hyper_markdown`
are in scope across tracked files.

- **Python package move** — `tools/hmd/src/hypermarkdown/` to
  `tools/hmd/src/hypermarkdown/` with `git mv`, its imports, and the ~11
  test modules under `tools/hmd/tests/` plus `tests/test_mkdocs.py` that import
  it or name the plugin key.
- **Python packaging** — `tools/hmd/pyproject.toml` (`name`, the dynamic version
  attribute, both entry-point keys, `[project.urls]`) and the root
  `pyproject.toml` (`[tool.uv.sources]`, the `dev` dependency group, the comment
  naming `uv build --package`). `uv.lock` is regenerated in the same commit.
- **Workflows** — `release.yml` (the `--package` flag, the version-source path,
  the entry-point assertion, both environment URLs, the trusted-publisher
  comment), `release-vsc-ext.yml` (the Open VSX namespace and URL, the
  Marketplace URL, the publisher named in the skipped job's explanation),
  `ci.yml` (the `--package` flag, the smoke-test install line, the entry-point
  assertion), and `pages.yml`'s comment.
- **npm packages** — `tools/hmd-ts-core/package.json`,
  `tools/hmd-vsc-ext/package.json` (`publisher`, `displayName`, badges,
  `homepage`, `repository`, `bugs`, `qna`, keywords, language alias, command
  categories, configuration title), the workspace root `package.json`,
  `package-lock.json`, and the ~20 TypeScript sources importing the core scope.
- **Site configuration** — `mkdocs.yml` (`site_name`, `site_url`, `repo_url`,
  `repo_name`, `copyright`, the plugin key, and the comments naming the old
  host) and `doc/robots.txt`.
- **Prose** — the repository `README.md` and each tool's, every `DEVELOP.md`,
  `doc/index.md`, the chapters under `doc/public/`, the cards under `doc/wiki/`
  including the specification's opening sentence, the numbered records under
  `doc/proposals/`, the issue cards, and `CLAUDE.md`. Changelogs are amended
  only where they name a URL or an install line; historical entries keep the
  name the release actually carried.
- **The wiki card rename**, with its two inbound wikilinks.

Two repository guards fail on the prose change unless updated with it:
`tests/test_docs.py` matches the specification's version out of the sentence
`specifies hyper-markdown <version>`, and asserts the built home page contains
`ewiger/hypermarkdown`.

## Test Plan

The rename is verified by the suites that already exist, plus one new guard.

Repository guards MUST cover:

- the specification's version sentence still parsing under the new spelling;
- the built home page naming the new repository;
- `site_url`, every sitemap `<loc>`, and the `Sitemap:` directive in
  `robots.txt` agreeing on `https://hypermarkdown.org/`;
- a new check that no tracked file outside an explicit allowlist contains
  `hyper-markdown` or `hyper_markdown`. The allowlist is the entry-point alias,
  the changelog entries that record what the old releases were named, and this
  record. Without it the last few occurrences are found by a reader rather than
  by the build.

Integration coverage MUST include the wheel smoke test resolving the plugin
under both entry-point keys, since the alias is the one compatibility promise
made to files this project does not own.

```bash
uv sync --locked
uv run python -m pytest
uv build --package hypermarkdown
npm ci && npm run typecheck && npm run build && npm test
uv run mkdocs build --strict
```

## Open Questions

These are worked in [the tracker](../../status/hmd.md#open-questions-and-blockers), which
holds the only copy.

- When is the `hyper-markdown` MkDocs entry-point alias withdrawn, and what
  announces it?
- When is the abandoned PyPI project pruned, and does pruning mean yanking
  releases or deleting the project — given that deletion frees the name for
  anyone?
- Does the extension keep the name `hmd-vsc-ext`, or is the first publish also
  the moment to choose a more legible one, since it is equally immutable?
- Should the retired domain redirect permanently, or for a fixed window after
  which it is allowed to lapse?

## See also

- [`doc/memory/decisions.md`](../../memory/decisions.md) — the four-versions
  rule, the tag prefixes, and why the packaging symlinks were reversed.
- [HMD-0024](../HMD-0024/README.md) — the `tools/` layout whose directory names
  this record leaves alone.
- [`doc/wiki/tracking.hmd`](../../wiki/tracking.hmd) — the record/tracker split.

## Changelog

- 2026-08-10: drafted. Name, domain, repository, both npm packages, the
  extension publisher, and the Python distribution and module all fixed; the
  entry-point alias and the abandoned PyPI project decided; withdrawal dates
  left open.
