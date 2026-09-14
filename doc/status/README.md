# Status

Where everything stands, one file per thing that ships. Open the file for the
thing you care about; this page is the one-line version of each.

| Tool | Covers | Where it stands | Next |
| --- | --- | --- | --- |
| [**language**](lang.md) | The format itself — grammar, resolution, frontmatter, diagnostics, publication | Specified and implemented twice, with the specification a single normative text | Decide whether headings written with an underline are addressable, since the tools and the website currently disagree |
| [**hmd**](hmd.md) | The canonical implementation: the CLI, the core, the site plugin, the package | Complete and released; everything the format specifies is implemented | The language server, and the two index changes it needs |
| [**@hypermarkdown/core**](ts-core.md) | The format in TypeScript, held to the canonical implementation by a shared corpus | Complete except publication, and byte-identical to the canonical linter on everything it implements | Port the publication model, once the specification says which proposal owns it here |
| [**VS Code extension**](vsc-ext.md) | The hmd preview, diagnostics, and the graph, inside the editor | `0.2.0` live on both galleries and `0.3.0` cut, still labelled a preview release | The graph tab — the feature the preview label waits on |
| [**website**](pages.md) | <https://hypermarkdown.org> — the book, the prose, the branding, the deploy | Live and building clean; the prose audit is finished | Nothing planned |

## How these files work

Each tracker reads in one order, and it is the order a reader asks in:

1. **Status** — what is happening, in prose. No tables, no identifiers.
2. **Open** — what is not done, each row marked `todo`, `doing`, `backlog`,
   `blocked`, or `parked`, with blocked rows naming what unblocks them.
3. **Broken** — defects, each with the symptom you would actually see.
4. **Limitations (known gaps)** — accepted, not being fixed, each with why it
   stands. A defect is a promise to fix; a limitation is a decision not to.
5. **Done** — last, one line per shipped capability. The detail lives in each
   tool's `CHANGELOG.md`.

Then the gates that verify it, the open questions, and a changelog of edits to
the tracker itself.

**A row says what it is, not where it came from.** Anything a reader would have
to look up — a rule identifier, an issue number — trails the sentence in
brackets and never replaces it. Nothing here should require opening another file
to understand.

**Every table carries a `References` column, and it is the last one.** It holds
the references that back the row — a reference names its target rather than
numbering it, so `[[hmd-0021#10-deferred-tabs]]` and never a section sign and a
number. A row with nothing genuinely behind it carries `—` rather than a
plausible guess. This is the column that replaced an earlier `Spec` column
answering "which proposal section": the question was never wrong, the answer
was, because a number tells a reader where something currently sits and that is
the one fact guaranteed to change. The address grammar these references use is
specified in [HMD-0006](../proposals/HMD-0006/README.md); the wikilinks resolve
once the documentation tree is a vault, and until then they are read rather than
followed.

**Update the tracker in the same commit that changes the code.** A tracker
updated afterwards describes a repository that no longer exists, and one updated
in advance describes one that does not exist yet.

These are not the board. [`doc/issues/`](../issues/) carries work in flight, one
numbered card each; a card picked up becomes a row here, and the row is the
durable half. Proposals under [`doc/proposals/`](../proposals/) record decisions
and carry no trackers of their own.
