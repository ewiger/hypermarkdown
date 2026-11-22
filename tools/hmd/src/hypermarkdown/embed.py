"""Embed expansion (HMD-0001 §6).

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

from . import address as address_mod
from .frontmatter import split_frontmatter
from .model import ERROR, Diagnostic, Document, Link
from .parse import slug_for
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
    """A heading and everything up to the next heading of the same or higher level."""
    wanted = slug_for(fragment, set())
    for index, heading in enumerate(document.headings):
        if heading.slug != wanted:
            continue
        end = len(document.text)
        for following in document.headings[index + 1 :]:
            if following.level <= heading.level:
                end = following.span.start
                break
        return heading.span.start, end
    return None


def block_region(document: Document, block_id: str) -> tuple[int, int] | None:
    """The anchored block, with its trailing ``^id`` marker excluded.

    A block runs back from the anchored line to the nearest blank line, since
    the anchor marks the end of a block rather than the start of one.
    """
    text = document.text
    floor, _ = body_region(document)
    for anchor in document.anchors:
        if anchor.block_id != block_id:
            continue
        start = text.rfind("\n", 0, anchor.span.start) + 1
        while start > floor:
            previous_end = start - 1
            previous_start = text.rfind("\n", 0, previous_end) + 1
            if previous_start < floor or not text[previous_start:previous_end].strip():
                break
            start = previous_start
        return start, anchor.span.start
    return None


def _target_region(document: Document, link: Link) -> tuple[int, int] | None:
    if link.fragment is None:
        return body_region(document)
    if link.fragment_kind == "block":
        return block_region(document, link.fragment)
    if link.fragment_kind == "heading":
        return section_region(document, link.fragment)
    # HMD-0006: an address quotes exactly the span it selects.
    if link.address is None:
        return None  # malformed, already reported as HMD019
    result = address_mod.resolve(document, link.address)
    return (result.start, result.end) if result.ok else None


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
    """Copy `document.text[start:end]`, substituting the links inside it."""
    out: list[str] = []
    cursor = start

    for link in document.links:
        if not (start <= link.span.start < end):
            continue
        if link.is_embed:
            replacement = _embed(workspace, document, link, stack, diagnostics, rewrite, can_embed)
        elif rewrite is not None:
            result = workspace.resolve(document.path, link.page_ref)
            target = result.path if result.outcome is Outcome.RESOLVED else None
            replacement = rewrite(link, target)
        else:
            continue
        out.append(document.text[cursor : link.span.start])
        out.append(replacement)
        cursor = link.span.end

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

    region = _target_region(target, link)
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
