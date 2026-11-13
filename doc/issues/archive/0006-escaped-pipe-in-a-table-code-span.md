# 0006 — `\|` inside a table code span keeps its backslash

**Column**: done
**Opened**: 2026-08-07
**Closed**: 2026-08-07
**Found by**: writing the F2 row of the format specification card
**Upstream**: none — Python-Markdown is behaving correctly

## Symptom

The aliased-wikilink row of the published **The format** page rendered as

```text
[[page\|display text]]
```

with a literal backslash, on the page whose entire job is to show an author what
to type. Four sources carried the same construct.

## Cause

A pipe inside a markdown table cell has to be escaped or it ends the cell. A
backslash inside a **code span** is not an escape — code spans are literal by
definition. Put the two together and the escape the table requires becomes text
the code span must show:

```python
>>> markdown.Markdown(extensions=["tables"]).convert(r"| a |\n| --- |\n| `x\|y` |")
'…<td><code>x\\|y</code></td>…'
```

The HTML entity does not help either — inside a code span it is escaped in turn,
so `` `x&#124;y` `` renders as `x&#124;y`. Both mechanisms fail for the same
reason, which is that a code span is doing exactly what it promises.

## Fix

Drop the code span and write the cell as raw inline HTML, where the entity is
not re-escaped:

```markdown
| <code>[[page&#124;display text]]</code> | … |
```

Applied to `doc/public/format.md`, `doc/wiki/hmd-format-specification.hmd`,
`doc/models/requirements/initial_sketch.md`, and
`doc/status/hmd.md`.

## Guard

`tests/test_docs.py::test_no_escaped_pipe_inside_a_code_span` scans every
tracked `.md` and `.hmd` source for a backslash-pipe inside backticks and fails
with the offending file and line. This one gates the **sources**, not the
rendered output, because the defect is authored rather than produced — the
renderer's behaviour is correct and will not change.
