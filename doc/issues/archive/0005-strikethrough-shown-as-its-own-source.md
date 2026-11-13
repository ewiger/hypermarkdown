# 0005 — Strikethrough renders as its own source

**Column**: done
**Opened**: 2026-08-07
**Closed**: 2026-08-07
**Found by**: reading the rendered Rich content page
**Upstream**: none — this one is ours

## Symptom

`~~strikethrough~~` on the Rich content page came out as the literal text
`~~strikethrough~~`, in a code font, never struck through.

## Cause

Not the extension, and not the plugin. `pymdownx.tilde` is enabled in
`mkdocs.yml` and works end to end — through the plugin's expansion and link
rewriting, on a real `.hmd` card:

```python
>>> build(..., markdown_extensions=["pymdownx.tilde"])
>>> "<del>" in html
True
```

The page wrote the construct inside backticks:

```markdown
Task lists, footnotes, tables, and `~~strikethrough~~` are all present …
```

A code span is exactly the thing that must *not* render, so it rendered
correctly — as its own source. The sentence names four constructs and
demonstrates two: task lists have a live list, footnotes have a live footnote,
strikethrough is quoted, and tables are not on the page at all.

## Why it went unnoticed

The same failure mode as [issue 0003](0003-pygments-220-breaks-code-blocks.md),
arrived at from the opposite direction. There the build was green and the output
wrong; here the build is green, the output is *right*, and the claim is wrong.
Both slipped for one reason: no gate looked at rendered HTML for these
constructs. `_rich_extensions()` in `tests/test_mkdocs.py` omitted
`pymdownx.tilde` and `pymdownx.tasklist` entirely, so the site could drop either
from `mkdocs.yml` and every test would still pass.

This page opens by saying it exists "so you can see them working, and so a
change that breaks them is visible rather than silent". A page that names a
construct instead of using it cannot do that job — it is a comment claiming to
be a test.

## Fix

Demonstrate every construct the sentence claims. Strikethrough goes bare so it
renders, and a real table replaces the missing one. The rule the page now
follows: on a demonstration page, a construct is shown, never quoted — quote it
only when the point is the syntax itself.

## Guard

`tests/test_mkdocs.py::test_the_free_syntax_survives_the_build` asserts a built
page contains `<del>`, `<table`, and a task-list item, and
`pymdownx.tilde`/`pymdownx.tasklist` were added to `_rich_extensions()` so the
tested extension list matches the one the site ships. As with 0003 it checks the
output, not the configuration.
