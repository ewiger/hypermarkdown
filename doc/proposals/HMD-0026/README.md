# HMD-0026: HQL cells — a card as a notebook

**Status**: drafted
**Created**: 2026-10-19
**Source**: [HQL's record of cells, shared values and saved outputs](https://github.com/ewiger/hql/blob/main/doc/proposals/HQL-0009/README.md),
and the `hql render` host it specifies

## Abstract

A card can carry HQL **cells**: fences whose info string opens `hql#eval` or
`hql#query`. An `hql#eval` cell's output is saved in the card; an `hql#query`
cell is `hql#eval hidden` — it runs so other cells can read its value, and
shows nothing of its own. A fence marked plain `hql` is a **listing** — HQL
shown as code and never run. The VS Code preview draws a cell as the output its last run saved in
the card, rendered like the rest of the card, with the code hidden behind a
**Code** toggle and **Edit** and **Run** beside it. Opening a card runs nothing.
Running a cell is an explicit act in a trusted workspace: the extension hands the
card to the `hql` binary with `hql render --emit after --envelope json`, checks
that HQL found the same cells it did, and writes each output back into the card
between `<!-- hql:output -->` markers, as an ordinary undoable edit, in exactly
the bytes `hql render` itself would write. Whether a saved output is current or
stale is computed from the card's text alone, by the hash HQL defines, so the
preview can say so without running anything. The document IR gains a
`CellBlock` and moves to version 3.

## Motivation

- **The notebook already exists, and nothing in the editor shows it.** HQL
  defines cells, shared values between them, saved outputs, a hash that tells a
  current output from a stale one, and a JSON interface for an editor to drive.
  The extension draws a cell as an ordinary code block, and draws the saved
  output's markers as literal text, because its renderer escapes HTML.
- **A reader opens a card for the answer, not the query.** A table of contents
  built by a cell should read as a table of contents. The query that builds it
  is for whoever maintains it, one click away, as a notebook hides a cell's
  source until it is wanted.
- **"Is this fence code to read or code to run?" has no answer today.** HQL's
  `hql render` runs every fence opening with `hql`, which leaves an author no way
  to show an HQL example in a card without it executing, and makes every HQL
  snippet in a tutorial card a cell by accident. This record answers it.
- **Running code from a card is a new kind of act for the extension.** Until
  now it ran one process, `d2`, on a diagram's text, to draw a picture. A cell is
  a program over the vault, its result is written into the card, and the card
  may have come from a cloned repository. The rules for when that happens, and
  what it may touch, need to be written down before it ships.

**What this must not break.** A card with cells must render completely on a
machine with no `hql` installed, in an untrusted workspace, and in a virtual
workspace — showing what was saved, and saying plainly what cannot be done.

## Goals

- One rule for which fences run, stated in this repository and kept by the
  editor whatever `hql render` does.
- A preview whose default view of a cell is its output.
- Outputs written so that the card stays a valid input to `hql render`, and
  rendering it again with HQL changes nothing.
- Staleness that is visible without running anything.
- No run the reader did not ask for.

## Non-goals

- **Evaluating HQL in the extension.** The binary evaluates; the extension
  runs it and writes what it answered. A second evaluator is a second language
  implementation, which is HQL's to build if anyone's.
- **A kernel.** No process stays alive between runs and nothing is cached
  between them. HQL's own record rules a kernel out, and the extension does not
  add one.
- **Running cells on open, on save, or on a timer.** The saved output is what a
  card shows until someone presses Run.
- **The site build.** Whether MkDocs runs cells, or hides their code the way the
  preview does, is the canonical implementation's to decide and is an open
  question below.
- **VS Code's notebook API.** A `.hmd` card stays a text document with one
  editor; turning it into a notebook document would give it a second editor
  whose model is cells, not text, and every other feature of the extension —
  links, embeds, diagnostics, scroll sync — reads text.
- **Designing HQL.** The cell syntax, the attributes, the marker format, and the
  hash are HQL's. This record says which of them the editor relies on and how.

## Specification

### Which fences run

A fence's kind is the first word of its info string. The kind decides whether
it is a cell.

| Kind | What it is | What the preview draws |
| --- | --- | --- |
| `hql#eval` | a cell; its value is written into the card | the saved output, code hidden |
| `hql#query` | a cell, always hidden: `hql#eval hidden` | a line saying it runs for the cells that read it |
| `hql` | a **listing**: HQL to read | the code, as a code block |
| anything else | an ordinary fence | as before |

- A fence whose kind is `hql#eval` or `hql#query` MUST be a cell, and every
  other fence MUST NOT be. Matching is exact and case-sensitive, as HQL's is.
- A bare `hql` fence MUST NOT run, MUST NOT be passed to HQL as a cell, and its
  `id`, if it carries one, MUST NOT be a name other cells can read. A listing is
  how a card shows HQL — a tutorial, an example, a query someone is to copy —
  and code that runs because it was quoted is the failure this rule exists to
  prevent.
- An `hql#query` cell MUST behave exactly as `hql#eval hidden`: it runs, its
  value is readable by its `id`, and it keeps no saved output. The split is
  between computing a value and showing one. A card builds its answer in
  queries — the set of open items, the cards under a tag — and shows it in
  evals, so a reader sees the result and not every step that led to it, and an
  author never has to remember to write `hidden` on a step.
- `hql#declare`, and any other `hql#…` kind HQL does not run, is a listing until
  HQL defines it.

The words after the kind are a cell's attributes, and they mean what HQL says
they mean:

- `id=<name>` names the cell's value for the other cells of the card. A name is
  `[a-z_][a-z0-9_]*`; anything else is not an id.
- `hidden` runs the cell for the cells that read it, and keeps no output. On
  an `hql#query` cell it is implied, and writing it changes nothing.
- `after` and `replace` say where `hql render` puts an output when it builds a
  page. The editor always writes an output after its cell, whatever the cell
  says: it is editing the source, and replacing a cell with its output would
  delete the cell from the card being edited.

````markdown
```hql#eval id=books
cards | filter(c => c.name != "contents") | sort(by = c => c.title)
```

```hql
cards | size
```
````

The first is a cell; the second is a listing.

### Where a fence starts and ends

The editor finds cells by HQL's rule, not CommonMark's, because what matters is
agreeing with HQL about which fence is which cell.

- A line that begins with three backticks, with no indentation, opens a fence.
  The next such line closes it, whatever follows the backticks. A fence that is
  never closed runs to the end of the card.
- Cells are numbered in card order from `0`, counting only cells — listings and
  other fences do not take a number.

The consequence is accepted: a cell written inside a list item, behind an
indent, or inside a four-backtick fence is not a cell to either side, and is
drawn as whatever CommonMark makes of it.

### Saved outputs

A cell's output is saved in the card directly after it, between two markers.

```text
<!-- hql:output id=<id> hash=<12 hex> status=ok|error|skipped -->
...Markdown...
<!-- /hql:output -->
```

- An output belongs to the cell above it when nothing but blank lines stands
  between the closing fence and the opening marker, and when the marker names
  no `id`, or the cell's own.
- An output that belongs to no cell — after a listing, below a cell of another
  id, or standing alone — is an **orphan**. The preview MUST draw an orphan's
  Markdown without its markers, and the editor MUST NOT write to it. `hql
  render` removes orphans; the editor leaves that to it.
- The preview MUST NOT show a marker as text, anywhere.
- When the editor writes an output, it MUST write it on the line directly after
  the closing fence, with no blank line between, replacing any output that
  belonged to the cell along with the blank lines before it. The marker carries
  `id=` only when the cell has an id. A hidden cell that ran keeps no output,
  and any it had is removed. A card whose last line was the closing fence, with
  no newline after it, gains one before the marker and none after it.
- That layout is the one `hql render --emit after` writes, so a card the editor
  wrote is one HQL would not change. This is the property that lets the editor
  write one output at a time without rewriting, or even reading, the others.

### Current, stale, and not run

Each cell has a hash, computed from the card as it stands. A saved output
records the hash it was written from.

```text
hash(cell) = hex(sha256(
    "hql-cell\0" || normalized(source) || "\0" ||
    join("\0", sorted(dep.id || "=" || hash(dep) for dep in reads(cell)))
))[0..12]

normalized(source) = each line with trailing whitespace removed,
                     trailing blank lines removed, joined with "\n"
```

- `reads(cell)` is lexical, as it is in HQL: every name in the cell's source
  that is another cell's id, minus a name the cell binds itself with `name =`
  at the start of a line, and never a field after a `.`, a named argument
  before `=`, or anything inside a string literal, a document reference, or a
  `//` comment. A source that does not lex reads nothing.
- An output is **current** when its hash equals the cell's, and **stale**
  otherwise. The editor MUST compute this from the text alone, without running
  anything. A current output means "produced by this code", not "true of the
  vault today": a card edited elsewhere in the vault changes no hash.
- A cell with no saved output is **not run**. A hidden cell with no output is
  **hidden**, not "not run": it never keeps one.

The formula and the `reads` rule are HQL's. They are restated here because
the editor implements them, and the extension's tests pin hashes the binary
produced, so a change on HQL's side fails a test here rather than drawing every
output as stale.

### What the preview draws

A cell is drawn as the answer first.

- By default the preview MUST show the cell's saved output, rendered exactly as
  the same Markdown would render anywhere else in the card: wikilinks resolve
  and navigate, red links are red, a `d2` fence in an output is drawn as a
  diagram. HQL writes a list of cards as a list of wikilinks, so a cell that
  lists cards renders as a list of links into the vault.
- The cell's code MUST be hidden by default. A **Code** toggle shows it in the
  preview, read-only. The reader's choice MUST survive a new output and a
  re-render, and MUST be forgotten when the preview is closed; it is a way of
  looking at the card, not a property of it.
- **Edit** moves the editor to the cell's first line of code, in the card's own
  editor. Editing a cell is editing the card.
- **Run** runs the cell, as the next section specifies. It is offered only for
  cells of the card on screen: a cell drawn inside an embed belongs to another
  card, and running it from here would write into a file the reader is not
  looking at.
- A small bar names the cell's kind and id and its state — current, stale,
  error, skipped, not run, hidden — and stays quiet until the cell is hovered,
  unless the output is stale or failed, which it says without being asked.
- A cell with no output shows a line saying it has not run. A hidden cell
  shows a line saying it runs for the cells that read it.
- A cell being run is marked as running and its Run button is disabled until
  the run ends.

In the editor, each cell carries code lenses: **Run cell**, **Run all cells**
on the first cell, and its state. Two commands do the same from the palette:
*Run HQL Cell* runs the cell under the cursor, *Run All HQL Cells* every cell of
the card.

### Running a cell

A run is something the reader asked for, and it is the only time the extension
starts `hql`.

- Nothing MUST run when a card is opened, previewed, edited, or saved.
- A run MUST be refused in an untrusted workspace, with a message saying why.
  The saved outputs are still drawn.
- A run MUST be refused for a card that is not on the local disk, or that no
  vault claims. HQL reads a directory; a virtual file system offers none.

**Which binary.** The first of these that exists is used, and remembered for
the session:

1. `hyperMarkdown.hql.path` — an explicit path. It never falls through: a
   setting that names nothing is reported, not quietly replaced by another
   binary.
2. the `hql` bundled in the extension, when the build carries one.
3. `hql` on `PATH`. A shell alias is not on `PATH`.

With none found, the message names what was looked for and where to get HQL.

**The invocation.** The card's text — the open buffer, saved or not — goes to
HQL on standard input:

```text
hql --vault <vault root> render --emit after --envelope json [--cell <id>] -
```

- `<vault root>` is the namespace root of the vault that claims the card, so
  the names HQL gives cards are the names the card's own links use. The process
  runs in that directory.
- A cell with an id runs with `--cell <id>`: HQL runs it and the cells it reads,
  and no others. A cell without an id has no name HQL can be asked for, so the
  whole card runs, and only that cell's output is written. *Run all* runs the
  whole card and writes every cell's output.
- Before the card is handed over, it is masked: every listing's kind is renamed
  from `hql` to `txt`, so HQL neither checks nor runs it, and every `hql#query`
  fence without `hidden` gains it, so HQL keeps no output for it. Neither
  rewrite touches a cell's source, so every hash is unchanged. The extension
  uses no offset HQL reports — cells are matched by order and hash — so the
  mask is free to change the length of a line. It is a bridge, described under
  the divergence below.
- Nothing from the card reaches the command line except a cell id, which is
  `[a-z_][a-z0-9_]*` and so cannot be read as an option. There is no shell.

**Bounds.**

- card size: `1 MiB` (`1048576` bytes); a larger card is refused before HQL is
  started.
- run time: `30 s`; the process is killed after it.
- answer size: `32 MiB`.

**Checking the answer.** HQL answers with one JSON object listing every cell
it found, in card order, with its index, id, hash, status and Markdown.

- If the answer is not that object, the run MUST fail with what HQL wrote on
  standard error, and nothing is written.
- The number of cells and each cell's hash MUST equal the cells and hashes the
  editor computed. Otherwise the run MUST fail without writing anything: the two
  have read the card differently, and an output written at a position one side
  computed for the other's cell would land in the wrong place.

**Writing the answer.** For each cell asked for:

- `ok`, `error` and `skipped` are written, as saved outputs specify. A failed
  cell's output is its error, as a notebook shows one.
- `not-run` writes nothing and leaves whatever was saved. It is what HQL
  reports for a cell it did not run because another cell of the card does not
  check, and the reader MUST be told so, with HQL's first error.

The edits are applied to the open document as one ordinary edit: the preview
shows them at once, undo takes them back, and the card is saved when the author
saves it. If the document changed while HQL ran, the answer describes a card
that no longer exists: it MUST be dropped, and the reader told to run again.

### The document IR

A cell is its own block in the IR, for the reason a diagram is: what it shows
comes from a process the core cannot run, can be stale, and is drawn with its
code behind a toggle.

```text
CellBlock := {
  kind:     "cell"
  key:      string        // "cell:" + id, or "cell:#" + index
  index:    number        // among the cells of the card it was written in
  language: string        // "hql#eval" | "hql#query"
  id:       string | null
  hidden:   boolean
  source:   string        // the fence body, verbatim
  hash:     string        // the cell's hash, from the card as it stands
  output:   null | {
    status:  "ok" | "error" | "skipped" | null
    hash:    string | null  // the hash the output was written from
    current: boolean        // hash == the cell's hash
    blocks:  Block[]        // the saved Markdown, rendered as the card's own
  }
  span:     Span          // line of the opening fence
}
```

- `Block` becomes `HtmlBlock | EmbedBlock | DiagramBlock | CellBlock`, and
  `IR_VERSION` becomes **3**. A webview receiving another version refuses to
  render and says the window needs a reload.
- A cell's key is its name, not its content. Running a cell changes its output,
  and the element on screen — with the reader's choice to show the code —
  should survive that.
- Cells are found in the whole card even when only part of it is rendered, as
  an embed of one section is: a cell's hash depends on cells it reads, which the
  section may not contain.
- The core finds cells, computes hashes, and renders outputs. It runs nothing.

### Where `hql` is needed, and where it is not

- `hql` MAY be required by: pressing Run, the run commands.
- It MUST NOT be required by: opening a card, drawing a cell, telling a current
  output from a stale one, the preview as a whole, diagnostics, the index, or
  resolution.

### The divergence with `hql render`

`hql render` 0.4.2 differs from this record twice. It runs a bare `hql` fence
as a cell, where this record says it is a listing. And it writes an output for
an `hql#query` cell, where this record says a query is hidden.

- The editor MUST keep this record's rules whatever HQL does. Both are applied
  by the mask before HQL sees the card; a listing is drawn as code, and a query
  as a hidden cell.
- An output already saved after a query cell — written by `hql render` from a
  shell — is drawn, since it is in the card, and removed the next time the
  editor runs that cell.
- HQL is asked to adopt both rules, after which the mask is removed. Until then
  a card rendered with `hql render` from a shell runs its listings and writes
  its queries' outputs, and HQL's own example notebook, written with bare `hql`
  fences, renders in this preview as three listings and no cells. That is the
  rule working as stated, and the example is HQL's to update.

### Outputs are part of the card

A saved output is Markdown in the card, and everything that reads the card reads
it: a wikilink in an output is a link, appears in the graph, counts as a
backlink, and is linted like any other. A table of contents built by a cell
therefore links to every card it lists, which is what a hand-written one would
do. An output never written — a cell that has not run — contributes nothing.

## Use cases

**A table of contents.** The output is the list; the query is behind Code.

````markdown
# Contents

```hql#eval id=books
cards
| filter(c => c.name != "contents")
| sort(by = c => c.title)
```
<!-- hql:output id=books hash=7282fba97096 status=ok -->
- [[dune]]
- [[emma]]
- [[middlemarch]]
- [[the-hobbit]]
<!-- /hql:output -->
````

**A view built on another cell.** A query computes a value and shows nothing;
an eval shows it. Each reads the cell before it by its id, and its hash
includes that cell's, so editing `books` makes everything below it stale.

````markdown
```hql#query id=todo
books | filter(c => c.metadata.status == "todo")
```

```hql#eval
todo | map(c => c.title)
```
````

**An example to read.** A tutorial shows a query without running it.

````markdown
```hql
cards | lexical("night hunting birds") | take(3)
```
````

All three are in `examples/notebook/`, with outputs the binary wrote. A cell
whose value is a list of cards renders as a list of wikilinks, because a card
is what it lists; a cell that maps cards to their titles renders as a list of
titles.

A table of contents of **one card's own headings** is not expressible yet: a
cell sees the vault as `cards`, and HQL does not yet give a cell the card it is
written in or a card's headings.

## Backwards Compatibility

- **`IR_VERSION` moves from 2 to 3.** A stale webview after an update shows the
  reload message rather than a broken page, as it did for the move to 2.
- **A `hql#eval` or `hql#query` fence changes how it is drawn**: from a code
  block to a cell. Nothing about it changes as a link target, an edge, or a
  diagnostic, since fence bodies were never scanned for links.
- **A bare `hql` fence is drawn as it was**, a code block.
- **A saved output stops showing its markers.** It was drawn as two lines of
  escaped comment text around its Markdown, which was a defect.
- No card changes on disk until someone runs a cell in it.

## Security Considerations

A card can come from a cloned repository, and a cell is a program over the
reader's files.

- **Nothing runs without a click, and nothing runs untrusted.** Opening,
  previewing, and saving never start a process; a run needs a trusted
  workspace and an explicit Run.
- **The language has no effects the editor enables.** HQL cells are pure; the
  one kind that would change a store, `hql#declare`, is not a cell here. A cell
  reads the vault it is handed and writes standard output.
- **The command line carries no card text.** The card goes on standard input;
  the only argument derived from it is a cell id, constrained to
  `[a-z_][a-z0-9_]*`. There is no shell and no temporary file.
- **The output is untrusted Markdown, and is rendered as such.** It goes
  through the same renderer as the card, which escapes raw HTML, so an output
  cannot put markup or script into the webview. A diagram in an output is drawn
  as an image, as every diagram is.
- **The write is bounded and checked.** Size and time bounds are pinned above;
  an answer whose cells disagree with the card's is refused; an answer for a
  card that changed is dropped. The edit is an ordinary one, so undo reverses
  it.
- **The binary is the user's.** The extension runs the `hql` the reader named,
  the bundled one, or the one on `PATH`, and downloads nothing.

## Deployment / Activation

1. Land `CellBlock`, the cell scanner, the hash, and `IR_VERSION` 3 in the core.
   This ships value alone: saved outputs draw as outputs, markers disappear, and
   staleness shows, with no `hql` anywhere.
2. Land the engine, the trust and version guards, the Run button, the code
   lenses, and the two commands.
3. Ask HQL to treat a bare `hql` fence as a listing; remove the mask when it
   does.
4. Decide whether the extension bundles `hql` the way it bundles `d2`.

## Reference Implementation

```text
tools/hmd-ts-core/src/
  cell/cells.ts            cells, outputs, reads, hashes, the mask, the output edit
                           (`maskForHql`, `outputEdit`)
  ir.ts                    CellBlock, IR_VERSION 3
  render.ts                cells and their outputs into the IR; orphan markers
tools/hmd-vsc-ext/
  src/hql/engine.ts        finding hql, the invocation, the agreement check
  src/hql/options.ts       hyperMarkdown.hql.path and the bundled path
  src/hql/runner.ts        trust, the version guard, the edit, code lenses
  src/protocol.ts          runCell, runAllCells, running
  src/preview/controller.ts  runs the card on screen
  src/catalog.ts           diagrams inside outputs
  media/render.ts          the cell: output, Code, Edit, Run, state
examples/notebook/         a vault whose contents card is three cells and a listing
```

## Test Plan

Unit tests MUST include:

- `hql#eval` and `hql#query` are cells; `hql` and every other kind are not.
- `hql#query` is hidden; it keeps no output when it runs, and keeps its error
  when it fails.
- A fence closes on the next backtick line, whatever its info string.
- Hashes equal those `hql` 0.4.2 wrote, for a cell that reads nothing and for
  cells that read one another; trailing whitespace changes no hash.
- `reads` ignores fields, strings, comments, a cell's own id, and a name bound
  at the start of a line, and reads nothing from source that does not lex.
- An output attaches across blank lines, and one naming another cell's id is an
  orphan.
- The output edit equals what `hql render --emit after` wrote, for a
  replacement across blank lines, an insertion before following text, an
  unterminated last line, and a hidden cell.
- Masking renames a listing without changing the card's length, marks a query
  cell `hidden` once, keeps line endings, leaves closing fences alone, and
  changes no hash.
- The preview shows the output and hides the code; the code toggle survives a
  new output; a changed cell is stale; an embedded cell has no Run button; a
  running cell's button is disabled; no marker text reaches the DOM.
- The engine passes `--cell` for a named cell and not for an anonymous one,
  masks listings on stdin, writes only the cells asked for, writes nothing for
  `not-run` and says why, refuses an answer whose hashes disagree, reports
  standard error when there is no envelope, and does not fall through from a
  configured path.

Integration tests MUST include:

- Against a real `hql`, when `HQL_BIN` names one: a card the extension wrote is
  one `hql render --emit after` returns unchanged.

```bash
npm run -w tools/hmd-ts-core test
npm run -w tools/hmd-vsc-ext test
HQL_BIN=/path/to/hql npm run -w tools/hmd-vsc-ext test
```

## Open Questions

- Will HQL treat a bare `hql` fence as a listing and an `hql#query` cell as
  hidden, so that the mask goes and a card renders the same from a shell as
  from the editor?
- Does the extension bundle `hql` from the toolchain release, as it does `d2`,
  so Run works on a fresh install? HQL publishes binaries for Linux and macOS
  only.
- Does the site build run cells, show saved outputs as they are, or hide a
  cell's code the way the preview does? Today it shows the code and the output,
  and its renderer passes the markers through as invisible comments.
- Should *Run all* offer to run only the stale cells, given that HQL evaluates
  the whole card either way?
- When HQL gives a cell the card it is written in and that card's headings, is
  a per-card table of contents a cell like any other, or a format feature?

## Changelog

- 2026-10-19: drafted, with the core and extension implementation alongside.
- 2026-10-19: `hql#query` is `hql#eval hidden`; the mask carries that rule to
  HQL as well as the listing rule.

## See also

- [HQL's record of cells, shared values and saved outputs](https://github.com/ewiger/hql/blob/main/doc/proposals/HQL-0009/README.md)
  — the cell syntax, the attributes, the marker format, the hash, and the JSON
  envelope this record relies on.
- [HQL's command-line host](https://github.com/ewiger/hql/blob/main/doc/models/behavior/cli.md)
  — `hql render` and its options.
- [HMD-0020](../HMD-0020/README.md) — the document IR this record extends.
- [HMD-0021](../HMD-0021/README.md) — the preview, its message boundary and its
  webview hardening.
- [HMD-0022](../HMD-0022/README.md) — the diagram block, the first block drawn
  from a process the core cannot run.
- [HMD-0003](../HMD-0003/README.md) — the reservation of the query language,
  superseded by HQL.
