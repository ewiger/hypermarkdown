# HMD-0031 — Errata

Places where the specification contradicts itself, or where a page that
describes it says something the specification no longer says. Each is a
correction to what the text already intends, not a new decision, unless the
finding says otherwise.

## A written card extension never reaches the binding step

**What the text says.** The grammar says a `page_ref` may carry a trailing card
extension, which is stripped before matching, after which only that extension
binds. `bind(dir, parts, ext?)` takes the extension. The resolution algorithm
computes `ext` and then calls `bind(root, parts)` in the absolute phase,
`bind(dirname(base), [basename(base)])` in the relative phase, and
`bind(dir, parts)` on the spine and on imported search paths. Only the sweep,
through `cards_below(…, ext)`, honours it.

**Why it matters.** Read literally, `[[/owl.md]]` binds `owl.hmd` where both
exist, which is exactly what the grammar rule forbids. Two implementations
following the text could disagree, and both could cite it.

**Candidate resolution.** Pass `ext` in every call:

```text
1. ABSOLUTE     return bind(root, parts, ext) or Unresolved
2. RELATIVE     return bind(dirname(base), [basename(base)], ext) or Unresolved
3. Phase 1      r := bind(dir, parts, ext)
   Phase 2      r := bind(dir, parts, ext)
```

**Evidence in the corpus.** `markdown-shadowed` pins `[[owl.md]]` in the
unqualified form only. The absolute and relative forms are untested, so
whether any implementation already gets them right is unknown.

## The reserved namespace form is a valid name by the grammar

**What the text says.** The reserved characters inside a target are `[`, `]`,
`|`, `#`, `^`, and newline, and `/` separates segments, so `a:b` is a valid
`segment`. *Not in this version* says a cross-namespace address of the form
`namespace:path/to/card` is reserved, and that an implementation MUST treat it
as a malformed target.

**Why it matters.** The two rules cannot both hold. Nothing says which targets
are "of the form": `[[Note: draft]]`, `[[C:/notes]]`, and `[[std:list]]` are
all ambiguous today.

**Candidate resolutions.**

- Any target containing `:` is the reserved form, and HMD010. Simple, but it
  takes away every name with a colon.
- Only a target whose first segment is a name followed directly by `:`, with no
  space after it, is the reserved form. `[[Note: draft]]` stays a name.
- Add `:` to the reserved characters outright, and say so in the grammar.

## An embed of a Markdown card is both expanded and degraded

**What the text says.** *Markdown cards* says an embed of a Markdown card
transcludes its body as CommonMark. *`nav` — placement and publication* says a
link or an embed to a Markdown card points at the page the site builds from
that file, and renders as an unresolved link where the site builds none.

**Why it matters.** A publisher cannot do both. Which one it does also decides
the publication finding about Markdown cards in private folders.

**Candidate resolution.** Only a link points at a page; an embed expands, and
is subject to whatever the publication rule decides. See
[`publication.md`](publication.md).

## Stale counts and descriptions around the specification

None of these is in the specification itself; each contradicts it.

- The release card says the language has eighteen diagnostics; the
  specification has nineteen.
- The format's tracker, under *Done*, says heading anchors use an algorithm
  "adopted from Python-Markdown"; the specification now states its own key.
- The release card's step on stale claims lists "sixteen diagnostics against
  eighteen" and "seven corpus cases against thirteen", which are themselves
  now behind.
- The corpus README cites the specification's sort order and its proposal by
  numeric section references rather than by name.

## Open questions

- Is the extension erratum corrected silently in 0.1, or does it need a note
  in the changelog because an implementation could have followed the
  pseudocode? See [`release.md`](release.md).
- Which targets are the reserved `namespace:path` form?
- Does an embed of a Markdown card expand, or point at its page?
