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

**Nothing is planned.** What is open is one decision deliberately not being
taken — which successor to follow when the site generator's 2.0 arrives without
a plugin system — and a handful of accepted constraints, of which the one worth
revisiting is that maths loads from a CDN at view time.

## Open

| Status | Work | Notes | References |
| --- | --- | --- | --- |
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
| Branding is configuration and CSS only — no template overrides | An override pins the site to the theme's internal template structure, which is exactly what the version pin already has to be careful about. The cost is that anything needing new markup is out of reach; the theme's own grid-card syntax is the escape hatch that stays inside this limit | — |

## Done

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
| Should the site self-host its maths typesetter to drop its last runtime dependency, or is a CDN acceptable for a documentation site? | — |

## Changelog

- 2026-09-14: rewritten in the shape the trackers now use — status first in
  prose, then open work, broken, gaps, and done last.
- 2026-09-14: created. The site's rows moved out of the rendering proposal's
  tracker, which had covered the plugin and the pages it produces as one thing,
  and the repository's standalone prose to-do list was retired into it, every
  one of its items complete.
