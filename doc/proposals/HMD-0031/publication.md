# HMD-0031 — Publication

Ways the content of a card nobody published can reach a published page. The
two errors publication can make are not symmetric — a card that should have
shipped and did not is seen on the next build, while one that shipped and
should not have is a leak nobody looks for — so every finding here is treated
as a security question.

## A Markdown card in a private folder

**What the text says.** A Markdown card's effective visibility is `public`. A
publisher does not register it as a page of its own; it is published where its
file is, by whatever publishes Markdown. A published card does not expand an
unpublished one.

**Why it matters.** Because a Markdown card is always public, the rule against
expanding unpublished cards never applies to it. A `notes.md` inside a private
folder can then be embedded into a public card, and its bytes are copied into
the published page. Whether that actually happens also depends on the
Markdown-embed erratum in [`errata.md`](errata.md).

**Candidate resolutions.**

- A Markdown card's effective visibility is its directory's: it inherits from
  the nearest folder note that sets one, as a HyperMarkDown card does, without
  any frontmatter of its own being read.
- A Markdown card stays public, and an embed of one degrades to an unresolved
  link wherever the site builds no page from it.
- A Markdown card stays public, and the specification says plainly that a
  Markdown file inside the namespace is published content.

## Nested embeds

**What the text says.** A published card that embeds an unpublished one does
not expand it, and the embed degrades to an unresolved link with HMD017.

**Why it matters.** A public card embedding a public card that embeds a private
one is covered by the words, since the middle card is published and embeds an
unpublished one. But the text does not say so, and nothing tests it. Nor does
it say where HMD017 is reported: at the middle card, where the embed is
written, or at the page the content ends up in.

## Fragment embeds

A heading or block embed of an unpublished card copies part of it. The rule
covers it by implication, since the target card is unpublished, and nothing
states or tests it.

## What a degraded embed shows

A degraded embed renders as an unresolved link. The text does not say what
that link may show. The author's own text, `![[secret-plan]]`, is already in
the published card's source. The resolved path, a title read from the target,
or any of its content would be new disclosures.

## Open questions

- What visibility does a Markdown card have when it sits inside a private
  folder?
- Is the rule against expanding an unpublished card stated for every depth of
  expansion and for fragments, or left to implication?
- Where is HMD017 reported for a nested embed?
- May a degraded embed show anything beyond the author's own text?
- Are the publication cases a release gate for 0.1?
