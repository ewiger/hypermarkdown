"""Source bytes -> `Document` (HMD-0001 §1, §2, §3)."""

from __future__ import annotations

import re
from pathlib import Path

from markdown.extensions.toc import slugify, unique

from . import address as address_mod
from . import scan
from .frontmatter import parse_card_config, parse_yaml, split_frontmatter
from .model import (
    ERROR,
    Anchor,
    CardConfig,
    Diagnostic,
    Document,
    MARKDOWN,
    Heading,
    Link,
    Span,
)

#: Characters that may not appear literally in a link target (HMD-0001 §2).
RESERVED_CHARS = frozenset("[]|#^\n")

_BLOCK_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")


def slug_for(text: str, used: set[str]) -> str:
    """Assign a heading slug the way Python-Markdown's `toc` extension does.

    Delegated rather than invented: a link and its rendered destination cannot
    disagree if both sides use the same rule (HMD-0001 §3).
    """
    return unique(slugify(text, "-"), used)


def parse(path: Path, text: str, rel: str) -> Document:
    """Parse one `.hmd` file. `rel` is the root-relative path for diagnostics."""
    diagnostics: list[Diagnostic] = []

    raw_yaml, _body, body_offset = split_frontmatter(text)
    frontmatter: dict = {}
    card = CardConfig()

    if raw_yaml is not None:
        try:
            frontmatter = parse_yaml(raw_yaml)
        except ValueError as exc:
            diagnostics.append(Diagnostic("HMD009", ERROR, rel, 1, 1, str(exc)))
        else:
            card, problems = parse_card_config(frontmatter)
            for rule, message in problems:
                diagnostics.append(Diagnostic(rule, ERROR, rel, 1, 1, message))

    # Mask the body only; frontmatter is YAML, not markdown.
    masked = _blank(text[:body_offset]) + scan.mask(text[body_offset:])

    headings = _headings(text, masked)
    anchors = _anchors(text, masked)
    links, link_diagnostics = _links(text, masked, rel)
    diagnostics.extend(link_diagnostics)

    return Document(
        path=path,
        text=text,
        frontmatter=frontmatter,
        card=card,
        headings=headings,
        anchors=anchors,
        links=links,
        diagnostics=diagnostics,
    )


def parse_markdown(path: Path, text: str, rel: str) -> Document:
    """Read one Markdown card (HMD-0029): frontmatter and headings, nothing else.

    The body is CommonMark and is not scanned, so it yields no link, embed or
    block anchor. A frontmatter block is exposed as data and none of its keys is
    interpreted; one that does not parse as a mapping is body text, and is not
    reported, because the author did not write HyperMarkdown.
    """
    raw_yaml, _body, body_offset = split_frontmatter(text)
    frontmatter: dict = {}
    if raw_yaml is not None:
        try:
            frontmatter = parse_yaml(raw_yaml)
        except ValueError:
            body_offset = 0

    masked = _blank(text[:body_offset]) + scan.mask(text[body_offset:])
    return Document(
        path=path,
        text=text,
        frontmatter=frontmatter,
        card=CardConfig(),
        headings=_headings(text, masked),
        kind=MARKDOWN,
    )


def _blank(frontmatter: str) -> str:
    """The frontmatter as blanks of the same length, its line breaks kept.

    Blanking the line breaks too would join the fence to the first body line,
    which then reads as indented and loses a heading written right below `---`.
    """
    return re.sub(r"[^\r\n]", " ", frontmatter)


def _span(text: str, start: int, end: int) -> Span:
    line, column = scan.line_col(text, start)
    return Span(start=start, end=end, line=line, column=column)


def _headings(text: str, masked: str) -> tuple[Heading, ...]:
    used: set[str] = set()
    out = []
    for level, heading_text, start, end in scan.find_headings(masked):
        # Slug from the ORIGINAL text: masking blanks inline code, and a heading
        # such as `## The \`hmd\` CLI` must slug from what the renderer sees.
        original = text[start:end]
        m = re.match(r"^[ \t]{0,3}#{1,6}[ \t]+(.*?)[ \t]*$", original)
        display = m.group(1) if m else heading_text
        display = re.sub(r"[ \t]+#+[ \t]*$", "", display)
        display = re.sub(r"[ \t]+\^[A-Za-z0-9][A-Za-z0-9_-]{0,63}[ \t]*$", "", display).strip()
        out.append(
            Heading(level=level, text=display, slug=slug_for(display, used), span=_span(text, start, end))
        )
    return tuple(out)


def _anchors(text: str, masked: str) -> tuple[Anchor, ...]:
    return tuple(
        Anchor(block_id=block_id, span=_span(text, start, end))
        for block_id, start, end in scan.find_anchors(masked)
    )


def _links(text: str, masked: str, rel: str) -> tuple[tuple[Link, ...], list[Diagnostic]]:
    links: list[Link] = []
    diagnostics: list[Diagnostic] = []

    for is_embed, inner, start, end in scan.find_links(masked):
        span = _span(text, start, end)
        raw = text[start:end]
        try:
            page_ref, fragment, fragment_kind, display = _parse_target(inner)
        except ValueError as exc:
            diagnostics.append(Diagnostic("HMD010", ERROR, rel, span.line, span.column, f"{exc} in {raw}"))
            continue
        parsed = None
        if fragment is not None:
            written = "^" + fragment if fragment_kind == "block" else fragment
            try:
                parsed = address_mod.parse(written)
            except address_mod.AddressSyntaxError as exc:
                diagnostics.append(Diagnostic("HMD019", ERROR, rel, span.line, span.column, f"{exc} in {raw}"))
        links.append(
            Link(
                page_ref=page_ref,
                fragment=fragment,
                fragment_kind=fragment_kind,
                display=display,
                is_embed=is_embed,
                raw=raw,
                span=span,
                address=parsed,
            )
        )

    for start in scan.find_unterminated(masked):
        line, column = scan.line_col(text, start)
        diagnostics.append(Diagnostic("HMD010", ERROR, rel, line, column, "unterminated '[[' — expected ']]'"))

    return tuple(links), diagnostics


def _parse_target(inner: str) -> tuple[str, str | None, str | None, str | None]:
    """Split a link body into (page_ref, fragment, fragment_kind, display).

    Raises `ValueError` for anything malformed (HMD010).
    """
    if not inner.strip():
        raise ValueError("empty link target")

    # Display text comes last and may itself contain '|', so split once only.
    display: str | None = None
    if "|" in inner:
        inner, display = inner.split("|", 1)
        if not display.strip():
            raise ValueError("empty display text")

    fragment: str | None = None
    fragment_kind: str | None = None
    if "#" in inner:
        inner, fragment = inner.split("#", 1)
        if address_mod.is_multi_step(fragment):
            # HMD-0006: a path of steps. Its grammar is checked by the address
            # parser, which reports HMD019 rather than HMD010.
            fragment_kind = "address"
        elif fragment.startswith("^"):
            fragment_kind, fragment = "block", fragment[1:]
            if not _BLOCK_ID_RE.match(fragment):
                raise ValueError(f"invalid block id {fragment!r}")
        else:
            fragment_kind = "heading"
            if not fragment.strip():
                raise ValueError("empty heading fragment")

    page_ref = inner.strip()
    if not page_ref:
        # Covers `[[#tag]]`: a tag is never a link target, because '#' is
        # reserved for fragments (HMD-0001 §5.3).
        raise ValueError("link target has no page reference")

    bad = RESERVED_CHARS.intersection(page_ref)
    if bad:
        raise ValueError(f"reserved character {''.join(sorted(bad))!r} in target")

    return page_ref, fragment, fragment_kind, display
