# 0008 — A public card linking to a private one needs a policy

**Column**: backlog
**Opened**: 2026-08-08
**Found by**: de-linking six HMD017 warnings to get `hmd lint --root doc/wiki --strict` green

## What

When a published card links to an unpublished one, the project has exactly one
answer today: warn about it, and render a red link. There is no way to say what
*should* happen instead, and the shape of the right answer differs enough
between sites that it should be configurable rather than decided once in the
implementation.

At least three policies are worth having, and they are genuinely different
products rather than variations on one:

- **Blocked link.** The link stays in the prose but resolves to nothing
  navigable. Instead of a dead red link it carries an explanation — a tooltip, a
  popup, an interstitial, something that says *this page exists and you do not
  have access to it*. This is the restrictive end, and it is the policy that
  treats the link as information worth keeping.
- **Published but unlisted.** The page is built and reachable at its URL; it is
  simply absent from the navigation. Links to it work. This is the policy that
  keeps prose intact at the cost of the sidebar telling the whole truth.
- **Publish everything.** No private cards at all, so the problem cannot arise.
  Recorded for completeness. It is not the direction this project wants, because
  it makes the default the permissive end and removes the ability to draft in the
  open.

The policy has to be selected per site, not per link. Which one a project wants
follows from what it is publishing, not from the individual card.

## Why

The current behaviour is not wrong so much as unfinished — it detects the
situation and then hands the author a choice between two bad options. Either
publish the target, which may not be wanted, or delete the link, which damages
the prose. Both were live on 2026-08-08: six warnings on `main`, every one of
them a public card pointing a reader at the card that explains what the format
is for. They were resolved by deleting or redirecting the pointers, which made
the lint green and left the wiki with fewer cross-references than it should have.
That trade is a workaround, and this card exists because it should not have to be
made again.

The pressure is structural. The wiki graph rewards dense linking — a card is
supposed to be a node whose value is its edges — while publication is
deliberately opt-in and defaults to private. Those two commitments guarantee a
steady supply of public-to-private edges. Any project that drafts cards before
publishing them will generate them continuously.

**The unlisted policy is the one that needs the most care**, because it collides
with a decision already on the books. Omitting the navigation entry was
considered as the *meaning* of privacy and rejected: a page you can still reach
by typing its address is published, whatever the sidebar claims. That reasoning
stands. What is different here is that unlisted would be an explicit, named
choice a site opts into with its eyes open, rather than the silent default
meaning of `visibility`. Whether that distinction is enough to make it safe is
not settled.

It also breaks the navigation model rather than extending it. `nav` currently
fuses two things that this policy pulls apart: whether a card is published, and
where it sits in the sidebar. A card that is built but unlisted has a URL and no
position, and it is not clear what `order` means for it, whether it should
inherit visibility down the tree the way `public` does today, or what the
sidebar should do about a section whose every member is unlisted. **No answer is
proposed here.** The question is open on purpose — inventing one before the
policy is specified is how the current fusion happened.

Embedding is the case that must not be decided by accident. Expansion copies the
target's bytes into the host page, so a policy that is merely a link-rendering
rule would silently publish private prose inside a public card. The existing
design already keeps this separate — expansion asks a caller-supplied predicate
whether a given card may be embedded, rather than knowing what visibility means —
and any policy added here has to answer the embed question explicitly, not
inherit whatever the link answer happens to be.

## Open

- Where does the policy live? A single site-wide setting is the obvious start,
  but per-tree or per-folder-note selection may be wanted for the same reason
  visibility inherits down a subtree.
- What does a blocked link render as? A tooltip needs no scripting; a popup or
  interstitial does. Whether the toolchain ships that behaviour, emits markup a
  theme is expected to style, or merely emits an annotation and leaves
  presentation entirely to the site is undecided.
- Does a blocked link leak the target's existence, and is that acceptable? Saying
  "this page is private" confirms there is a page, along with whatever its slug
  and display text reveal. For some sites that is the point; for others the
  correct behaviour is to erase the link entirely and say nothing. That may be a
  fourth policy rather than a parameter of the first.
- What happens to the warning under each policy? A configured, intentional
  blocked link should probably stop being a diagnostic, or the lint becomes noise
  that trains authors to ignore it. But losing the signal entirely means an
  unintended private link is never reported again.
- How does the unlisted policy interact with the navigation model at all — order,
  inheritance, and empty sections. Explicitly unresolved.
- Does the answer differ between a build (a whole site, with a publication
  policy) and a single-card render (which has no site and no policy)? Rendering
  one card you named yourself is already treated as a different act from building
  a site, and that distinction probably survives here.
- Should the policy be able to differ for links and embeds within one site —
  block the embed but allow the link, for instance.

## Not blocking

Nothing in the MVP depends on this, and the workaround holds: keep the wikilink
graph inside the published set, and reach private material with ordinary prose.
The cost is paid in cross-references not written.

**This needs a proper specification and architecture before it is built.** It is
not a rendering tweak — it touches the publication gate, the navigation model,
the embed boundary, and the lint's severity rules at the same time, and getting
it wrong in the permissive direction leaks private prose. No proposal owns it
yet; the card exists so the question is attached to the publication gate before
something hardcodes one policy.
