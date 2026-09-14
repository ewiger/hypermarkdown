# STATUS — `hmd`, the canonical implementation

HyperMarkDown is ordinary markdown plus links into a knowledge graph: a card
names another card and the name is resolved, a card can be built out of other
cards, and a linter checks the whole graph rather than one file at a time.
`tools/hmd` is the **canonical implementation** of that — where a disagreement
between implementations is settled, and where a diagnostic's exact wording is
decided.

It is Python because the format is read and written alongside a documentation
build, and that is where the ecosystem it has to live in already is: MkDocs and
Python-Markdown render the site, the slug algorithm the format adopts comes from
Python-Markdown's table-of-contents extension, and a language server has a
mature library waiting for it. A knowledge base is also edited by people who are
not programmers, and `pip install HyperMarkDown` is a lower step than a
toolchain.

What the package holds:

- **The core** — scanner, parser, heading slugs, frontmatter, resolver, the
  sixteen diagnostics, embed expansion, and the markdown and HTML renderers.
- **The `hmd` command** — `lint`, `render`, `graph`, and `init` over that core.
- **The MkDocs plugin** — the same core wired into a site build, so a tree of
  cards becomes a book.
- **The distribution**, published to PyPI as `HyperMarkDown`.
- **The language server, in future** — so language features live in one place
  and every editor can have them, instead of only the one that embeds the
  TypeScript implementation.

Beside this file: the format itself in [`lang.md`](lang.md), the second
implementation in [`ts-core.md`](ts-core.md), its editor in
[`vsc-ext.md`](vsc-ext.md), and the website in [`pages.md`](pages.md).

## Status

**Complete and released.** Everything the format specifies is implemented —
grammar, resolution, the sixteen diagnostics, embed expansion, both renderers,
the site plugin, publication — and nothing is known broken. 236 tests, three
lint runs over real trees, and a site build stand behind that. `hypermarkdown`
is on PyPI through a trusted publisher, each tool owns its own README, changelog,
licence, and guide, and the repository root is a workspace rather than a package.

**The next piece of work is the language server**, and it is unblocked: the one
thing it needs is the ability to lint text an editor holds in memory rather than
what is on disk, and that turns out to be a patch to a single class, because
every layer beneath it already takes text rather than a path.

**One thing is enforced in the wrong direction.** The corpus of cases that keeps
the two implementations honest is run only by the TypeScript side, so drift is
caught when the newer implementation moves and not when this one does.

Outside the repository, one thing remains broken and cannot be fixed by a
commit: the retired domain does not redirect.

## Open

| Status | Work | Notes | References |
| --- | --- | --- | --- |
| todo | **Run the shared corpus here too.** The cases exist and the other implementation runs them; until this one does, the agreement between them is checked in one direction only, and the comparison suite is doing the real work by shelling out to this linter | Nothing blocks it | [[hmd-0020#10-conformance-canonicity-and-the-drift-ledger]] |
| todo | **Lint text, not just files.** Let a caller hand the workspace index the current contents of a card, consulted ahead of any read. Every layer below already takes text — the gap is exactly the one class that walks the tree and reads each card | First half of what the language server needs | [[hmd-0024#text-not-paths]] |
| todo | **Invalidate one card at a time**, instead of loading the whole tree once when the index is built | Second half. Follows the change above | [[hmd-0024#text-not-paths]] |
| todo | **A determinism test** — the same tree linted twice, and with its files created in a different order, producing identical output. The format leans on this without anything checking it | Nothing blocks it | [[hmd-0020#11-determinism-and-resource-bounds]] |
| blocked | **The language server itself.** A `pygls` server, so completion, rename, and hover exist for any editor rather than only the one embedding the TypeScript implementation | Waits on the two index changes above, and on whether it is a subcommand or its own script | [[hmd-0024#the-language-server-is-python-on-pygls]] |
| blocked | **Redirect the retired domain** to the current one, preserving paths | Registrar configuration, not a commit. See Broken | [[hmd-0005#the-canonical-host-and-the-state-dns-has-to-reach]] |
| parked | **Rename the package inside the parked integration suite** on the extension's old branch, which still uses the pre-rename directory name | Waits on that branch being picked up | [[hmd-0005#the-repository-and-the-urls-that-point-at-it]] |

## Broken

| Status | Defect | Symptom | References |
| --- | --- | --- | --- |
| blocked | **The retired domain answers 404 instead of redirecting.** Its records point at a forwarding service, so the registrar side is half-configured, but no rule takes effect on either scheme | Every link published under the old host is dead. The fix is a web form, not a commit | [[hmd-0005#the-canonical-host-and-the-state-dns-has-to-reach]] |

## Limitations (known gaps)

| Limitation | Why it stands | References |
| --- | --- | --- |
| The workspace index reads every card from disk and cannot be handed an editor's unsaved buffer | Being fixed — it is the first open item above. Worth knowing that it is one layer, not a rewrite: the functions beneath it already take text | [[hmd-0024#text-not-paths]] |
| The TypeScript implementation solved that years earlier in project time, and this one did not | Not a defect, an asymmetry: that one reads through an injectable port because it had to. This one never had a caller that needed it | [[hmd-0020#6-resolver]] |
| The source archive does not ship the example vaults, so linting them does not work from an unpacked archive | The examples are repository fixtures that both implementations lint, with exactly one copy at the root. Carrying them into the package would mean a duplicate tree | [[hmd-0024#where-tests-live-and-what-they-answer-for]] |
| The same gate commands are written in the repository guide and in each tool's guide | The cost of per-tool guides, which removed a worse problem: one guide describing tools it did not live beside. Each tool's guide is authoritative for its own commands; nothing enforces the duplication, and a stale command is a silent defect | [[hmd-0024#a-tools-front-matter-is-its-own]] |
| Installing under the retired name keeps installing the last release published under it, forever, and the retired plugin key survives as an alias | PyPI has no rename. The alias appears in site configs this project does not own, where removing it is a hard build failure whose cause is invisible to the site's author | [[hmd-0005#the-plugin-key-and-the-alias-that-keeps-existing-sites-building]] |
| The retired marketplace publisher and an unregistered npm scope are left as they are | Releasing a publisher name back into the pool lets an impostor take it. Deliberate inaction, not an oversight | [[hmd-0005#the-extensions-identity-on-both-galleries]] |
| Changelog entries keep the old name where they record what a release was actually called | A changelog is a historical record | [[hmd-0005#what-deliberately-keeps-its-current-spelling]] |

## Done

- **The format, entire** — masking and the link grammar, heading slugs taken
  from Python-Markdown so links and rendered anchors cannot disagree, the
  two-phase resolution search with its whole-tree fallback, folder notes, both
  import forms, and embed expansion with a depth cap and cycle detection.
- **`hmd lint`** — sixteen diagnostics with stable identifiers, JSON output, and
  exit codes a CI job can read.
- **`hmd render`** — flat markdown and HTML.
- **`hmd init`** — writes the project marker with every setting at its default,
  creates the namespace root it names, refuses to overwrite an existing config,
  and warns when an enclosing project would silently win.
- **The MkDocs plugin** — cards become pages, folder notes collapse onto their
  directory's URL, links are rewritten, red links render as red links without
  failing the build, embeds expand, and diagrams render through `d2`.
- **Publication** — opt-in visibility inherited from folder notes, unpublished
  cards absent from the built site entirely, and a warning when a published card
  reaches into one that is not.
- **Released and renamed** — on PyPI through a trusted publisher, under a name
  that now matches the domain, the npm scope, and the extension publisher, with
  the old entry point kept working as an alias.
- **The repository layout** — three tools under `tools/`, each owning its own
  front matter with no packaging symlinks, the shared corpus at the root where
  it belongs to every implementation, and a workspace root that is not itself a
  package.

## Gates

```bash
uv sync --locked
uv run python -m pytest
uv run hmd lint --root doc/wiki --strict
uv run hmd lint --root examples/small              # exit 0, exactly one warning
uv run hmd lint --root examples/cs-alg-sorting --strict
uv run mkdocs build --strict
uv build --package HyperMarkDown
```

The one warning over `examples/small` is the deliberate red link that shows what
an unwritten page looks like. A clean run there is a regression, not an
improvement.

## Open questions

| Question | References |
| --- | --- |
| Is the language server a subcommand of the existing command, or its own script? | [[hmd-0024#the-language-server-is-python-on-pygls]] |
| Is its library a base dependency or an optional extra? An extra keeps the plain install small; a base dependency means the server exists wherever the command does | [[hmd-0024#the-language-server-is-python-on-pygls]] |
| Which language features move to the server first, and how does an editor report an absent server without implying the preview failed? That the extension becomes a client of it was settled; the sequencing was not | [[hmd-0024#the-language-server-is-python-on-pygls]] |
| Does canonicity move if a third implementation appears, and what is the procedure? | [[hmd-0020#10-conformance-canonicity-and-the-drift-ledger]] |
| Should `hmd graph` record each card's resolved search path, so a consumer can see what a card reaches without replaying the algorithm? | [[hmd-0001#5-link-resolution]] |
| When is the retired plugin alias withdrawn, and what announces it — a major version, a warning at build time, or nothing? | [[hmd-0005#the-plugin-key-and-the-alias-that-keeps-existing-sites-building]] |
| Does pruning the abandoned PyPI project mean yanking its releases or deleting it? Deletion frees the name for anyone to register and serve to a stale pin | [[hmd-0005#the-python-distribution-its-module-and-the-project-left-behind]] |
| Does the retired domain redirect permanently, or for a fixed window after which the registration is allowed to lapse? A lapsed domain that once served documentation is one someone else can serve anything from | [[hmd-0005#the-canonical-host-and-the-state-dns-has-to-reach]] |
| Should `hmd init` write a starter card in the root it creates? It creates an empty directory today, which lints clean and shows an author nothing — but a card written by a tool is a card somebody has to delete | [[hmd-0001#7-hmd-cli]] |
| Should `init` grow flags for the settings it writes, or is editing the file it just wrote the right affordance? | [[hmd-0001#7-hmd-cli]] |
| Should the linter check a namespace name that does not match the address form? Nothing reads that key yet, and the first thing to read it would be the first thing to break | [[hmd-0004#the-address-form]] |
| Should the specification's version sentence stop being what the repository guard parses, now that a rename has shown the sentence can move? | [[hmd-0005#the-wiki-card-that-carries-the-projects-name]] |

## Changelog

- 2026-09-14: rewritten in the shape the trackers now use — status first in
  prose, then open work, broken, gaps, and done last. Work-point numbers are
  gone: a row is named by what it is. The header now says what HyperMarkDown is,
  why the canonical implementation is a Python package, and what that package
  holds.
- 2026-09-14: created by folding four per-proposal trackers into one file about
  the tool. Language questions moved to the format's tracker and the site's rows
  to the website's; the corpus runner moved in from the editor line's tracker,
  where it had been filed beside the rows that cannot deliver it.
