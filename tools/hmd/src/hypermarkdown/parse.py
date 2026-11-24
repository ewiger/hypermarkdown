"""Source text -> `Document`: the lexical model, the grammar, heading anchors."""

from __future__ import annotations

import html
import re
from pathlib import Path

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
    heading_key,
)

#: Characters that may not appear literally in a link target (HMD-0001 §2).
RESERVED_CHARS = frozenset("[]|#^\n")

_BLOCK_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")


_ANCHOR_SUFFIX_RE = re.compile(r"[ \t]+\^[A-Za-z0-9][A-Za-z0-9_-]{0,63}[ \t]*$")
_CLOSING_HASHES_RE = re.compile(r"(?:^|[ \t]+)#+[ \t]*$")
_ATX_CONTENT_RE = re.compile(r"^[ \t]{0,3}#{1,6}(?:[ \t]+(?P<content>.*?))?[ \t]*$", re.DOTALL)

#: Inline markup, in the order a reader's eye removes it. A code span is first
#: so that nothing inside it is read as markup, and a wikilink comes before an
#: ordinary link because it is spelled with more brackets.
_INLINE_RE = re.compile(
    r"(?P<ticks>`+)(?P<code>.+?)(?P=ticks)"
    r"|\\(?P<escaped>[!-/:-@\[-`{-~])"
    r"|!?\[\[(?P<wikilink>[^\[\]\n]*)\]\]"
    r"|(?P<comment><!--.*?-->)"
    r"|<(?P<autolink>[A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s]*)>"
    r"|<(?P<email>[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+)>"
    r"|(?P<tag></?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?/?>)"
    r"|!\[(?P<alt>[^\]]*)\]\([^)]*\)"
    r"|\[(?P<label>[^\]]*)\](?:\([^)]*\)|\[[^\]]*\])"
    r"|(?P<entity>&(?:#[0-9]{1,7}|#[xX][0-9A-Fa-f]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});)"
    r"|(?P<delimiter>\*+|_+|~~)",
    re.DOTALL,
)


def visible_text(source: str) -> str:
    """Heading content as a reader sees it: inline markup removed.

    `The *fast* path` reads `The fast path`, a code span reads as its code, a
    link as its text, a wikilink as its display or its page reference, and raw
    HTML tags and comments vanish. Whitespace, line breaks included, collapses
    to single spaces. This is a reading of CommonMark's inlines and not a full
    parser: an emphasis delimiter is dropped wherever it touches a word, except
    an `_` inside one, which CommonMark does not treat as emphasis.
    """

    def replace(m: re.Match) -> str:
        if m.group("ticks"):
            code = re.sub(r"\r\n|\r|\n", " ", m.group("code"))
            if code.startswith(" ") and code.endswith(" ") and code.strip():
                code = code[1:-1]
            return code
        if m.group("escaped") is not None:
            return m.group("escaped")
        if m.group("wikilink") is not None:
            inner = m.group("wikilink")
            if "|" in inner:
                return inner.split("|", 1)[1]
            return inner.split("#", 1)[0].strip()
        if m.group("comment") is not None or m.group("tag") is not None:
            return ""
        if m.group("autolink") is not None:
            return m.group("autolink")
        if m.group("email") is not None:
            return m.group("email")
        if m.group("alt") is not None:
            return visible_text(m.group("alt"))
        if m.group("label") is not None:
            return visible_text(m.group("label"))
        if m.group("entity") is not None:
            return html.unescape(m.group("entity"))
        return _delimiter(source, m)

    return " ".join(_INLINE_RE.sub(replace, source).split())


def _delimiter(source: str, m: re.Match) -> str:
    """An emphasis delimiter run is dropped; a run that is plain text is kept."""
    run = m.group("delimiter")
    before = source[m.start() - 1] if m.start() > 0 else " "
    after = source[m.end()] if m.end() < len(source) else " "
    if before.isspace() and after.isspace():
        return run  # `2 * 3` — flanks nothing, so it is text
    if run[0] == "_" and before.isalnum() and after.isalnum():
        return run  # `snake_case` — an intraword `_` is not emphasis
    return ""


def heading_content(raw: str) -> str:
    """The text of one heading as written: its markers, closing run, and anchor gone.

    `raw` is the heading's whole source. One that spans more than one line is
    a setext heading, and its underline is its last line.
    """
    breaks = [i for i in (raw.rfind("\n"), raw.rfind("\r")) if i != -1]
    if breaks:
        return _ANCHOR_SUFFIX_RE.sub("", raw[: max(breaks)].rstrip()).strip()
    m = _ATX_CONTENT_RE.match(raw)
    content = (m.group("content") or "") if m else raw
    content = _ANCHOR_SUFFIX_RE.sub("", content.rstrip())
    return _CLOSING_HASHES_RE.sub("", content).strip()


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
    masked = _masked(text, body_offset)
    positions = scan.Positions(text)

    headings = _headings(text, masked, positions)
    anchors = _anchors(masked, positions)
    links, link_diagnostics = _links(text, masked, rel, positions)
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

    return Document(
        path=path,
        text=text,
        frontmatter=frontmatter,
        card=CardConfig(),
        headings=_headings(text, _masked(text, body_offset), scan.Positions(text)),
        kind=MARKDOWN,
    )


def _masked(text: str, body_offset: int) -> str:
    """The text as the extractors read it: frontmatter blanked, body masked."""
    return scan.one_line_ending(_blank(text[:body_offset]) + scan.mask(text[body_offset:]))


def _blank(frontmatter: str) -> str:
    """The frontmatter as blanks of the same length, its line breaks kept.

    Blanking the line breaks too would join the fence to the first body line,
    which then reads as indented and loses a heading written right below `---`.
    """
    return re.sub(r"[^\r\n]", " ", frontmatter)


def _span(positions: scan.Positions, start: int, end: int) -> Span:
    line, column = positions.line_col(start)
    return Span(
        start=positions.byte(start),
        end=positions.byte(end),
        line=line,
        column=column,
        index=start,
        index_end=end,
    )


def _headings(text: str, masked: str, positions: scan.Positions) -> tuple[Heading, ...]:
    out = []
    for level, _masked_text, start, end in scan.find_headings(masked):
        # Read the ORIGINAL text: masking blanks inline code, and a heading
        # such as `## The \`hmd\` CLI` reads `The hmd CLI`, not `The  CLI`.
        shown = visible_text(heading_content(text[start:end]))
        out.append(
            Heading(level=level, text=shown, key=heading_key(shown), span=_span(positions, start, end))
        )
    return tuple(out)


def _anchors(masked: str, positions: scan.Positions) -> tuple[Anchor, ...]:
    return tuple(
        Anchor(block_id=block_id, span=_span(positions, start, end))
        for block_id, start, end in scan.find_anchors(masked)
    )


def _links(
    text: str, masked: str, rel: str, positions: scan.Positions
) -> tuple[tuple[Link, ...], list[Diagnostic]]:
    links: list[Link] = []
    diagnostics: list[Diagnostic] = []

    for is_embed, inner, start, end in scan.find_links(masked):
        span = _span(positions, start, end)
        raw = text[start:end]
        try:
            page_ref, fragment, fragment_kind, display = _parse_target(inner)
        except ValueError as exc:
            diagnostics.append(Diagnostic("HMD010", ERROR, rel, span.line, span.column, f"{exc} in {raw}"))
            continue
        links.append(
            Link(
                page_ref=page_ref,
                fragment=fragment,
                fragment_kind=fragment_kind,
                display=display,
                is_embed=is_embed,
                raw=raw,
                span=span,
            )
        )

    for start in scan.find_unterminated(masked):
        line, column = positions.line_col(start)
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
        if fragment.startswith("^"):
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

    if dot_segment_outside_relative(page_ref):
        raise ValueError("'.' or '..' outside an explicit relative reference")

    return page_ref, fragment, fragment_kind, display


def dot_segment_outside_relative(page_ref: str) -> bool:
    """Whether an absolute or unqualified `page_ref` has a `.` or `..` segment.

    Only an explicit relative reference, one opening with `./` or `../`, may
    hold them; anywhere else the reference is malformed (HMD010).
    """
    if page_ref.startswith(("./", "../")):
        return False
    return any(part in (".", "..") for part in page_ref.split("/"))
