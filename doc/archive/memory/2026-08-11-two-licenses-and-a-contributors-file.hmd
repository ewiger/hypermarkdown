# 2026-08-11 — two licenses, and a collective copyright holder

The repository used to make one license claim held by one person: four
byte-identical MIT `LICENSE` files reading `Copyright (c) 2026 Yauhen
Yakimovich`. Both halves of that were wrong, and they are corrected together.

- **The code is MIT** — `tools/`, `examples/`, `tests/`, and the configuration
  at the root.
- **Everything under `doc/` is CC BY 4.0** — the book, the `.hmd` wiki, the
  language specification, and the numbered proposals.
- **Every license file names `HyperMarkDown Contributors`** and points at
  `CONTRIBUTORS.md` rather than at a person.

## Why CC BY, and why not CC BY-SA

MIT is a software license. It says nothing useful about prose being quoted,
translated, or restated, and it asks for no credit when that happens — which is
the entire transaction a specification is offering.

CommonMark puts its spec under CC BY-SA, and this project deliberately does not
follow it there. Share-alike propagates: a specification under BY-SA pushes its
own terms onto the documentation of anything that quotes it substantially. The
whole point of `examples/conformance/cases/` is to invite a third implementation
by somebody else, and a viral clause on the document that implementation is
written from is a tax on exactly the person the corpus exists to attract. CC BY
asks for credit and nothing else, which is the right trade for a document that
wants to be copied.

## Why the boundary is a directory and not a category

"Documentation is CC BY" sounds like the same rule and is not. A category has to
be argued every time somebody adds a file; a directory is answerable by looking
at the path, and a guard can check it. `doc/` is also already the site's
`docs_dir`, so the licensing boundary and the publishing boundary are the same
line, which is one fewer thing to keep in agreement.

The consequence worth stating out loud is that **`examples/` stays MIT on
purpose**, including the conformance corpus, even though the corpus is arguably
part of the specification. Those files get *vendored* — copied into another
implementation's test suite, which is the intended use. An attribution clause on
fixture data is friction for the person doing the thing we want done. That is a
deliberate asymmetry with `doc/`, not an oversight in drawing the line.

## Why a collective holder, and why now

A personal name in a copyright line becomes less true with every merged pull
request, and the alternative to fixing it early is renegotiating it file by file
later, with people who have already contributed under the old line. The list has
one name on it today, which is exactly what makes the move cheap: the same
argument the identity memo makes about the internal capital in the project's
name — the moment to settle a convention is before anyone has relied on it.

## The one-line copyright notice is load-bearing

The obvious rendering of this is two lines, the holder and then a note pointing
at `CONTRIBUTORS.md`. **Do not split it.** GitHub identifies a repository's
license with `licensee`, which strips any line opening a copyright claim and
then scores what remains against the canonical license text by unique-word
overlap, at a 98% threshold. The holder's name is therefore free — the whole
line is discarded. A note on a *second* line is not discarded, and adds around a
dozen novel words to a set of 93.

Measured against the MIT text, the variants come out as:

- folded onto the copyright line, absolute URL and all — **100%**
- note on its own line, short and relative — 97.4%
- note on its own line, absolute URL — 93.9%

Only the first keeps GitHub reporting the repository as MIT at all; the others
report no detected license. The budget is three novel words, so there is no
shorter phrasing that survives on a line of its own. `tests/test_docs.py`
asserts the exact line and says why, because this is the kind of formatting a
later editor improves without knowing it is load-bearing.

## Where the claim is written

The five license files, `CONTRIBUTORS.md`, the README badge pair and its
`## License` section, `overrides/partials/copyright.html`, the three guards in
`tests/test_docs.py`, and this memo. Anything that changes the split has to move
all of them.

`mkdocs.yml` has no `copyright:` any more, and that is deliberate rather than an
omission — two claims do not fit in one string, and a setting the override
ignores is a second claim free to drift from the first.

## What is deliberately untouched

Per-file copyright headers, which the repository has never had and does not
gain. They are a pre-git convention for files that travel alone; here the
license follows from the path, and fifty headers would be fifty things to keep
in step with `LICENSE`. The `license = "MIT"` metadata in `pyproject.toml` and
both `package.json` files is still accurate — PyPI, npm, and the marketplace
read those fields rather than the file, so none of them is affected by any of
this.
