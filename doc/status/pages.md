# STATUS — the site

The TODO for <https://hypermarkdown.org>: the book, the wiki section inside it,
the prose, the branding, and the deployment that publishes them. The MkDocs
*plugin* that turns a card into a page is code and is tracked with the tool that
carries it, in [`hmd.md`](hmd.md); what the site says and how it is arranged is
tracked here.

**This file is the only place work on the site is tracked.** Not the memos under
`doc/memory/`, not the cards under `doc/wiki/`. A decision that needs discussion
is named here as an open question. Update the row in the same commit that
changes the site.

**States** — `done` shipped and gated by a test · `ready` specified, unblocked,
not started · `blocked` waiting on a decision · `parked` started and set aside ·
`open` undecided · `deferred` deliberately not being decided now ·
`part-resolved` half answered, with the rest named in the row · `standing` an
accepted limitation · `lifted` no longer true.

**Snapshot** (2026-09-14) — live, branded, and green under
`mkdocs build --strict`, served from a workflow artifact with the apex domain on
a certificate of its own. The top bar is a structure rather than a table of
contents: `Learn` and `Language` as nested sections, beside `Wiki` and `Tools`.
The normative specification is a card, the teaching page is a separate tab, and
the 24-point prose audit that used to live in `doc/TODO.md` is complete —
every claim it disputed has been rewritten or withdrawn. Nothing is known
broken. What is open is one deferred decision — which MkDocs successor to
follow — and two accepted limitations about what config-only branding can reach.

## Done

### The book

| ID | Work point | Write-up |
| --- | --- | --- |
| S1 | `doc/` builds as a book with the wiki as a section of its nav; the namespace root may be a subtree of `docs_dir` | [0001](../issues/0001-book-and-wiki-in-one-site.md) |
| S2 | `hmd://wiki` marks where the derived section belongs in an authored nav, and the derived section leaves out every page the authored nav already places | — |
| S3 | Ordinary markdown links to `.hmd` files repointed at the rendered card, masked so fenced paths survive | [0002](../issues/0002-md-links-to-cards-404.md) |
| S4 | Fences kept working under Pygments 2.20 — resolved upstream by requiring `pymdown-extensions>=10.21.2` in the base dependencies | [0003](../issues/0003-pygments-220-breaks-code-blocks.md) |
| S5 | Callouts, math, and D2 diagrams render | [0004](../issues/0004-math-callouts-diagrams.md) |
| S6 | Strikethrough, tables, and task lists shown and gated on rendered HTML | [0005](../issues/0005-strikethrough-shown-as-its-own-source.md) |
| S7 | An escaped pipe inside a table code span kept its backslash on the page whose job is to show what to type | [0006](../issues/0006-escaped-pipe-in-a-table-code-span.md) |
| S8 | Branding: the `⚡` as logo and favicon, amber-on-black palette, repository and social links, a hero on the cover. Config and CSS only | — |
| S9 | Front chapters restructured — the cover carries the vision, `features.md` shows what a page can be, `presentation.md` covers conversion targets and viewers. Contributor material left the book for `DEVELOP.md` | — |
| S10 | The top bar leads with the language: a `Language Specification` tab pointing at the card, with the `HMD-NNNN` proposals published but unlisted | — |
| S11 | The specification card rewritten from scratch as normative text, and the page that used to carry its name moved to `hmd-tutorial.hmd` | — |
| S12 | The tab bar became two nested sections — `Learn` and `Language` — so it names subjects instead of listing pages. `nav:` nesting only; no URL moved | — |
| S13 | The `Tools` tab lands on a quick start (`doc/tools/index.md`) instead of a GitHub tree, under `navigation.indexes`. Installing is a page here, reading is a link out | — |
| S14 | The tutorial teaches from source: every construct shows a fenced source block followed by its rendered result | — |
| S15 | `doc/tools/vscode.md` — the extension's landing page | — |
| S16 | The 24-point prose audit of the specification, namespaces, tutorial, introduction, and features pages, completed and retired from `doc/TODO.md` | — |

The standing lesson from S4 and S6: **a green build is not evidence of correct
output.** One was a green build with wrong output, the other a green build with
a wrong claim. Both slipped because no gate looked at rendered HTML. New
rendering work asserts on the HTML, never on the config.

### Deployment

| ID | Work point |
| --- | --- |
| D1 | `mkdocs build --strict` in `.github/workflows/ci.yml` |
| D2 | GitHub Pages published from `.github/workflows/pages.yml`, artifact-based, no `gh-pages` branch |
| D3 | `mkdocs<2`, `mkdocs-material<10` pinned — MkDocs 2.0 removes the plugin system |
| D4 | Builds reproducible from `uv.lock`; CI and the deploy install with `uv sync --locked` |
| D5 | `hypermarkdown.org` serves the site on its own certificate; `www` redirects to the apex |

D2 requires **Settings → Pages → Source: GitHub Actions** in the repository.
With the older *Deploy from a branch* setting the workflow runs green and
publishes nothing. A failed Pages run must be re-dispatched, never re-run: a
re-run adds a second `github-pages` artifact and `deploy-pages` then refuses the
run permanently.

## TODO

### Planned work

| ID | State | Work point | Blocked on |
| --- | --- | --- | --- |
| — | ready | None agreed. The audit is finished and every page it touched is rewritten | — |

### Broken

| ID | State | Defect | Impact |
| --- | --- | --- | --- |
| B1 | tracked in hmd.md | `hyper-markdown.org` answers 404 rather than redirecting: its records point at a forwarding service, but no rule takes effect. Every link published under the old host is dead | External configuration, not a commit. Tracked as W3 in [`hmd.md`](hmd.md#todo) because it is registrar state rather than site content |

### Limitations

| ID | State | Limitation | Why it stands |
| --- | --- | --- | --- |
| L1 | standing | MkDocs is pinned `>=1.6,<2`, and `mkdocs-material` `>=9,<10` | MkDocs 2.0 is a ground-up rewrite published under the same name with **no plugin system** — for this project not a breaking upgrade but deletion, since the entry point is how a card reaches a page at all. It also moves config to TOML with no migration tool. See Q1 |
| L2 | standing | MathJax loads from `unpkg.com` at view time | The site's only network dependency; the build itself is offline. Without it `arithmatex` emits `\(…\)` and typesets nothing, so a reader offline sees math as its own source. Self-hosting would lift this and has not been argued |
| L3 | standing | `validation.links.not_found: info` — a missing link target is reported, not fatal | Cards link out to the repository with ordinary relative links whose targets are real files but not site pages. The cost is that a genuinely broken relative link also only warns; wikilinks are checked by `hmd lint` instead |
| L4 | standing | D2 fences need the `d2` binary; without it a fence degrades to a labelled placeholder and the build stays green | Deliberate — a missing binary cannot fail a build. The cost is that an environment without `d2` ships placeholders silently |
| L5 | standing | `use_directory_urls: false` is a hard usage error, not a supported mode | A card and its folder note share one URL, so directory URLs are required rather than merely preferred |
| L6 | standing | Branding is config and CSS only — no `theme.custom_dir`, no template partials | A `custom_dir` pins the site to Material 9's internal template structure, which is what L1's pin already has to be careful about. Anything needing new markup is not reachable by config alone; Material's `grid cards` via `attr_list` + `md_in_html` is the escape hatch that stays within this limit |

### Open questions and blockers

| ID | State | Question |
| --- | --- | --- |
| Q1 | deferred | Which MkDocs 1.x successor to follow — **ProperDocs**, **Zensical**, or an own `hmd build`? |
| Q2 | open | Does the plugin own `mkdocs.yml`'s extension list, or only document it? |
| Q3 | open | Should the site self-host MathJax to drop its last runtime dependency, or is a CDN acceptable for a documentation site? |

**On Q1.** Three candidates: ProperDocs (oprypin's fork, an exact drop-in that
keeps the plugin API — `mkdocs_plugin.py` would work unchanged and only the
command name changes); Zensical (squidfunk's successor, drop-in for 1.x
*config*, but whether it exposes an equivalent plugin API is the load-bearing
unknown and the only part worth researching before choosing); or an own
renderer, since `urls.py`, `embed.py`, and the resolver already own everything
except templating.

Nothing needs choosing while 1.6 keeps working, and the reason it can wait is
structural: MkDocs touches exactly one file. `parse`, `resolve`, `embed`,
`urls`, and `lint` do not import it. A renderer swap is one file plus
`mkdocs.yml`, not a re-specification. The one decision that genuinely leans on
MkDocs is *MkDocs computes URLs; the plugin only names sources* — a successor
has to offer that, or `urls.py` takes it over.

## Gates

```bash
uv run python -m pytest tests/test_docs.py tests/test_mkdocs.py
uv run mkdocs build --strict
uv run mkdocs serve                           # live, watching the namespace root
```

`mkdocs build --strict` also runs in `.github/workflows/ci.yml`.

## Changelog

- 2026-09-14: created. The site's rows moved out of the HMD-0002 tracker, which
  had tracked the plugin and the pages it produces as one thing, and
  `doc/TODO.md` was retired into it — all 24 of its audit items were complete,
  so what survives is S16 recording that the audit happened and the closing
  observation it left behind: the wildcard-import ordering question was the one
  genuine resolver-design issue it exposed, and it is answered in the
  specification rather than outstanding.
