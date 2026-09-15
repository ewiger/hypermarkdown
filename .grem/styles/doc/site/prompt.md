# Write a page for the public website

Apply this documentation style to the source document named in the prompt
header. Read that document in full first.

**Goal:** Turn that source — a tracker, a proposal, a design card, a pile of
notes — into a page under `doc/public/` that a *user* of HyperMarkDown can read.
The website is built from `doc/` by MkDocs and served at
<https://hypermarkdown.org>. A page here is read by someone deciding whether to
use the format, or already using it and wanting to know what it does.

This is not the style used elsewhere in `doc/`. Trackers, proposals, and memory
notes are written for contributors and argue with themselves in the open. A
website page states conclusions.

## Who is reading

A working engineer who has not read the repository and will not. They arrived
from a search or a link, they will give the page thirty seconds before deciding
whether to keep reading, and they want to know what the thing does and whether
it is real.

Everything below follows from that.

## Register

**Sharp, short, technical.** Declarative sentences. Concrete nouns.

- **Say the thing, then stop.** One idea per sentence. Do not restate it in
  different words for emphasis, and do not close a section by summarising what
  the reader just read.
- **No aphorisms.** A sentence whose job is to sound quotable is a sentence
  doing no work. Cut the closing flourish, the inverted clause, the paradox.
- **No em-dash chains.** One parenthetical aside per paragraph at most. If a
  sentence needs two, it is two sentences.
- **No hedging and no selling.** Not "arguably the most innovative part", not
  "powerful", not "simply". State what it does.
- **Plain words.** *uses*, not *leverages*. *lists*, not *enumerates*. *first
  version*, not *initial iteration*.
- **Second person for what the reader does** ("you get back the cards"), plain
  third person for what the software does. Avoid "we" except for intent —
  what the project plans to build.
- Neutral engineering register. No exclamation marks, no rhetorical questions.

## Content rules

- **Features before mechanism.** Say what a reader can do, then how it works if
  it helps. A user does not need the four-phase resolver to understand
  `[[card]]`.
- **No internals.** Keep CI, release plumbing, credentials, test suites,
  conformance corpora, internal model names, and proposal numbers off these
  pages. They belong in `doc/status/`, `doc/proposals/`, or a tool's
  `DEVELOP.md`. If a reader cannot act on it, cut it.
- **No unexplained internal vocabulary.** A term the project invented needs a
  definition in the sentence that introduces it or it does not appear.
- **State what does not work.** Gaps, drafts, and unbuilt features are stated
  plainly and without apology. A page that only lists strengths is not trusted.
- **Dates, not adjectives.** "0.3.0, released 2026-09-14" beats "recently
  released". Adjectives about time rot silently.
- **One place per fact.** A version number, a release date, or a status claim
  appears on exactly one page. Everywhere else links to it. This is what keeps
  it true: a claim repeated on five pages is a claim that will be wrong on four.

## Structure

- **Open with the answer.** No preamble and no throat-clearing. The first
  sentence of the page says what the page is about.
- **Headings a reader can scan.** `## What works today`, `## What is coming` —
  name the question the section answers. Not `## Overview`, `## Details`.
- **Lists for parallel things**, prose for anything with an argument in it. A
  feature list is a list. A trade-off is a paragraph.
- **Tables for facts with the same shape** — versions, comparisons, options.
  Keep cells to a few words.
- **Fenced code with a language**, and short. Two lines that make the point beat
  twenty that are realistic.
- **Every page ends where the reader goes next.** One or two links, named by
  what they are for, not "click here".

## Mechanics

- Wrap prose at roughly 80 columns.
- `inline code` for identifiers, paths, commands, and syntax.
- **Bold** a term at its first definition. Do not bold for emphasis.
- Relative Markdown links between pages (`../wiki/README.md`,
  `../tools/index.md`). Wikilinks are for cards under `doc/wiki/`, not for
  pages under `doc/public/`.
- Cite by name, never by number. Link a heading or a page; never write
  "section 5.3" or leave a bare identifier standing in place of the claim.
- Add the page to `nav:` in `mkdocs.yml`, or it is built and unreachable.

## Before you finish

- Run `uv run mkdocs build --strict`. A relative link that resolves on GitHub
  can still 404 on the built site.
- Read the page as someone who has never seen the project. Every sentence that
  assumes the repository gets cut or explained.
- Check every version, date, and status claim against the registry or the
  source file, not against other prose in this repository. Prose is what goes
  stale.
- Cut the last sentence of each section. It is usually a summary the reader did
  not need.

## Reference

[`doc/public/roadmap.md`](../../../../doc/public/roadmap.md) is the page this
style was written from. It states every tool's version once, lists what works
as features rather than components, names what is unbuilt, and keeps the design
detail behind it in the wiki card that owns it.
