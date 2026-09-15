# Real-time decisions

Small decisions that are not derivable from the code or git history. Newest
sections last. Progress is *not* tracked here — see
[the tracking rule](#where-work-is-tracked).

## Where work is tracked

Progress lives in `doc/proposals/HMD-NNNN/STATUS.md`, one tracker per proposal,
its TODO split into planned work, broken, limitations, and open questions.
`doc/issues/kanban.yaml` indexes the granular cards under `doc/issues/`. A repo-
root `STATUS.md` that indexed every work point for both proposals at once was
removed on 2026-08-07: two overlapping trackers meant a task could hide in
either. A proposal owns its own state.

The part that has held since the beginning: update the tracker in the same
commit that changes the code.

## Proposal number ranges, including the overflow

Three ranges, fixed:

- **`HMD-0002`–`HMD-0019`** — Python, MkDocs, the MVP. This branch.
- **`HMD-0020`–`HMD-0099`** — editor and JavaScript, on `feat/vsc-ext`.
- **`HMD-0100`+** — the MVP line again, once `0019` is exhausted.

The overflow to `0100` is decided in advance so nobody has to renegotiate mid-
stream. Eighteen proposals is the budget the MVP is expected to fit in; passing
it is a signal worth noticing rather than an error. The gap at `0020`–`0099`
leaves the editor line the same room.

## Two agent identities, two branches

`feat/mvp` is Python, MkDocs, and `HMD-0002`–`HMD-0019`. `feat/vsc-ext` is
TypeScript, the VS Code extension, and `HMD-0020+`; its decisions live in
`doc/memory/2026-08-06-typescript-editor-line.md` on that branch. `feat/mvp` is
the merge target. `doc/proposals/README.md` is the one file both streams append
to, so expect a mechanical conflict there and nowhere else.

## MkDocs needed a spec before it needed code

M5 could not start because three of its work points had no normative text —
output URL, nav order, and where embeds expand. HMD-0002 exists to answer those
five decisions, not to describe a plugin that was already obvious.

## The `nav` key opens a set HMD-0001 closed

HMD-0001 §5.3 pins the reserved frontmatter keys as a closed set of `tags`,
`use`, `import`. HMD-0002 §2 adds `nav`, which is an amendment rather than an
extension. The fallback, if that trade is rejected, is derived order only plus
an explicit `nav:` in `mkdocs.yml`.

## Publishing is opt-in, and the default is the strict end

`nav.visibility: public` is what puts a card on the site. Absent, it is private:
no page, no URL, nothing in `site/`. Omitting the nav entry alone was rejected as
the meaning, because a page you can still reach by typing its address is
published whatever the sidebar claims.

The default runs the strict way on purpose. Both errors are possible — a card
that should have shipped and did not, versus one that shipped and should not
have — but they are not symmetric. The first is visible to the author on the next
build; the second is a leak nobody looks for. So the failure mode is a missing
page, never an unintended one.

Inheritance is what keeps that affordable. `visibility` walks the same path
`use` does — the card, then the nearest ancestor `index.hmd`, then the default —
so a folder note publishes its whole subtree and a card inside opts out with its
own `private`. The consequence to keep in mind: `public` on a *root* folder note
is a decision about every card beneath it. `examples/small` is published by
exactly one line for that reason, while `doc/wiki` has no folder note and so
declares it per card.

The embed case is where the gate would have leaked. Expansion copies the target's
bytes into the host page, so an unexpanded guard would have published private
prose inside a public card while the private card itself stayed unbuilt. `expand`
therefore takes a `can_embed` predicate rather than learning what visibility is:
publication is the caller's policy, and `hmd render` on a card you named yourself
is not a site build. A blocked embed degrades to the same red link a blocked
link gets, and both are HMD017.

## `nav` is a mapping because placement has more than one axis

`nav: 10` became `nav: {order: 10}` on 2026-08-08. Ordering is simply the
dimension that existed first, and `visibility` arrived the same day to prove the
point — a scalar would have needed a second spelling within hours. Widening the
value once, before the key had users outside this repository, is cheaper than
carrying two forms forever.

The scalar is reported as HMD013 rather than quietly accepted. A card that
carries the old form is asking to be ordered, and the silent outcome — falling
into the unkeyed bucket and sorting last — is exactly the failure the author
would not look for. This is the same reasoning that already made a misspelled
`no_autodiscovry` a diagnostic instead of a default.

## MkDocs computes URLs; the plugin only names sources

Links are rewritten to a path relative to the **source file** (`kanban.md`), not
to the page's URL (`../kanban/`). MkDocs resolves and validates every link
against the source tree and derives the URL itself, so a source-relative path
gets the URL for free and gets the link checked. Emitting the finished URL made
MkDocs report every wikilink as an unrecognized relative link — it was correct
output that bypassed validation.

Two settings a HyperMarkDown site needs, both non-obvious: `exclude_docs:
"*.hmd"`, or MkDocs copies the raw sources in as static files beside the pages
the plugin generated; and `validation.links.not_found: info`, because cards link
out to the repository with ordinary relative links whose targets are real files
but not site pages.

## The site is a book with a wiki in it

`docs_dir` is `doc/`; the namespace is restricted to `doc/wiki` by the plugin's
`root`. `doc/public/` holds the book's chapters and `doc/index.md` is its cover
— the cover sits at the docs root rather than in `public/` because MkDocs serves
the site home from `docs_dir/index.md`, and a book whose `/` is a 404 is worse
than one whose cover is one directory up from its chapters.

`hmd://wiki` in an authored nav is replaced by the derived wiki section. Without
it the plugin could only derive the whole nav or none of it, which forced a
choice between a book and a wiki.

## Erasure is a shipping format, not an interchange format

`hmd → md` drops the embed boundary and the provenance of every link. That is
fine for a built site and fatal for a preview, which is why the editor line
rejected flat markdown as its transport while MkDocs output stays one-way. The
broader idea — `.md` is to `.hmd` as JavaScript is to TypeScript, with `md →
hmd` as a conversion step that doubles as the fast authoring loop (draft in
plain markdown, convert, let the resolver report what it could not place) — is
sketched without consequence in
[`doc/wiki/md-hmd-interop.hmd`](../wiki/md-hmd-interop.hmd). No proposal owns
it.

## The site publishes from an artifact, not from a branch

GitHub Pages is fed by `.github/workflows/pages.yml` using
`upload-pages-artifact` + `deploy-pages`. The built HTML never enters git, so
there is no `gh-pages` branch and `site/` stays ignored.

The branch route (`mkdocs gh-deploy`) was rejected for two reasons. It force-
pushes build output into version history, in a repository where the branch
topology is already carrying meaning — `feat/mvp` and `feat/vsc-ext` are two
agent identities, and a third branch that is not a line of work muddies that.
And `gh-deploy` is a MkDocs 1.x CLI subcommand, so it would widen exactly the
dependency we were narrowing on the same day.

`pages.yml` is a separate workflow rather than a job in `ci.yml`. `ci.yml` sets
`cancel-in-progress: true`, which is correct for a test matrix and wrong for a
deploy — a second push would cancel a partly uploaded artifact. Pages gets its
own `concurrency: pages` with cancelling off.

Requires **Settings → Pages → Source: GitHub Actions** in the repository. With
the older *Deploy from a branch* setting the workflow runs green and publishes
nothing, which is a silent failure worth knowing about in advance. That is
exactly how the first deploy went on 2026-08-08: the build was clean and
`deploy-pages` returned `404 … Ensure GitHub Pages has been enabled`.

## A failed Pages deploy needs a new run, not a re-run

Enabling the setting does not retroactively publish; the workflow has to run
again. Which route matters, because the obvious one is a trap.

`upload-pages-artifact` writes an artifact named `github-pages`, and re-running
a job **adds a second one to the same run** rather than replacing it.
`deploy-pages` then fails with `Multiple artifacts named "github-pages" …
Artifact count is 2`, and no number of further retries can fix it — the run is
permanently poisoned. Dispatch `pages.yml` afresh instead; a new run gets a
clean artifact namespace.

Worth telling apart from the transient failure that looks similar. There, deploy
queries for the artifact within a second of a successful upload and reports
`Found 0 artifact(s)` — the metadata has not propagated yet. Same remedy, and
the same reason to reach for a new run rather than a retry.

## Dependency bounds are for consumers; the lockfile is for us

`uv.lock` is committed and both CI and the Pages deploy install with
`uv sync --locked`, which fails on drift rather than re-resolving. `pyproject.toml`
keeps ranges capped at the next major.

The split follows from who each one serves. Exact pins in `pyproject.toml` would
propagate to every install: anything co-installed that needs a different
`markdown` becomes unresolvable, and the `mkdocs` extra could deadlock against
itself, since MkDocs depends on `markdown` too. Ranges alone were what let issue
0003 arrive — CI installs fresh on every run, so an upstream release lands
without a commit to point at. A lockfile puts the upgrade in a diff someone
approved; the bounds stay as the promise made to a resolver that is not using
our lock.

The wheel smoke test is deliberately exempt and resolves freshly, because its
whole job is to exercise what a stranger gets from `pip install`. A bad bound is
invisible to any run that installs from the lock.

## The pygments ceiling was in the wrong place, and is now a floor elsewhere

`pygments<2.20` lifted on 2026-08-08 for 0.1.1. `pymdown-extensions` 10.21.2,
published the same day as Pygments 2.20.0, restores `superfences`; re-bisected,
10.20.1 and 10.21 are broken and 10.21.2, 10.21.3, and 11.0.1 are correct.

The more useful half of the finding is where the old constraint lived. It sat in
the `mkdocs` extra, but `pymdownx.superfences` is imported by `render/flat.py`,
so `hmd render --to html` from a plain `pip install hyper-markdown` had no
protection — 0.1.0 could silently render every fence as running text with no
site involved. A constraint has to sit with the code that depends on it, not
with the feature that made someone notice.

## MkDocs is pinned below 2.0, deliberately

`mkdocs>=1.6,<2` and `mkdocs-material>=9,<10`.

MkDocs 2.0 is a ground-up rewrite published under the same name on PyPI. It has
no plugin system. For most projects that is a breaking upgrade; for this one it
is deletion — `[project.entry-points."mkdocs.plugins"]` is how every `.hmd` card
reaches a page at all, so the release would not make the site worse, it would
make the site not contain the wiki. It also moves config from YAML to TOML with
no migration tool, and ships without a license.

The pin exists because CI installs fresh on every run. Left unbounded, the
migration would have been made for us by a resolver, on an ordinary push, with
no commit to point at.

Which 1.x line to follow was deliberately *not* decided — only that it waits.
The candidates and trade-offs are live state, so they live in the tracker as
[HMD-0002 Q4](../proposals/HMD-0002/STATUS.md#open-questions-and-blockers).

Nothing needs to be chosen while 1.6 keeps working. The reason it can wait is
structural: MkDocs touches exactly one file. `parse`, `resolve`, `embed`,
`urls`, and `lint` do not import it, and everything HMD-0002 specifies about
URLs, nav order, and embed expansion is renderer-agnostic — only its rendering
section and reference implementation name MkDocs. A renderer swap is one file
and `mkdocs.yml`, not a re-specification. The one decision that genuinely
leans on MkDocs is *MkDocs computes URLs; the plugin only names sources* above:
a successor has to offer resolution **and** validation, or `urls.py` takes it
over.

## A proposal is a complete text, not a web of references

Write the record so it can be read start to finish, once, by someone who has
opened no other file. State plainly what the thing is and what its features are.

Do **not** thread the prose with identifiers standing in for the claim itself:
feature IDs (`F21`), question IDs (`Q7`), section refs (`§5.3`), sketch
requirement numbers ("requirement 35"), or links to sibling proposals. Restate
the constraint instead of citing where it lives. An identifier may follow a
claim so a reader can locate the row; it may never *be* the claim. Every
surviving pointer goes in one **See also** section at the end, plus footnotes if
genuinely needed.

The failure this prevents: a sentence like "This is P1 applied to queries, and
it is why §1 and §4 are stated before F21 lands" is four lookups in three files
and communicates nothing on its own. A page of that is a page of pointers.
Requiring archeology to parse a sentence is the defect, regardless of whether
each individual link is correct.

Subsections are titled by **what they cover, not by number**. Numbered headings
are what make `§5.3` citable, and a named heading survives an edit. Numbering
was removed from `TEMPLATE.md` on 2026-08-07 for this reason; `HMD-0003` was
rewritten the same day as the worked example.

Trackers are exempt. A `STATUS.md` is a table of IDs by nature — that is its
job, and its rows are read one at a time rather than as prose. The rule binds
`README.md` records, and applies to `doc/wiki/` cards for the same reason.

## The repository is a monorepo of tools, named after the tools

`tools/hmd` (Python), `tools/hmd-ts-core` (`@hypermarkdown/core`), and
`tools/hmd-vsc-ext` (the VS Code extension), each with its own project file.
The previous layout — `src/`, `tests/`, `packages/` — named languages instead of
products, and a language server is not a language.

The part that needed deciding rather than moving: `@hypermarkdown/core` is its
own tool, not extension code. It is the second implementation the conformance
corpus arbitrates against, and filing it inside its only consumer would make it
read as a detail of how the editor is built. Everything used by more than one
tool stays at the root — the fixture trees under `examples/`, `doc/`,
`mkdocs.yml`, and the repository's own test guards.

The conformance corpus is one of those fixture trees, and on 2026-08-08 it was
filed as one: `conformance/cases/` became `examples/conformance/cases/`. What
it holds is what `examples/` holds — namespaces of `.hmd` files that exist to
be run against an implementation — and a top-level directory of its own claimed
a rank the corpus does not need. Its authority never came from where it sat; it
comes from `expected.json` being generated by the canonical implementation and
from a ledgered case that starts passing failing the build. Two directories of
fixture trees at the root also meant every reader had to learn which kind of
fixture went where. Nothing about the contract changed with the path: the
corpus is still language-neutral, still outside both implementations' test
trees, and still arbitrates between them.

One packaging consequence that is not derivable and bites silently: a bare
`uv build` at a workspace root with no `[project]` table does not fail — it
builds an empty `unknown-0.0.0` and exits zero — so the release path names
`uv build --package hypermarkdown` explicitly.

The full record is [HMD-0024](../proposals/HMD-0024/README.md), which also
decides the language server: Python on `pygls`, living with the canonical
implementation.

## The packaging symlinks were the wrong instinct

`tools/hmd/README.md`, `CHANGELOG.md`, and `LICENSE` were symlinks into the
repository root for one day and are now the tool's own files. Reversed on
2026-08-08; every tool carries its own four — those three plus `DEVELOP.md` — and
none of them is a link or a generated copy.

The original argument was one source of truth. setuptools refuses to read a file
outside the project directory, so `readme = "../../README.md"` fails the build
outright, and a copy was expected to drift from the original. What that missed is
that **the two files were never the same document**. A repository front page
introduces a monorepo and its tools; a long description tells someone about to run
`pip install` what they are installing. Linking them produced a PyPI page that
opened by explaining a markup format and closed by naming three tools, two of
which cannot be installed that way, with every relative link dead — a relative
link in a long description resolves against `pypi.org`. Two documents differing in
audience are not duplication, and the symlink was enforcing sameness on things
that were only adjacent.

Worth keeping in mind for the next instance of the same instinct: "don't repeat
it" is about a *claim* being restated, not about two audiences being addressed.

## Four versions, and the root is the language

The root of the repository is the language — the spec, the numbered records, and
the site they publish as. `tools/` holds packages that implement it. The
dependency runs one way, with one deliberate exception: this repository's own
documentation is a HyperMarkDown wiki built by the plugin the Python tool ships,
so the project's specification is exercised by its own publication.

Four independent versions follow, each with exactly one literal: the language's,
declared in the opening sentence of `doc/wiki/hmd-lang-spec.hmd` (0.1, against
CommonMark 0.31.2); and one per tool, in its own project file. A tool release
never implies a language version and a language version never waits for one.

The language's number lives in *prose in the specification* rather than in a
`VERSION` file or a config key, because that document defines the format — a
second literal would be a number free to disagree with the thing it names.
`tests/test_docs.py` reads it from that sentence and fails when the root
`CHANGELOG.md`, which is the language's, has no section for it. That mirrors what
`tools/hmd/tests/test_cli.py` already does for the tool.

What the rename exposed about that arrangement: the guard parses a sentence of
ordinary prose, so re-spelling the project's name in the specification changed
the pattern the guard matches, and the two had to move together. Nothing broke,
because a mismatch is a failing test rather than a wrong number. But the version
lives in a sentence someone may edit for reasons that have nothing to do with
versioning, which is a different fragility from the one the design was chosen to
avoid.

The consequence that is easy to misread: the Python tool's `0.x` caveat is not a
second format version. It says a minor release of that tool may be the one that
implements a breaking language change — the change belongs to the language and
carries the language's number.

The rename on 2026-08-10 was the first time all of this was load-bearing rather
than theoretical, and it came out as four numbers that do not line up: the
language stayed at `0.1`, the Python tool went to `0.2.0`, the TypeScript core
to `0.1.1`, and the extension stayed unreleased. Nothing had to be reconciled,
which is the whole point of keeping the numbers apart.

The version that needed an argument was the Python tool's. `0.1.2` was the
instinct — a rename sounds like packaging, and packaging sounds like a patch.
But the same release turned `nav: 10` into `nav: {order: 10}` and moved the
import package, so under the caveat above it was a minor, and the reason has
nothing to do with the rename that prompted it. A patch would also have been
unrecoverable in a way an ordinary mistake is not: a version number is
permanent on both registries, so publishing `0.1.2` would have spent the number
and left `0.2.0` as the only way to correct the claim.

The trap underneath, worth stating plainly because it is invisible until it is
expensive: a distribution name on PyPI cannot be changed. `hypermarkdown` is a
new project rather than a moved one, `hyper-markdown` keeps `0.1.1` forever, and
the old project is *held* rather than deleted — a freed name can be registered
by anyone and served to whatever still pins it. The same reasoning retired the
VS Marketplace publisher without releasing it.

## The sitemap is core; what was missing is `robots.txt`

There is no sitemap plugin and there is not going to be one. MkDocs ships
`templates/sitemap.xml` and writes `sitemap.xml` and `sitemap.xml.gz` on every
build, from `site_url` and the pages it just rendered. A plugin would be a
second, worse copy of that — and the obvious candidate, `mkdocs-sitemap`, does
not exist on PyPI at all, so reaching for one costs a failed install before it
costs anything else.

Generating the file was never the gap. *Announcing* it was: nothing on the site
said where the sitemap lived, and a crawler has two ways to find out — the
`Sitemap:` directive in `robots.txt`, which every crawler reads unprompted, and
a manual submission in Google Search Console, which is an account rather than a
file and covers one engine. `doc/robots.txt` is now the first of those; MkDocs
copies it to the site root as an ordinary static file, so there is no machinery
behind it.

The directive takes an absolute URL, which means it repeats `site_url` and can
go stale on a domain move with nothing failing. `tests/test_docs.py` ties the
two together, and asserts the same thing about the sitemap itself — every
`<loc>` has to start with `site_url`. That guard is aimed at a specific silent
failure: drop `site_url` and the build stays green under `--strict`, every page
renders, and the sitemap degrades to relative paths no crawler can resolve. The
site does not look wrong; it stops being indexable.

What is deliberately **not** decided here is whether the numbered proposals
should be indexed. They are `not_in_nav` but published, so they are in the
sitemap — ten of twenty-two URLs at the time of writing, all of them internal
tool specifications competing with the language's own specification for the
same queries. Keeping them out of search is a different decision from keeping
them out of the nav, and it needs an argument rather than a default.

## A tag says which tool it releases

Four versions means four release lines, and a tag is how one is started. The
Python tool keeps `vX.Y.Z`; the extension takes `vsc-ext-vX.Y.Z`. The prefix is
not decoration — `release.yml` used to trigger on `tags: ["v*"]`, and every
extension tag begins with a `v`, so an extension release would have started a
PyPI build, checked `vsc-ext-v0.1.0` against `hypermarkdown.__version__`, and
gone red on a workflow that had no business running. The glob is now `v[0-9]*`,
which is the narrowest thing that still admits every version the Python tool can
have.

What the extension's own workflow does differently from `release.yml` is package
once. Both registries refuse to replace a version they have accepted, so the
VSIX that CI gated is the file uploaded to the marketplace, to Open VSX, and to
the GitHub release — a second `vsce package` in the publish job would ship bytes
no gate had seen. The publish jobs sit behind GitHub environments for the same
reason the PyPI one does, except that neither registry offers trusted publishing:
these are long-lived tokens, and the marketplace's expires within a year, so a
release failing with a 401 usually means a token to regenerate rather than a
build to fix.

## The extension is the one tool with a page in the book

The `Tools` nav points at GitHub, on the reasoning that a tool documents itself
next to its code and a copy in the book is a second thing to keep true. The
extension breaks that rule, and the reason it does is that it is the only tool a
reader *installs* rather than reads. An install button on a GitHub tree view is
a button nobody arrives at, and the marketplace listing is not ours to link
people to before they know the format exists.

`doc/tools/vscode.md` is therefore a landing page and deliberately nothing more:
what the extension is, two install buttons, the screenshot, and links out. Every
claim that can go stale — settings, commands, the ledger of divergences — stays
in the extension's own README, which is also what the marketplace renders. The
listing and the site page say the same thing twice only where the sentence is
"install this", which cannot drift.

## A window holds a catalog of vaults, not a project

The extension used to resolve one namespace root at startup, from the first
workspace folder, which made *one workspace, one vault* an assumption in the
shape of the code rather than a decision anyone had taken. The vault model
never said that: a directory tree is a vault because it carries `.hmd/`, and
vaults nest — this repository has `doc/wiki` plus one per example tree, with no
marker at its own root. So every card under `examples/` was invisible to an
editor that could lint the same file from the command line without being told
anything.

What replaced it is the git rule the canonical implementation already followed:
walk up from the card to the nearest `.hmd/`. The walk stops at the containing
workspace folder rather than continuing to the disk root, because `hmd`'s `.git`
fallback is a convenience for a CLI that starts in a directory, and an editor
already has a better answer to the same question.

Three things were genuinely open, and the reasons are worth keeping:

**One index per vault, not one index re-initialised.** The cheap version — keep
a single index and rebuild it whenever the user crosses a boundary — is a much
smaller change, and it throws the whole index away every time someone clicks
between `doc/wiki` and an example. The expensive part is not the rebuild; it is
that the watcher, the diagnostics, and the backlinks all describe whichever
vault was touched last, so every one of them would be answering about a
knowledge base the user is no longer looking at. A catalog of vaults, built
lazily and disposed with the window, is the model the format already has.

**Nothing resolves across a boundary.** A link that reached into a neighbouring
vault would make a card render differently depending on what else happened to be
checked out — the same card, the same bytes, a different meaning per clone. Two
vaults are two namespaces, and that is the whole content of the claim.

**`diagnostics.scope: "workspace"` was redefined rather than joined by a third
value.** It means "every card in the index", and once there is an index per
vault it means every vault the window has opened a card in — so the scope grows
as the user moves. A third value would be a setting nobody can predict the
meaning of without knowing the discovery rule.

The part that took the longest to see: a path stopped being a card's name. The
same path names different cards in two vaults, so the preview, its persisted
state, and every message crossing the webview boundary carry the vault as well.
The webview's persisted state is the place that shows: a state written by an
older build has a path and no vault, and is dropped rather than guessed at,
which costs a restored tab one editor click to find its way back.

## Search depths are D0/D1/D2, and the letter is not free

The semantic index over HMD cards names three representations of a card: a short
abstract used for vector recall, a richer summary used for reranking, and the
authoritative `.hmd` source. They are **D0**, **D1** and **D2**, where `D` is
*depth* — how much of the card a representation still carries.

They were written as L0/L1/L2 first, and [the semantic search
card](../wiki/semantic-search.hmd) has been rewritten, note included. Two
reasons, and the second one is the one worth keeping.

**`L` is taken.** `L0`/`L1`/`L2` are reserved by *len*, the metaprogramming
language, where they already name levels of something else. Two projects
spending the same three tokens on two unrelated ladders is a collision that only
gets more expensive the longer both notations circulate, so HyperMarkDown gives
way while its semantic index is still on paper and costs one rewrite.

**Depth and lens are two axes, not one.** That distinction is not a euphemism
for the rename — it is the more accurate description, and it matters because the
lens axis is one this project still means to pursue on its own terms. *Depth*
says how much semantic information about **one card** a representation retains.
A *lens* says according to what viewpoint knowledge is represented at all, over
however many cards, in a vocabulary the sources need not have used. They
compose — `L(requirements, D0)` is a sensible thing to want — which is exactly
what collapsing them into one letter would have made unsayable.

Note that depth is *compression*, not truncation: a D0 may legitimately call a
card's subject "bearer-token authorization" when that phrase appears nowhere in
it. What a depth must preserve is the card's own subject; what it must not do is
adopt a viewpoint the card did not have, because that is the lens operation.

**The `L0`/`L1`/`L2` lens files under `doc/models/` keep their names.** Those are
grem's lenses, they are levels of abstraction in the sense grem means, and they
have nothing to do with the search ladder. Where both notations meet, `L` is a
lens over the system and `D` is a depth of one card.
