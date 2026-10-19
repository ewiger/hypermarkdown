# Cell output

A cell is an [HQL](https://hql.hypermarkdown.org/) query inside a card. Its
result is written into the card as Markdown, after the cell. This page lists
what each kind of value becomes, and how to choose a different format.

## Three kinds of fence

| Fence | Runs | Writes output |
| --- | --- | --- |
| ` ```hql#eval ` | yes | yes |
| ` ```hql#query ` | yes | no. The same as `hql#eval hidden` |
| ` ```hql ` | no | no. Shown as code |

A cell with `id=<name>` makes its value readable by the other cells of the card
under that name. Use `hql#query` for a step other cells read, and `hql#eval`
for what the reader should see.

## The default format

Without a format step, a cell's result is written in the `hmd` format. The
value's type decides the shape.

| Value | Written as |
| --- | --- |
| a list of cards | a bulleted list of wikilinks |
| a list of strings or numbers | a bulleted list |
| a record | a two-column table of keys and values |
| a list of records | a bulleted list of record literals |
| a graph | a fenced `d2` block, drawn as a diagram |
| a string | inserted as Markdown |
| a number or a boolean | its value, on one line |

The examples below run against a vault of four book cards. A list of cards:

````markdown
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

Each entry is a link to the card. To list titles instead, map the cards to
their titles:

````markdown
```hql#eval
books | map(c => c.title)
```
<!-- hql:output hash=0011ebaad6e0 status=ok -->
- Dune
- Emma
- Middlemarch
- The Hobbit
<!-- /hql:output -->
````

A record. `todo` is a query cell that keeps the unread books:

````markdown
```hql#query id=todo
books | filter(c => c.metadata.status == "todo")
```

```hql#eval
{books: books | size, to_read: todo | size}
```
<!-- hql:output hash=779c4eb751ef status=ok -->
| key     | value |
| ------- | ----- |
| books   | 4     |
| to_read | 2     |
<!-- /hql:output -->
````

A graph of the cards and the links between them:

````markdown
```hql#eval
Graph(books)
```
<!-- hql:output hash=668536d3c59c status=ok -->
```d2
emma
middlemarch
dune -> the-hobbit
the-hobbit -> dune
```
<!-- /hql:output -->
````

## Choosing a format

End the query with a format step. The step fixes the output, whatever the
value's type.

| Step | Writes |
| --- | --- |
| <code>&#124; hmd</code> | the default, stated explicitly |
| <code>&#124; markdown</code> | Markdown, inserted as written |
| <code>&#124; text</code> | one line of plain text |
| <code>&#124; json</code> | a fenced `json` block |
| <code>&#124; yaml</code> | a fenced `yaml` block |
| <code>&#124; csv</code> | a fenced `csv` block, a header row then one row per element |
| <code>&#124; hql</code> | a fenced `hql` block holding the value as an HQL literal |
| <code>&#124; d2</code> | a fenced `d2` block |
| <code>&#124; mermaid</code> | a fenced `mermaid` block |

Rows of a table as CSV:

````markdown
```hql#eval
books | map(c => {title: c.title, status: c.metadata.status}) | csv
```
<!-- hql:output hash=9cfe20ab61cb status=ok -->
```csv
status,title
read,Dune
todo,Emma
read,Middlemarch
todo,The Hobbit
```
<!-- /hql:output -->
````

Each step is a shorthand for `format`. The longhand takes options:

| Option | Effect |
| --- | --- |
| `limit = <n>` | write only the first `n` elements, and mark the cut |
| `renderer = "<name>"` | use another renderer for this type and format |

`books | format(Markdown, limit = 2)` writes two links and then
`… 2 more not shown`.

## Errors

A cell that fails writes its error as its output, with `status=error` in the
opening marker. A cell that reads a failed cell does not run, and writes
`skipped: <id> failed`.

## On the command line

`hql eval` and `hql run` print a value as an HQL literal by default:
`[dune, emma]`, not a list of links. `--to <format>` chooses another format,
with the same names as the steps above. `hql render` writes cells in `hmd`, as
described on this page.

The HQL documentation covers formats and renderers in full:
[hql.hypermarkdown.org](https://hql.hypermarkdown.org/).
