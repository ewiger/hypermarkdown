"""Block segmentation, and the text units inside a block (HMD-0006).

Every class in these patterns is ASCII on purpose — `[0-9]`, `[ \t]` — and no
string is stripped of "whitespace" in the host language's sense, because
Python's, JavaScript's and Rust's notions differ and a port must not drift.

An address counts blocks, sentences, words, and lines, so every implementation
has to cut a card into those units at exactly the same places. The rules here
are therefore line-based and mechanical rather than a CommonMark parse: each
one is short enough to restate in the specification and to port word for word,
and none of them depends on a renderer, a locale, or a Unicode version.

A block is one of the kinds the format permits. Headings and thematic breaks
are not blocks: a heading is addressed by name, and a break holds no content.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from . import scan

PARA = "Para"
TABLE = "Table"
LIST = "List"
CODE = "Code"
BLOCKQUOTE = "Blockquote"
CALLOUT = "Callout"
MATH = "Math"
DIAGRAM = "Diagram"
EMBED = "Embed"
HTML = "Html"

#: The kinds whose content is prose, and so has sentences and words.
PROSE = frozenset({PARA, LIST, BLOCKQUOTE, CALLOUT})

#: The fence info strings that make a diagram cell (HMD-0030). Every other
#: fence, a plain `d2` or `mermaid` one included, is a code block.
DIAGRAM_INFOS = frozenset({"d2#show", "mermaid#show"})

#: Whitespace, pinned as CommonMark defines Unicode whitespace: the Zs category
#: plus tab, line feed, form feed, and carriage return. Spelled out rather than
#: taken from the host language, whose notions of whitespace differ.
WHITESPACE = frozenset(
    "\t\n\x0c\r\x20\xa0\u1680\u2000\u2001\u2002\u2003\u2004\u2005"
    "\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000"
)

#: A sentence ends at a word whose last character is one of these.
TERMINATORS = frozenset(".!?")

_ATX_RE = re.compile(r"^ {0,3}#{1,6}(?:[ \t]|$)")
_BREAK_RE = re.compile(r"^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$")
_QUOTE_RE = re.compile(r"^ {0,3}>")
_CALLOUT_QUOTE_RE = re.compile(r"^ {0,3}>[ \t]*\[![^\] \t]+\]")
_ADMONITION_RE = re.compile(r"^(?:!!!|\?\?\?\+?)[ \t]")
_MATH_RE = re.compile(r"^ {0,3}\$\$")
_HTML_RE = re.compile(r"^ {0,3}<[A-Za-z/!?]")
_BULLET_RE = re.compile(r"^ {0,3}(?P<marker>[-*+])(?:[ \t]|$)")
_ORDERED_RE = re.compile(r"^ {0,3}(?P<number>[0-9]{1,9})(?P<delim>[.)])(?:[ \t]|$)")
_DELIMITER_ROW_RE = re.compile(r"^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$")
_EMBED_LINE_RE = re.compile(r"^[ \t]*!\[\[[^\[\]\n]*\]\][ \t]*$")
_ANCHOR_TAIL_RE = re.compile(r"[ \t]+\^[A-Za-z0-9][A-Za-z0-9_-]{0,63}[ \t]*$")

# Line prefixes that are structure, not words.
# Matched with `pattern.match(line, offset)`, so none of them carries `^`.
_QUOTE_PREFIX_RE = re.compile(r"[ \t]*(?:>[ \t]?)+")
_LIST_PREFIX_RE = re.compile(r"[ \t]*(?:[-*+]|[0-9]{1,9}[.)])(?=[ \t]|$)")
_CALLOUT_PREFIX_RE = re.compile(r"[ \t]*\[![^\] \t]+\][+-]?")
_ADMONITION_PREFIX_RE = re.compile(r"(?:!!!|\?\?\?\+?)[ \t]+[^ \t]+")


@dataclass(frozen=True)
class Block:
    kind: str
    #: Byte range in the card, from the first character of the first line to
    #: the end of the last line, its line ending excluded.
    start: int
    end: int
    #: For a fenced or display-math block, the range of its body lines, the
    #: delimiter lines excluded. Equal to (start, end) otherwise.
    body_start: int
    body_end: int


@dataclass(frozen=True)
class Line:
    start: int
    end: int  # line ending excluded


def lines(text: str, start: int, end: int) -> list[Line]:
    """The lines that begin inside [start, end), each clipped to `end`."""
    out: list[Line] = []
    cursor = start
    while cursor < end:
        newline = text.find("\n", cursor, end)
        stop = end if newline == -1 else newline
        line_end = stop - 1 if stop > cursor and text[stop - 1] == "\r" else stop
        out.append(Line(cursor, line_end))
        if newline == -1:
            break
        cursor = newline + 1
    return out


def _blank(text: str, line: Line) -> bool:
    return not text[line.start : line.end].strip(" \t")


def _fence_starts(text: str, body_offset: int) -> dict[int, int]:
    """Map the start offset of every fenced block to its end offset."""
    blanked = re.sub(r"[^\r\n]", " ", text[:body_offset]) + text[body_offset:]
    return {start: end for start, end in scan._fenced_regions(blanked)}


def _list_type(line: str) -> tuple[str, str] | None:
    m = _BULLET_RE.match(line)
    if m and not _BREAK_RE.match(line):
        return ("bullet", m.group("marker"))
    m = _ORDERED_RE.match(line)
    if m:
        return ("ordered", m.group("delim"))
    return None


def _interrupts_paragraph(line: str, fence: bool) -> bool:
    if fence or _ATX_RE.match(line) or _BREAK_RE.match(line) or _QUOTE_RE.match(line):
        return True
    if _MATH_RE.match(line) or _ADMONITION_RE.match(line):
        return True
    m = _BULLET_RE.match(line)
    if m and line[m.end() :].strip(" \t"):
        return True
    m = _ORDERED_RE.match(line)
    return bool(m and m.group("number") == "1" and line[m.end() :].strip(" \t"))


def segment(text: str, start: int, end: int, body_offset: int = 0) -> list[Block]:
    """Cut [start, end) of a card into blocks, in document order.

    `body_offset` is where the card's frontmatter ends, so a `---` fence is not
    read as markup. The region is expected to begin at the start of a line.
    """
    fences = _fence_starts(text, body_offset)
    all_lines = lines(text, start, end)
    blocks: list[Block] = []
    i = 0
    n = len(all_lines)

    def line_text(k: int) -> str:
        return text[all_lines[k].start : all_lines[k].end]

    def through(offset: int) -> int:
        """Index of the line after the one containing `offset - 1`."""
        k = i
        while k < n and all_lines[k].start < offset:
            k += 1
        return k

    def emit(kind: str, first: int, last: int, body: tuple[int, int] | None = None) -> None:
        s, e = all_lines[first].start, all_lines[last].end
        bs, be = body if body is not None else (s, e)
        blocks.append(Block(kind, s, e, bs, be))

    while i < n:
        line = all_lines[i]
        content = line_text(i)

        if _blank(text, line) or _ATX_RE.match(content) or _BREAK_RE.match(content):
            i += 1
            continue

        if line.start in fences:
            j = through(min(fences[line.start], end))
            last = j - 1
            info = scan._FENCE_RE.match(content).group("info").strip(" \t")
            word = re.split(r"[ \t]", info, maxsplit=1)[0]
            kind = DIAGRAM if word in DIAGRAM_INFOS else CODE
            closes = last > i and scan._FENCE_RE.match(line_text(last).rstrip())
            body_last = last - 1 if closes else last
            body = (
                (all_lines[i + 1].start, all_lines[body_last].end)
                if body_last > i
                else (all_lines[i].end, all_lines[i].end)
            )
            emit(kind, i, last, body)
            i = j
            continue

        if _MATH_RE.match(content):
            if "$$" in content.lstrip(" ")[2:]:  # opened and closed on one line
                emit(MATH, i, i)
                i += 1
                continue
            j = i + 1
            while j < n and "$$" not in line_text(j):
                j += 1
            closed = j < n
            last = j if closed else n - 1
            body_last = last - 1 if closed else last
            body = (
                (all_lines[i + 1].start, all_lines[body_last].end)
                if body_last > i
                else (all_lines[i].end, all_lines[i].end)
            )
            emit(MATH, i, last, body)
            i = last + 1
            continue

        if _ADMONITION_RE.match(content):
            j = i + 1
            last = i
            while j < n:
                following = line_text(j)
                if _blank(text, all_lines[j]):
                    j += 1
                    continue
                if following.startswith(("    ", "\t")):
                    last = j
                    j += 1
                    continue
                break
            emit(CALLOUT, i, last)
            i = last + 1
            continue

        if _QUOTE_RE.match(content):
            kind = CALLOUT if _CALLOUT_QUOTE_RE.match(content) else BLOCKQUOTE
            j = i + 1
            while j < n and not _blank(text, all_lines[j]):
                j += 1
            emit(kind, i, j - 1)
            i = j
            continue

        kind_of_list = _list_type(content)
        if kind_of_list is not None:
            j = i + 1
            last = i
            while j < n:
                if all_lines[j].start in fences:
                    k = through(min(fences[all_lines[j].start], end))
                    if not line_text(j).startswith((" ", "\t")):
                        break
                    last = k - 1
                    j = k
                    continue
                following = line_text(j)
                if _blank(text, all_lines[j]):
                    j += 1
                    continue
                gap = last < j - 1  # a blank line came before this one
                marker = _list_type(following)
                if marker is not None:
                    if marker != kind_of_list:
                        break
                    last = j
                    j += 1
                    continue
                if following.startswith(("  ", "\t")):
                    last = j
                    j += 1
                    continue
                if gap or _interrupts_paragraph(following, False):
                    break
                last = j  # a lazy continuation line
                j += 1
            emit(LIST, i, last)
            i = last + 1
            continue

        if _HTML_RE.match(content):
            j = i + 1
            while j < n and not _blank(text, all_lines[j]):
                j += 1
            emit(HTML, i, j - 1)
            i = j
            continue

        if "|" in content and i + 1 < n and _DELIMITER_ROW_RE.match(line_text(i + 1)) and "|" in (
            content + line_text(i + 1)
        ):
            j = i + 2
            while j < n and not _blank(text, all_lines[j]):
                j += 1
            emit(TABLE, i, j - 1)
            i = j
            continue

        # A paragraph: up to a blank line or a line that starts another block.
        j = i + 1
        while j < n:
            if _blank(text, all_lines[j]):
                break
            if _interrupts_paragraph(line_text(j), all_lines[j].start in fences):
                break
            j += 1
        kind = EMBED if j == i + 1 and _EMBED_LINE_RE.match(_ANCHOR_TAIL_RE.sub("", content)) else PARA
        emit(kind, i, j - 1)
        i = j

    return blocks


# -- text units ------------------------------------------------------------


@dataclass(frozen=True)
class Word:
    start: int
    end: int


def words(text: str, block: Block, skip: list[tuple[int, int]] = ()) -> list[Word]:
    """The words of a prose block: maximal runs of non-whitespace.

    Structure is not a word: a blockquote's `>` markers, a list item's marker, a
    callout's `[!type]` or `!!! type`, and any block anchor in `skip`.
    """
    out: list[Word] = []
    for line in lines(text, block.start, block.end):
        raw = text[line.start : line.end]
        offset = 0
        for prefix in _prefixes(block.kind):
            m = prefix.match(raw, offset)
            if m and m.end() > offset:
                offset = m.end()
        cursor = line.start + offset
        stop = line.end
        while cursor < stop:
            while cursor < stop and text[cursor] in WHITESPACE:
                cursor += 1
            if cursor >= stop:
                break
            begin = cursor
            while cursor < stop and text[cursor] not in WHITESPACE:
                cursor += 1
            if not any(s <= begin < e for s, e in skip):
                out.append(Word(begin, cursor))
    return out


def _prefixes(kind: str):
    if kind in (BLOCKQUOTE, CALLOUT):
        yield _ADMONITION_PREFIX_RE
        yield _QUOTE_PREFIX_RE
        yield _CALLOUT_PREFIX_RE
    if kind in (LIST, BLOCKQUOTE, CALLOUT):
        yield _LIST_PREFIX_RE


def sentences(text: str, units: list[Word]) -> list[list[Word]]:
    """Group words into sentences: a sentence ends at a word ending in `.!?`."""
    out: list[list[Word]] = []
    current: list[Word] = []
    for word in units:
        current.append(word)
        if text[word.end - 1] in TERMINATORS:
            out.append(current)
            current = []
    if current:
        out.append(current)
    return out
