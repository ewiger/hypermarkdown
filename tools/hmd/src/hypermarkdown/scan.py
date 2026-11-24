"""Masking scanner: find the constructs the format owns (HMD-0001 §1, §2).

The scanner does not parse CommonMark. It masks the regions where markup must
not be interpreted, then extracts constructs from what is left. Masking replaces
characters with spaces and preserves newlines, so every offset, line, and
column in the masked text still refers to the original source.

A line ends at `\n`, at `\r\n`, or at a lone `\r`, as in CommonMark. The
masked text spells all three as one `\n` — a `\r\n` becomes a space and a
`\n`, a lone `\r` becomes a `\n` — so its length is unchanged and every
line-oriented pattern below needs to know only one line ending.

Offsets inside this module are indices into the decoded text. `Positions`
turns them into the spans the specification asks for: UTF-8 byte offsets, and
a column that counts code points.
"""

from __future__ import annotations

import re
from bisect import bisect_right

# A fence opener/closer: three or more backticks or tildes, optionally indented.
_FENCE_RE = re.compile(r"^(?P<indent>[ \t]*)(?P<fence>`{3,}|~{3,})(?P<info>.*)$")
_HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
# A code span: a run of N backticks, then the shortest text, then N backticks.
_CODE_SPAN_RE = re.compile(r"(?P<ticks>`+)(?P<body>.+?)(?P=ticks)", re.DOTALL)

_ATX_HEADING_RE = re.compile(r"^[ \t]{0,3}(?P<hashes>#{1,6})[ \t]+(?P<text>.*?)[ \t]*$", re.MULTILINE)
_ANCHOR_RE = re.compile(r"[ \t]+\^(?P<id>[A-Za-z0-9][A-Za-z0-9_-]{0,63})[ \t]*$", re.MULTILINE)
# A wikilink target may not contain "[", "]" or a newline (HMD-0001 §2).
_LINK_RE = re.compile(r"(?P<bang>!?)\[\[(?P<inner>[^\[\]\n]*)\]\]")

#: One line ending, in each of the three forms CommonMark recognises.
_EOL_RE = re.compile(r"\r\n|\r|\n")
#: One line with its ending. The last line of a file may have none.
_LINE_RE = re.compile(r"[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+\Z")

# -- setext headings, and the blocks that keep a line from being one ------

_SETEXT_UNDERLINE_RE = re.compile(r"^ {0,3}(?P<char>=+|-+)[ \t]*$")
_ATX_START_RE = re.compile(r"^ {0,3}#{1,6}(?:[ \t]|$)")
_THEMATIC_BREAK_RE = re.compile(r"^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$")
_BLOCKQUOTE_RE = re.compile(r"^ {0,3}>")
_LIST_ITEM_RE = re.compile(r"^ {0,3}(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$)")
#: The HTML blocks that open on a tag name (CommonMark's kinds 1 and 6), plus
#: `<!`, `<?`, and a line that is nothing but one tag (kind 7). Inline HTML at
#: the start of an ordinary paragraph line is none of these.
_HTML_BLOCK_TAGS = frozenset(
    """address article aside base basefont blockquote body caption center col
    colgroup dd details dialog dir div dl dt fieldset figcaption figure footer
    form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li
    link main menu menuitem nav noframes ol optgroup option p param search
    section summary table tbody td tfoot th thead title tr track ul pre script
    style textarea""".split()
)
_HTML_OPEN_RE = re.compile(r"^ {0,3}<(?P<close>/?)(?P<tag>[A-Za-z][A-Za-z0-9-]*)(?=[\s/>]|$)")
_HTML_ONLY_TAG_RE = re.compile(r"^ {0,3}</?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?/?>[ \t]*$")


def split_lines(text: str) -> list[str]:
    """`text` as lines, each with its ending, split only where CommonMark is.

    `str.splitlines` is not that: it also breaks at a form feed, at U+2028, and
    at half a dozen other characters, and a card that contains one would have
    its lines counted differently from every other implementation.
    """
    return _LINE_RE.findall(text)


class Positions:
    """Spans for one text: UTF-8 byte offsets, a 1-indexed line and column.

    The column counts Unicode code points, so it is the same number in every
    implementation whatever its string type; the offsets count bytes, which is
    what a file on disk is made of.
    """

    def __init__(self, text: str):
        self.text = text
        #: Index of the first character of every line.
        self.starts = [0, *(m.end() for m in _EOL_RE.finditer(text))]
        self._ascii = text.isascii()
        self._byte_starts: list[int] | None = None

    def line_col(self, index: int) -> tuple[int, int]:
        line = bisect_right(self.starts, index)
        return line, index - self.starts[line - 1] + 1

    def byte(self, index: int) -> int:
        """The UTF-8 byte offset of the character at `index`."""
        if self._ascii:
            return index
        if self._byte_starts is None:
            total, out = 0, []
            for begin, end in zip(self.starts, [*self.starts[1:], len(self.text)]):
                out.append(total)
                total += len(self.text[begin:end].encode("utf-8"))
            self._byte_starts = out
        line = bisect_right(self.starts, index) - 1
        return self._byte_starts[line] + len(self.text[self.starts[line] : index].encode("utf-8"))


def mask(text: str) -> str:
    """Return `text` with uninterpreted regions blanked out, offsets preserved.

    Masked: fenced code blocks, HTML comments, and inline code spans.

    Indented code blocks are deliberately NOT masked. This tree ships the
    `admonition` and `footnotes` extensions, under which a four-space indent
    marks callout bodies and footnote continuations rather than code; masking it
    would silently drop real links from ordinary prose.
    """
    chars = list(text)
    for start, end in _masked_regions(text):
        for i in range(start, end):
            if chars[i] not in "\r\n":
                chars[i] = " "
    return one_line_ending("".join(chars))


def one_line_ending(text: str) -> str:
    """Spell every line ending as `\n` without changing the length of `text`."""
    if "\r" not in text:
        return text
    return text.replace("\r\n", " \n").replace("\r", "\n")


def _masked_regions(text: str) -> list[tuple[int, int]]:
    regions = list(_fenced_regions(text))
    blanked = _blank(text, regions)

    # Comments and code spans are found in text that already has fences removed,
    # so a "<!--" inside a code block cannot open a comment.
    for m in _HTML_COMMENT_RE.finditer(blanked):
        regions.append((m.start(), m.end()))
    blanked = _blank(blanked, regions)

    for m in _CODE_SPAN_RE.finditer(blanked):
        # A code span cannot span a blank line, whichever line ending it uses.
        if "\n\n" in m.group(0).replace("\r\n", "\n").replace("\r", "\n"):
            continue
        regions.append((m.start(), m.end()))
    return regions


def _blank(text: str, regions: list[tuple[int, int]]) -> str:
    chars = list(text)
    for start, end in regions:
        for i in range(start, end):
            if chars[i] not in "\r\n":
                chars[i] = " "
    return "".join(chars)


def _fenced_regions(text: str):
    """Yield (start, end) for each fenced code block, closed or not."""
    open_fence: str | None = None
    open_start = 0
    offset = 0
    for line in split_lines(text):
        stripped = line.rstrip("\r\n")
        m = _FENCE_RE.match(stripped)
        if open_fence is None:
            if m and not m.group("info").strip().startswith(m.group("fence")[0]):
                open_fence = m.group("fence")
                open_start = offset
        else:
            # A closer is the same character, at least as long, with no info string.
            if (
                m
                and m.group("fence")[0] == open_fence[0]
                and len(m.group("fence")) >= len(open_fence)
                and not m.group("info").strip()
            ):
                yield (open_start, offset + len(line))
                open_fence = None
        offset += len(line)
    if open_fence is not None:  # unterminated fence runs to end of file
        yield (open_start, len(text))


def find_fences(text: str):
    """Yield (info, body, span_start, span_end) for each fenced code block.

    Runs on unmasked text, since the point is to look *inside* a fence. Nested
    fences are not reported separately: `_fenced_regions` already pairs an
    opener with its closer, so an inner fence is part of the outer body.
    """
    for start, end in _fenced_regions(text):
        block = text[start:end]
        lines = split_lines(block)
        if not lines:
            continue
        opener = _FENCE_RE.match(lines[0].rstrip("\r\n"))
        if opener is None:
            continue
        # The closing fence is the last line unless the block is unterminated.
        closes = len(lines) > 1 and _FENCE_RE.match(lines[-1].rstrip("\r\n"))
        body = "".join(lines[1:-1] if closes else lines[1:])
        yield opener.group("info").strip(), body, start, end


def line_col(text: str, offset: int) -> tuple[int, int]:
    """1-indexed line and code-point column for an index into `text`."""
    return Positions(text).line_col(offset)


def find_headings(masked: str):
    """Yield (level, text, span_start, span_end) for each heading, in order.

    Both forms CommonMark defines: an ATX heading (`# Setup`), and a setext
    heading, a paragraph over a line of `=` (level 1) or `-` (level 2). A setext
    heading's span runs from its first content line to the end of its
    underline, so its content is everything before the span's last line break.
    """
    found = []
    for m in _ATX_HEADING_RE.finditer(masked):
        text = m.group("text")
        # Drop a closing hash run, then any trailing block anchor.
        text = re.sub(r"[ \t]+#+[ \t]*$", "", text)
        text = re.sub(r"[ \t]+\^[A-Za-z0-9][A-Za-z0-9_-]{0,63}[ \t]*$", "", text)
        # The span ends at the last character of the heading, not at trailing
        # blanks — one of which may be the `\r` of a `\r\n`.
        end = m.start() + len(m.group(0).rstrip(" \t"))
        found.append((len(m.group("hashes")), text.strip(), m.start(), end))
    found.extend(_setext_headings(masked))
    found.sort(key=lambda heading: heading[2])
    yield from found


def _setext_headings(masked: str):
    """Yield (level, text, span_start, span_end) for each setext heading.

    A line-oriented reading of CommonMark's paragraph rule, on masked text. A
    paragraph starts at a line no other block claims, runs until a blank line
    or a line that interrupts it, and becomes a heading when its next line is
    an underline. Masked lines are blank here, so a fence, an HTML comment
    block, and the frontmatter all end a paragraph, and no line inside one is
    ever part of a heading. A `---` after a blank line is a thematic break,
    because no paragraph is open to underline.

    Lines that open a block quote, a list item, or an HTML block start a
    container this scanner does not descend into: everything up to the next
    blank line belongs to it, so a `---` there is not an underline.
    """
    paragraph: int | None = None  # offset where the open paragraph starts
    container = False
    offset = 0
    last_end = 0  # end of the previous line, without its line ending
    for line in masked.split("\n"):
        start, end = offset, offset + len(line)
        offset = end + 1
        content = line.rstrip(" \t")
        if not content.strip():
            paragraph, container = None, False
            continue
        if container:
            continue
        underline = _SETEXT_UNDERLINE_RE.match(content)
        if paragraph is not None and underline:
            level = 1 if underline.group("char")[0] == "=" else 2
            text = " ".join(part.strip() for part in masked[paragraph:last_end].split("\n"))
            yield level, text.strip(), paragraph, start + len(content)
            paragraph = None
            continue
        if _ATX_START_RE.match(content) or _THEMATIC_BREAK_RE.match(content):
            paragraph = None
            continue
        if _opens_container(content, interrupting=paragraph is not None):
            paragraph, container = None, True
            continue
        if paragraph is None:
            if _indent(content) >= 4:
                # An indented code block, which cannot be a heading. It is not
                # masked, but it is not a paragraph either.
                container = True
                continue
            paragraph = start
        last_end = start + len(content)


def _indent(line: str) -> int:
    width = 0
    for char in line:
        if char == " ":
            width += 1
        elif char == "\t":
            width += 4 - width % 4
        else:
            break
    return width


def _opens_container(line: str, interrupting: bool) -> bool:
    """Whether `line` opens a block this scanner does not descend into.

    `interrupting` is whether a paragraph is open. CommonMark lets fewer blocks
    interrupt a paragraph than start after a blank line: an empty list item, an
    ordered item not numbered 1, and a line holding one bare tag do not, and
    are then that paragraph's continuation text.
    """
    if _BLOCKQUOTE_RE.match(line):
        return True
    item = _LIST_ITEM_RE.match(line)
    if item is not None:
        if not interrupting:
            return True
        marker = line.strip().split()[0]
        if not line[item.end() :].strip():
            return False
        return not marker[0].isdigit() or marker[:-1] == "1"
    tag = _HTML_OPEN_RE.match(line)
    if tag is None:
        return not interrupting and line.lstrip(" ").startswith(("<!", "<?"))
    if tag.group("tag").lower() in _HTML_BLOCK_TAGS:
        return True
    return not interrupting and bool(_HTML_ONLY_TAG_RE.match(line))


def find_anchors(masked: str):
    """Yield (block_id, span_start, span_end) for each trailing ``^id``."""
    for m in _ANCHOR_RE.finditer(masked):
        yield m.group("id"), m.start(), m.end("id")


def find_links(masked: str):
    """Yield (bang, inner, span_start, span_end) for each well-formed link."""
    for m in _LINK_RE.finditer(masked):
        yield m.group("bang") == "!", m.group("inner"), m.start(), m.end()
