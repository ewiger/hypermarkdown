# 0014 — A heading in a non-Latin script cannot be linked

**Column**: todo
**Opened**: 2026-11-22
**Found by**: checking the heading rule against Obsidian's while preparing the
specification's 0.1 release
**Related**: [the format's tracker](../status/lang.md),
[the canonical implementation's tracker](../status/hmd.md),
[the TypeScript implementation's tracker](../status/ts-core.md)

## Decided

This is a decision, taken on 2026-11-22 for the 0.1 specification, not an
open question:

- **Cards are UTF-8, so every script works.** A heading in Cyrillic, Greek,
  Chinese, Arabic, or with accents is linked exactly as an English one is.
- **A heading fragment matches by normalising and comparing.** The fragment
  and each heading's visible text are normalised the same way and compared, as
  Obsidian does and as both implementations do today. The specification states
  the normalisation itself instead of naming a Python library:

  1. Unicode NFC, then case folding.
  2. Punctuation and symbols are dropped; letters and digits are kept in every
     script, accents included.
  3. Whitespace runs collapse to one.

- **Headings that normalise alike: the first wins, and the linter warns.** The
  remedy the specification recommends is an anchor on the heading,
  `# Setup ^setup-linux`, linked as `#^setup-linux`.
- **The `_1` suffix leaves the language.** A site may still use it to build its
  URLs; a link no longer writes it.

## What is broken

Both implementations reduce a heading to ASCII before comparing, because both
follow Python-Markdown's `slugify` — the canonical one by calling it, the
TypeScript one by porting it step for step.

| Heading | Slug today | Effect |
| --- | --- | --- |
| `Ünïcode café` | `unicode-cafe` | accents vanish, so `#cafe` reaches `café` |
| `Ошибка 404` | `404` | only the digits survive |
| `Ошибка` | empty, then `_1` | see below |
| `Ещё раздел` | empty, then `_2` | see below |

A heading with no Latin letters slugs to the empty string, and deduplication
turns empty strings into `_1`, `_2`, … in card order. A fragment in such a
script also slugs to empty, which becomes `_1`. So `[[card#Ошибка]]`,
`[[card#Ещё раздел]]`, and `[[card#任何文字]]` all reach **the first non-Latin
heading of the card**, whatever its text, and no link reaches the second.

## Done when

- The specification's heading-anchor rule is the normalisation above, with no
  reference to Python-Markdown.
- Both implementations match fragments by it, in the same commit, so the
  comparison suite never sees one side alone.
- The shared corpus has a case with headings in at least two non-Latin
  scripts, an accented heading, and two headings that normalise alike, and
  both implementations pass it.
- A link to the second of two alike headings is reported, and the message
  suggests an anchor.

## Not in scope

Heading paths such as `#Chapter#Section`, which Obsidian also has. They wait
for the address grammar of in-card addressing.
