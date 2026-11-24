"""Where a frontmatter diagnostic is reported (the specification's frontmatter rules).

A YAML parser hands back values without their source positions, and every
implementation has to put a diagnostic on the same line and column, so the
positions are found by reading the block's lines with a rule simple enough to
write the same way everywhere:

1. A block that is not valid YAML, or not a mapping, is at line 1, column 1.
2. A malformed value of a top-level key is at that key.
3. A problem inside `nav` is at the offending key inside `nav`.
4. A malformed list entry is at the entry's first character: in a block list,
   the first character after `- `; in a flow list, the entry's own first
   character, its opening quote included.
5. Anything else is at its nearest enclosing key, and failing that at the
   beginning of the block.

Lines and columns are the card's: the opening `---` is line 1, so the block's
first line is line 2, and a column counts code points from 1.

The TypeScript implementation's `frontmatterPosition.ts` is a port of this
module, and the two must stay line for line in step.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

#: The block's first line, in the card's numbering: line 1 is the `---` fence.
FIRST_LINE = 2

_LINE_BREAK_RE = re.compile(r"\r\n|\r|\n")


@dataclass(frozen=True)
class Key:
    """A top-level key, such as `tags`."""

    name: str


@dataclass(frozen=True)
class Nested:
    """A key inside a top-level mapping, such as `colour` inside `nav`."""

    parent: str
    name: str


@dataclass(frozen=True)
class Entry:
    """The entry at `index` of the list under a top-level key."""

    parent: str
    index: int


Where = Key | Nested | Entry | None


class Locator:
    """Positions inside one frontmatter block, as (line, column) of the card."""

    def __init__(self, raw: str):
        self.lines = _LINE_BREAK_RE.split(raw)

    def __call__(self, where: Where) -> tuple[int, int]:
        if isinstance(where, Key):
            return self.key(where.name)
        if isinstance(where, Nested):
            return self.nested(where.parent, where.name)
        if isinstance(where, Entry):
            return self.entry(where.parent, where.index)
        return (1, 1)

    # -- the three kinds of place ------------------------------------------

    def key(self, name: str) -> tuple[int, int]:
        row = self._top(name)
        return (1, 1) if row is None else (row + FIRST_LINE, 1)

    def nested(self, parent: str, name: str) -> tuple[int, int]:
        row = self._top(parent)
        if row is None:
            return (1, 1)
        # A flow mapping on the key's own line: `nav: {order: x}`.
        flow = re.search(r"[{,][ \t]*(" + _key_pattern(name) + r")[ \t]*:", self.lines[row])
        if flow:
            return (row + FIRST_LINE, flow.start(1) + 1)
        pattern = re.compile(r"^([ \t]+)" + _key_pattern(name) + r"[ \t]*:")
        for inner in self._block(row):
            m = pattern.match(self.lines[inner])
            if m:
                return (inner + FIRST_LINE, len(m.group(1)) + 1)
        return self.key(parent)

    def nested_value(self, parent: str, name: str) -> str | None:
        """The raw text of a nested key's value, as written, or None.

        A YAML parser reads `1.0` as a number in some implementations and a
        float in others; the token as written is what tells them apart.
        """
        row = self._top(parent)
        if row is None:
            return None
        # A flow mapping on the key's own line: `nav: {order: 1.0}`.
        flow = re.search(
            r"[{,][ \t]*" + _key_pattern(name) + r"[ \t]*:[ \t]*([^,}]*)", self.lines[row]
        )
        if flow:
            return flow.group(1).strip(" \t")
        pattern = re.compile(r"^[ \t]+" + _key_pattern(name) + r"[ \t]*:(.*)$")
        for inner in self._block(row):
            m = pattern.match(self.lines[inner])
            if m:
                value = re.sub(r"(?:^|[ \t])#.*$", "", m.group(1))
                return value.strip(" \t")
        return None

    def entry(self, parent: str, index: int) -> tuple[int, int]:
        row = self._top(parent)
        if row is None:
            return (1, 1)
        line = self.lines[row]
        after = _top_key_re(parent).match(line).end()
        rest = line[after:]
        stripped = rest.lstrip(" \t")
        if stripped.startswith("["):
            found = self._flow_entry(row, after + len(rest) - len(stripped), index)
            return found if found is not None else self.key(parent)
        if stripped == "" or stripped.startswith("#"):
            found = self._block_entry(row, index)
            return found if found is not None else self.key(parent)
        return self.key(parent)

    # -- reading the lines -------------------------------------------------

    def _top(self, name: str) -> int | None:
        pattern = _top_key_re(name)
        for row, line in enumerate(self.lines):
            if pattern.match(line):
                return row
        return None

    def _block(self, row: int) -> list[int]:
        """The lines that belong to the top-level key on `row`."""
        rows = []
        for inner in range(row + 1, len(self.lines)):
            line = self.lines[inner]
            if line == "" or line[0] in " \t#-":
                rows.append(inner)
                continue
            break
        return rows

    def _block_entry(self, row: int, index: int) -> tuple[int, int] | None:
        indent: str | None = None
        seen = 0
        for inner in self._block(row):
            m = _BLOCK_ITEM_RE.match(self.lines[inner])
            if not m:
                continue
            if indent is None:
                indent = m.group(1)
            if m.group(1) != indent:
                continue  # an item of a list nested deeper
            if seen == index:
                # A bare `-` has no first character after it; the dash stands in.
                first = m.start("first") if m.group("first") else len(m.group(1))
                return (inner + FIRST_LINE, first + 1)
            seen += 1
        return None

    def _flow_entry(self, row: int, column: int, index: int) -> tuple[int, int] | None:
        """The first character of entry `index` of the flow list opened at (row, column)."""
        depth = 0
        quote: str | None = None
        expecting = False
        seen = 0
        r, c = row, column
        while r < len(self.lines):
            line = self.lines[r]
            while c < len(line):
                ch = line[c]
                if quote is not None:
                    if quote == '"' and ch == "\\":
                        c += 2
                        continue
                    if ch == quote:
                        if quote == "'" and line[c + 1 : c + 2] == "'":
                            c += 2
                            continue
                        quote = None
                    c += 1
                    continue
                if expecting and ch not in " \t":
                    if depth == 1 and ch in "]":
                        return None
                    expecting = False
                    if seen == index:
                        return (r + FIRST_LINE, c + 1)
                    seen += 1
                if ch in "\"'":
                    quote = ch
                elif ch in "[{":
                    depth += 1
                    if depth == 1:
                        expecting = True
                elif ch in "]}":
                    depth -= 1
                    if depth == 0:
                        return None
                elif ch == "," and depth == 1:
                    expecting = True
                elif ch == "#" and (c == 0 or line[c - 1] in " \t"):
                    break  # a comment runs to the end of the line
                c += 1
            r, c = r + 1, 0
        return None


_BLOCK_ITEM_RE = re.compile(r"^([ \t]*)-(?:[ \t]+(?P<first>\S)|[ \t]*$)")


def _key_pattern(name: str) -> str:
    escaped = re.escape(name)
    return rf"(?:{escaped}|\"{escaped}\"|'{escaped}')"


def _top_key_re(name: str) -> re.Pattern[str]:
    return re.compile("^" + _key_pattern(name) + r"[ \t]*:")
