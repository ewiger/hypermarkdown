# STATUS — the website

<https://hypermarkdown.org> — the book, the wiki that sits inside it as a
section, the prose, the branding, and the deployment that publishes them. The
plugin that turns a card into a page is code and is tracked with the tool that
carries it, in [`hmd.md`](hmd.md); what the site *says* and how it is arranged
is tracked here.

Beside this file: the format in [`lang.md`](lang.md), and the three tools in
[`hmd.md`](hmd.md), [`ts-core.md`](ts-core.md), and [`vsc-ext.md`](vsc-ext.md).

## Status

**Live, branded, and building clean.** The site is the project's own knowledge
base rendered by the project's own plugin, which makes it the largest working
example of the format. The top bar is a structure rather than a list of pages —
things to read in order, then things to consult — with the normative
specification as a card and the teaching page as its own tab. Builds are
reproducible from a lockfile and deploy from a workflow artifact.

**The prose audit is finished.** Two dozen disputed claims in the specification,
the namespaces chapter, the tutorial, and the introduction have been rewritten
or withdrawn — including the one that mattered: the ordering property claimed
for wildcard imports, which was a resolver-design question wearing a
documentation costume.

**A second audit, of a different kind, followed.** That one read the prose
against itself; this one read it against the registries. Writing the roadmap
meant stating every tool's version in one place, and doing so found the site
still calling the project pre-release, the extension in development, and the
TypeScript package unpublished — months after all three stopped being true. A
statement of state decays silently, because nothing builds against it. The
roadmap is now the one page that carries those claims, which is what makes them
cheap to keep true.

**The cover is being rebuilt.** It was a chapter with a hero on top: sidebars,
one diagram, one screenshot, and long prose. It is becoming a page of its own —
full-width bands, each making one claim and showing it — after the sibling
project's site did the same and became much easier to read. The shell is in:
the cover's own template, the hero with the project's tagline, and a window of
five tabs that each show a card's source beside what it produces. The bands
that tell the language are in as well: three layers, links, embeds, metadata,
and visuals, each with a diagram drawn in the page. So are the bands for cards
as notebooks, search by meaning, the tools, a comparison with other formats,
and the pages to read next, and the old prose is gone from the cover. The hero's
window also has a live editor: a sixth tab, added by a script, where a visitor
types into a card of the example vault and the page renders and checks it.
Every page now carries the tags that show a shared link as a card.

**What remains open** is one decision deliberately not being taken — which
successor to follow when the site generator's 2.0 arrives without a plugin
system — and a handful of accepted constraints, of which the one worth
revisiting is that maths loads from a CDN at view time.

## Open

| Status | Work | Notes | References |
| --- | --- | --- | --- |
| doing | **Rearrange the site**: `Language` is Vision, Namespaces, Features, then the Language Specification, which has an amber highlight in the submenu. `Learn` is Introduction, Tutorial, Cell output, then Presentation. There is no Wiki tab: its cards stay published and reachable by link, but unlisted. The cover's reading list follows the nav order. The tutorial no longer re-teaches Markdown and points at the specification for the baseline | Introduce the purpose and concepts before the standard. Whether the remaining wiki cards should stay published at all is not decided | `mkdocs.yml`, `doc/index.md`, `doc/wiki/hmd-tutorial.hmd` |
| todo | **The roadmap is behind the releases**: its version table, its news, and a section that lists released cells as coming | It now says where the work goes — the specification's first version and the editor here, AI and graph querying in HQL — and nothing else on it was brought forward. It is the one page that states versions, so it is the one page that has to be right | [the roadmap card](../issues/0013-the-roadmap-is-behind-the-releases.md) |
| todo | **A screenshot of the example notebook for the cover**, in place of a crop from another vault | Needs the editor opened by hand | [the screenshot card](../issues/0114-a-screenshot-of-the-example-notebook.md) |
| todo | **Rewrite every `d2` fence as `d2#show`** — in the book, the wiki, the README, and the example vaults, about eighteen fences — so the diagrams still draw once a plain `d2` fence is a listing. A fence that shows D2 source on purpose, inside an outer example fence, stays as it is | Lands with the release that turns the rule on in both implementations, not before it and not after | [[hmd-0030#backwards-compatibility]] |
| backlog | **Self-host the maths typesetter**, so the site has no runtime dependency on anything it does not ship | Today it loads from a CDN, which is the site's only network dependency at view time. Not argued yet | — |

## Broken

| Status | Defect | Symptom | References |
| --- | --- | --- | --- |
| blocked | **The retired domain does not redirect to this one** | Every link ever published under the old host is dead. Registrar configuration rather than a commit, and tracked with the tool that owns the release surfaces, in [`hmd.md`](hmd.md) | [[hmd-0005#the-canonical-host-and-the-state-dns-has-to-reach]] |

## Limitations (known gaps)

| Limitation | Why it stands | References |
| --- | --- | --- |
| The site generator is pinned below 2.0, and its theme below its next major | 2.0 is a ground-up rewrite published under the same name with **no plugin system** — for this project not a breaking upgrade but deletion, since the plugin is how a card becomes a page at all. It also moves configuration to a format with no migration tool | [[hmd-0001#9-mkdocs-integration]] |
| Maths loads from a CDN at view time | The build itself is offline. Without the CDN a reader sees formulas as their own source. Fixing it is the one open item above | — |
| A missing link target is reported, not fatal | Cards link out to the repository with ordinary relative links whose targets are real files but not site pages. The cost is that a genuinely broken relative link also only warns — links between cards are checked by the linter instead | [[hmd-0002#4-red-links-and-md]] |
| A diagram fence without the `d2` binary degrades to a labelled placeholder and the build stays green | Deliberate: a missing binary must not fail a build. The cost is that an environment without it ships placeholders silently | [[hmd-0022#2-what-the-consumer-does]] |
| Directory-style URLs are required, and turning them off is a hard error | A card and its folder note share one URL, so this is a requirement rather than a preference | [[hmd-0002#1-output-urls]] |
| Only one of the theme's own templates is shadowed, the footer's. `main.html` and `home.html` extend the theme's pages and fill blocks it leaves for the purpose | A shadowed template pins the site to the theme's internal structure, which is exactly what the version pin already has to be careful about. The cover's template extends the theme's page rather than replacing a part of it, and changes one block; the HQL tab's script builds its per-letter markup from the link the theme emitted, so the tab is still a working link without it | — |
| The cover's live editor is missing from a site built without `npm ci` and the bundle step | The bundle is build output and is not committed. The tab then says the editor could not be loaded; the deploy workflow builds it, so the published site has it | — |
| A drawn diagram keeps a white ground in the dark scheme | `d2` draws dark ink into an image, and an image cannot be restyled from the page. The cover draws its own diagrams in HTML and CSS for this reason; diagrams in chapters and cards are unchanged | — |

## Done

- **A worked tutorial** — create a reading club vault, link to a book's
  discussion, embed a passage, and run an HQL cell that builds the reading
  list from the book cards. The example continues through lint and publication.
- **Readable Language chapters** — Vision presents a card as a unit of
  knowledge: readable, composable, queryable, and executable, with a working
  notebook example and the HQL blog's argument for reflection. Namespaces
  follows the specification's handbook through naming, imports, discovery,
  and vault boundaries. Both distinguish current capabilities from proposed
  agent workflows and cross-namespace references; the latter now agree with
  the standard's reserved-syntax rule. Both chapters are published `.hmd`
  cards with wikilinks, using the existing `doc/` vault as the site's namespace
  and retaining their public URLs.
- **A link-preview card** — Open Graph and Twitter tags on every page, and one
  image for the site, drawn in the cover's dark scheme from
  `scripts/social-card/card.html` by `node scripts/social-card.mjs` and
  committed. The cover states its own description; other pages take the
  site's.
- **A live editor on the cover** — a "Try it" tab in the hero's window: one
  card of the example vault in a text box, rendered and linted in the page as
  it is typed, by the TypeScript implementation bundled for a browser. A link
  resolves, an embed appears, a name two cards share is reported. The bundle
  is built by `node scripts/build-site-demo.mjs`, is not committed, has a size
  budget, and is fetched only when the tab is opened; mathematics is left as
  its source and a diagram as its text, since neither can be drawn there
  cheaply. Without the script the five recorded tabs are the page.
- **The cover's computation and reach bands** — cards as notebooks, with the
  three kinds of fence, three cells of the example notebook reading each other,
  and a current screenshot of a cell in the editor; search by meaning, as the
  path from a vault through the index to a query, with its limits stated; the
  tools as tiles, the unbuilt one marked planned; a comparison with CommonMark,
  GFM, Obsidian, MDX, Jupyter, Quarto, and Org-mode, each row checked against
  that project's own documentation on 2026-11-22; and the pages to read next.
  The Features, Tools, Specification, and Vision prose is retired from the
  cover, and with it the cover's citation of the proposals.
- **The cover's language bands** — one file in three layers; links that name
  cards, with part of the example vault's real graph and the four steps that
  find a name; an embed drawn as a block in one card appearing inside another;
  frontmatter, the four keys the tools read, and a query reading a key of the
  author's own; and a diagram, a formula, a callout, and a task list each shown
  as source over result. The diagrams are HTML, CSS, and one inline drawing,
  coloured from the scheme's variables. The old three-layer diagram and the
  Language prose are retired.
- **The cover's shell** — its own template, full width with both sidebars
  hidden and the navigation still in the phone's drawer; the hero with the
  project's tagline; a window of five tabs, each a card's source beside what it
  produces, taken word for word from the example vaults; and a closing band
  with the two installs. Guards hold the cover to the examples, to the
  linter's real output, to working links, and to stating no version and citing
  no internal record.
- **The sibling project, everywhere the site lists its parts** — an HQL tab in
  the top bar that links to its own site, styled as an outlined amber button
  that stretches as the name spells itself out letter by letter on hover
  (configuration, CSS, and one script; no template override), and HQL written
  into the quick start as a fourth install, the Tools nav, the cover, the
  features and vision chapters, and the roadmap's version table and news. The
  roadmap no longer says HQL cannot read HyperMarkDown, which stopped being
  true with its 0.2 line, and its "what is coming" now tells the notebook
  story: cells that compute part of a card, and the wiki dynamics — contents,
  related pages, status boards, indexes, health, summaries — they are for.
- **A roadmap, and one place that carries the version numbers** — news, the
  current version of all four release lines, where the project stands, and the
  epics being aimed at. The cover stops making status claims and points here.
  The page is now the only prose on the site that states a version, so a release
  updates one thing rather than five.
- **The book** — the whole documentation tree builds as one site with the wiki
  as a section inside it, the namespace root living in a subtree, and a
  placeholder marking where the derived wiki section belongs in an authored
  navigation. Pages the author placed by hand are not listed twice.
- **Links that work** — ordinary markdown links to cards repointed at the
  rendered page, fenced paths left alone.
- **Rich content, gated on rendered HTML** — code fences, callouts, maths,
  diagrams, strikethrough, tables, and task lists. The standing lesson from the
  two defects that got through: *a green build is not evidence of correct
  output*, so rendering work asserts on the HTML and never on the configuration.
- **An identity** — the project's mark as logo and favicon, an amber-on-black
  palette, a hero on the cover, and repository links, in configuration and CSS
  alone.
- **A structure** — chapters grouped into things to learn and things to consult,
  a specification tab that leads to normative text, a tutorial that shows source
  before result, and a tools tab that lands on a quick start instead of a
  directory listing.
- **Deployment** — a strict build in CI, publication from a workflow artifact,
  a custom domain on its own certificate, and lockfile-pinned builds, so an
  upstream release arrives as a reviewable change rather than on a routine run.
- **The prose audit**, two dozen items, complete.

## Gates

```bash
uv run python -m pytest tests/test_docs.py tests/test_mkdocs.py
node scripts/build-site-demo.mjs       # the cover's live editor; needs `npm ci`
uv run mkdocs build --strict
uv run mkdocs serve                    # live, watching the namespace root
```

The strict build also runs in CI. Two operational notes worth keeping: the
repository's Pages source must be the workflow, or the build is green and
publishes nothing; and a failed publish must be re-dispatched rather than
re-run, because a re-run adds a second artifact and the deploy then refuses the
run permanently.

## Open questions

| Question | References |
| --- | --- |
| Which successor to follow when the current site generator's 2.0 makes the plugin impossible — a fork that keeps the plugin interface, the theme author's own successor, or the project's own builder? Nothing needs choosing while the current version works, and the reason it can wait is structural: the generator touches exactly one file. Resolution, expansion, URLs, and linting do not import it. The one thing that genuinely leans on it is that the generator computes and validates URLs while the plugin only names sources — a successor has to offer that, or the plugin takes it over | [[hmd-0001#9-mkdocs-integration]] |
| Does the plugin own the site's markdown-extension list, or only document it? | [[hmd-0001#9-mkdocs-integration]] |
| The project's name was decided twice with different capitals. It is `HyperMarkDown`; which later records still say otherwise, and are they worth a pass of their own or only re-spelling when next touched? | — |
| Should the site self-host its maths typesetter to drop its last runtime dependency, or is a CDN acceptable for a documentation site? | — |

## Changelog

- 2026-11-25: Features moved into Language; Learn regrouped; the Wiki tab
  hidden; the tutorial trimmed to what HyperMarkDown adds.
- 2026-11-25: rewrote Vision and Namespaces around cards as knowledge and the
  specification's example-led explanations, with HQL examples and links to
  its blog and book.
- 2026-11-22: the roadmap says where the work goes; the rest of it is an open
  card.
- 2026-11-22: a link-preview card and the tags that carry it.
- 2026-11-22: a live editor in the cover's hero, built from the TypeScript
  implementation and loaded on demand.
- 2026-11-22: the cover's remaining bands — notebooks, search, tools,
  comparison, reading list — and the last of the old prose retired.
- 2026-11-22: the cover's language bands, five of them, and the diagrams they
  carry.
- 2026-11-22: the cover's shell — template, hero, the tabbed window of
  source-and-result pairs, and the guards that keep its samples true.
- 2026-10-19: the HQL tab, linking the sibling project's site from the top bar,
  and HQL written into every page that lists the project's tools.
- 2026-09-15: the roadmap page, replacing the cover's status section, and the
  stale state claims the audit for it found across the site, the READMEs, and
  the trackers.
- 2026-09-14: rewritten in the shape the trackers now use — status first in
  prose, then open work, broken, gaps, and done last.
- 2026-09-14: created. The site's rows moved out of the rendering proposal's
  tracker, which had covered the plugin and the pages it produces as one thing,
  and the repository's standalone prose to-do list was retired into it, every
  one of its items complete.
