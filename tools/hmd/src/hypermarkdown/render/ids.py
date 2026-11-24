"""Heading ids the way Python-Markdown's `toc` extension assigns them.

The language matches a heading fragment by key and leaves the HTML `id` to the
renderer, with one obligation: each heading link must be rewritten to the `id`
the renderer gave the heading the link matched. This renderer is
Python-Markdown, so the id is whatever `toc` would give it — a slug of the
heading's text, numbered `_1`, `_2` when a page repeats it.

`toc` numbers repeats across the *page*, and a page is a card with its embeds
expanded: an embedded section's headings take ids first if they come first. So
the ids are computed over the page the card becomes, walking embeds the way
`embed.expand` does, and the ids of the card's own headings are returned.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from pathlib import Path

from markdown.extensions.toc import slugify as toc_slugify
from markdown.extensions.toc import unique

from ..embed import MAX_EMBED_DEPTH, CanEmbed, body_region, target_region
from ..model import Document, Heading
from ..resolve import Outcome, Workspace

#: `toc`'s `slugify(value, separator)`.
Slugify = Callable[[str, str], str]

#: An `attr_list` block at the end of a heading, `{#id .class}` or `{: #id}`.
_ATTR_LIST_RE = re.compile(r"[ \t]*\{:?[ \t]*(?P<attrs>[^{}]*)\}[ \t]*$")
_EXPLICIT_ID_RE = re.compile(r"(?:^|[ \t])#(?P<id>[^\s}#.]+)")


def heading_ids(
    workspace: Workspace,
    path: Path,
    can_embed: CanEmbed | None = None,
    slugify: Slugify = toc_slugify,
    separator: str = "-",
    attr_list: bool = False,
) -> list[str]:
    """The id of each of `path`'s own headings, aligned with `document.headings`.

    `can_embed` must be the predicate the page is expanded with, since a vetoed
    embed contributes no headings. With `attr_list`, a trailing `{#id}` sets a
    heading's id outright, and is not part of the text the slug is made from.
    """
    document = workspace.documents[path]
    start, end = body_region(document)
    page = _page(workspace, document, start, end, [(path, None)], can_embed, own=True)

    explicit = [_explicit(heading) if attr_list else None for _, heading in page]
    used = {anchor for anchor in explicit if anchor}
    ids: list[str] = []
    for (own, heading), anchor in zip(page, explicit):
        if anchor is None:
            text = _ATTR_LIST_RE.sub("", heading.text) if attr_list else heading.text
            anchor = unique(slugify(text, separator), used)
        if own:
            ids.append(anchor)
    # Every heading lies in the body, since the frontmatter is blanked before
    # headings are found, so the card's own ones are all of them, in order.
    return ids


def _explicit(heading: Heading) -> str | None:
    attrs = _ATTR_LIST_RE.search(heading.text)
    if attrs is None:
        return None
    found = _EXPLICIT_ID_RE.search(attrs.group("attrs"))
    return found.group("id") if found else None


def _page(
    workspace: Workspace,
    document: Document,
    start: int,
    end: int,
    stack: list[tuple[Path, str | None]],
    can_embed: CanEmbed | None,
    own: bool,
) -> list[tuple[bool, Heading]]:
    """Every heading of the page, in order, flagged when it is the card's own."""
    events: list[tuple[int, int, object]] = [
        (heading.span.index, 0, heading)
        for heading in document.headings
        if start <= heading.span.index < end
    ]
    events.extend(
        (link.span.index, 1, link)
        for link in document.links
        if link.is_embed and start <= link.span.index < end
    )
    out: list[tuple[bool, Heading]] = []
    for _, kind, item in sorted(events, key=lambda event: (event[0], event[1])):
        if kind == 0:
            out.append((own, item))
            continue
        result = workspace.resolve(document.path, item.page_ref)
        if result.outcome is not Outcome.RESOLVED or result.path is None:
            continue
        if can_embed is not None and not can_embed(result.path):
            continue
        target = workspace.documents.get(result.path)
        region = target_region(target, item) if target is not None else None
        key = (result.path, item.fragment)
        if region is None or key in stack or len(stack) >= MAX_EMBED_DEPTH:
            continue
        stack.append(key)
        try:
            out.extend(_page(workspace, target, region[0], region[1], stack, can_embed, own=False))
        finally:
            stack.pop()
    return out
