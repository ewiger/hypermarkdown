"""Embed expansion.

Expansion is textual: an embed is replaced by the target's bytes, with no
heading-level shifting, so the operation stays reversible by inspection. It is
bounded in two ways — a stack of `(path, fragment)` pairs catches cycles, and
`MAX_EMBED_DEPTH` bounds work on adversarial input.

The expander is total. An embed it cannot expand — unresolved, cyclic, or too
deep — is left in the output exactly as written, and the reason is returned as a
diagnostic. A build stays green while lint tracks the work item.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from .frontmatter import split_frontmatter
from .model import ERROR, Anchor, Diagnostic, Document, Heading, Link
from .resolve import Outcome, Workspace

#: Called with each non-embed link and the page it resolved to, or None when it
#: did not. Returning the replacement text; `link.raw` leaves it untouched.
Rewrite = Callable[[Link, Path | None], str]

#: Called with a resolved embed target; False leaves the embed unexpanded, as if
#: it were an ordinary link. The expander asks rather than decides — publication
#: is the caller's policy, and a `hmd render` of a card you named yourself is not
#: the same situation as a site build (HMD-0002 §2).
CanEmbed = Callable[[Path], bool]

#: Maximum embed expansion depth (HMD-0001 §6). Deep enough for legitimate
#: composition, shallow enough to bound work on adversarial input. Defined once
#: here and imported elsewhere, so the template engine reuses it rather than
#: reimplementing a second limit beside it.
MAX_EMBED_DEPTH = 16


@dataclass
class Expansion:
    text: str
    diagnostics: list[Diagnostic] = field(default_factory=list)


def expand(
    workspace: Workspace,
    path: Path,
    rewrite: Rewrite | None = None,
    can_embed: CanEmbed | None = None,
) -> Expansion:
    """Expand every embed in `path`, recursively, returning its body text.

    `rewrite` is applied to ordinary links in the same walk. Doing both at once
    is not an optimization: a link inside embedded content must be *resolved*
    from the card it was written in, while the text it becomes belongs to the
    page being rendered. Rewriting the flattened output afterwards would have
    lost which card each link came from.

    `can_embed` may veto a target. A vetoed embed degrades to `rewrite`, so it
    lands wherever the caller sends an ordinary link to that page.
    """
    document = workspace.documents[path]
    result = Expansion(text="")
    start, end = body_region(document)
    result.text = _region(
        workspace, document, start, end, [(path, None)], result.diagnostics, rewrite, can_embed
    )
    return result


# -- regions -------------------------------------------------------------


def body_region(document: Document) -> tuple[int, int]:
    """The document minus its frontmatter fence.

    A Markdown card whose fence did not parse kept it as body text (HMD-0029).
    """
    raw, _body, offset = split_frontmatter(document.text)
    if document.is_markdown and raw is not None and not document.frontmatter:
        return 0, len(document.text)
    return offset, len(document.text)


def body(document: Document) -> str:
    start, end = body_region(document)
    return document.text[start:end]


def section_region(document: Document, fragment: str) -> tuple[int, int] | None:
    """A heading and everything up to the next heading of the same or higher level.

    The heading is the first whose key is the fragment's. ATX and setext
    headings end each other's sections alike: a setext heading's level is 1
    under `===` and 2 under `---`.
    """
    heading = document.find_heading(fragment)
    if heading is None:
        return None
    return _section_of(document, heading)


def _section_of(document: Document, heading: Heading) -> tuple[int, int]:
    index = document.headings.index(heading)
    end = len(document.text)
    for following in document.headings[index + 1 :]:
        if following.level <= heading.level:
            end = following.span.index
            break
    return heading.span.index, end


def block_region(document: Document, block_id: str) -> tuple[int, int] | None:
    """The anchored block, with its trailing ``^id`` marker excluded.

    A block runs back from the anchored line to the nearest blank line, since
    the anchor marks the end of a block rather than the start of one. An anchor
    on a heading's line names that heading, and its block is the heading's
    whole section, exactly as for a heading fragment.
    """
    text = document.text
    floor, _ = body_region(document)
    for anchor in document.anchors:
        if anchor.block_id != block_id:
            continue
        start = _line_start(text, anchor.span.index)
        for heading in document.headings:
            if _line_start(text, heading.span.index) == start:
                return _section_of(document, heading)
        while start > floor:
            previous_end = start - (2 if text.startswith("\r\n", start - 2) else 1)
            previous_start = _line_start(text, previous_end)
            if previous_start < floor or not text[previous_start:previous_end].strip():
                break
            start = previous_start
        return start, _blanks_before(text, anchor.span.index)
    return None


def _blanks_before(text: str, index: int) -> int:
    """The index of the run of spaces and tabs that ends at `index`.

    An anchor's span starts at its ``^``; the blanks before it are not part of
    the block's content either, and go with the anchor.
    """
    while index > 0 and text[index - 1] in " \t":
        index -= 1
    return index


def _line_start(text: str, index: int) -> int:
    """The index of the first character of the line `index` is on."""
    return max(text.rfind("\n", 0, index), text.rfind("\r", 0, index)) + 1


def target_region(document: Document, link: Link) -> tuple[int, int] | None:
    if link.fragment is None:
        return body_region(document)
    if link.fragment_kind == "block":
        return block_region(document, link.fragment)
    return section_region(document, link.fragment)


# -- expansion -----------------------------------------------------------


def _region(
    workspace: Workspace,
    document: Document,
    start: int,
    end: int,
    stack: list[tuple[Path, str | None]],
    diagnostics: list[Diagnostic],
    rewrite: Rewrite | None,
    can_embed: CanEmbed | None = None,
) -> str:
    """Copy `document.text[start:end]`, substituting the links inside it.

    Block anchors are dropped on the way: an anchor and its leading whitespace
    are not part of the block's content and are never rendered.
    """
    out: list[str] = []
    cursor = start

    edits: list[Link | Anchor] = [
        *(link for link in document.links if start <= link.span.index < end),
        *(anchor for anchor in document.anchors if start <= anchor.span.index < end),
    ]
    edits.sort(key=lambda edit: edit.span.index)
    for link in edits:
        if isinstance(link, Anchor):
            blanks = max(cursor, _blanks_before(document.text, link.span.index))
            out.append(document.text[cursor:blanks])
            cursor = link.span.index_end
            continue
        if link.is_embed:
            replacement = _embed(workspace, document, link, stack, diagnostics, rewrite, can_embed)
        elif rewrite is not None:
            result = workspace.resolve(document.path, link.page_ref)
            target = result.path if result.outcome is Outcome.RESOLVED else None
            replacement = rewrite(link, target)
        else:
            continue
        out.append(document.text[cursor : link.span.index])
        out.append(replacement)
        cursor = link.span.index_end

    out.append(document.text[cursor:end])
    return "".join(out)


def _embed(
    workspace: Workspace,
    document: Document,
    link: Link,
    stack: list[tuple[Path, str | None]],
    diagnostics: list[Diagnostic],
    rewrite: Rewrite | None,
    can_embed: CanEmbed | None = None,
) -> str:
    """Expand one embed, or return it verbatim with a diagnostic."""
    result = workspace.resolve(document.path, link.page_ref)
    if result.outcome is not Outcome.RESOLVED or result.path is None:
        return link.raw  # HMD001/HMD002/HMD003, already reported by lint

    # Vetoed: inlining would copy the target's bytes into this page, which is
    # the one outcome a publication gate must not allow. Reported as HMD017.
    if can_embed is not None and not can_embed(result.path):
        return rewrite(link, result.path) if rewrite is not None else link.raw

    target = workspace.documents.get(result.path)
    if target is None:
        return link.raw

    region = target_region(target, link)
    if region is None:
        return link.raw  # HMD004/HMD005, already reported by lint

    key = (result.path, link.fragment)
    if key in stack:
        chain = " -> ".join(workspace.rel(p) for p, _ in stack[stack.index(key) :])
        diagnostics.append(
            _at(workspace, document, link, "HMD007", f"embed cycle: {chain} -> {workspace.rel(result.path)}")
        )
        return link.raw

    if len(stack) >= MAX_EMBED_DEPTH:
        diagnostics.append(
            _at(workspace, document, link, "HMD008", f"embed depth exceeds the limit of {MAX_EMBED_DEPTH}")
        )
        return link.raw

    stack.append(key)
    try:
        expanded = _region(
            workspace, target, region[0], region[1], stack, diagnostics, rewrite, can_embed
        )
    finally:
        stack.pop()
    return expanded.strip()


def _at(workspace: Workspace, document: Document, link: Link, rule: str, message: str) -> Diagnostic:
    return Diagnostic(
        rule,
        ERROR,
        workspace.rel(document.path),
        link.span.line,
        link.span.column,
        message,
    )
