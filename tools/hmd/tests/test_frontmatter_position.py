"""Where a frontmatter diagnostic is reported: the specification's five rules.

Positions are the card's: the opening `---` is line 1, so a block's first line
is line 2. The TypeScript implementation's `test/frontmatterPosition.test.ts`
holds the same table, and the two must agree row for row.
"""

from __future__ import annotations

import pytest

from hypermarkdown.frontmatter_position import Entry, Key, Locator, Nested

CASES = [
    # (block, where, (line, column))
    ("tags: 5\n", Key("tags"), (2, 1)),
    ("owner: me\ntags: 5\n", Key("tags"), (3, 1)),
    ('"tags": 5\n', Key("tags"), (2, 1)),
    ("other: 1\n", Key("tags"), (1, 1)),  # no such key: the block's start
    ("nav:\n  order: 1\n  colour: red\n", Nested("nav", "colour"), (4, 3)),
    ("nav:\n\torder: x\n", Nested("nav", "order"), (3, 2)),
    ("nav:\n  order: 1\n", Nested("nav", "colour"), (2, 1)),  # falls back to the key
    ("nav: {order: x}\n", Nested("nav", "order"), (2, 7)),  # a flow mapping
    ("nav: {visibility: x, 'order': y}\n", Nested("nav", "order"), (2, 22)),
    # Block lists: the first character after `- `.
    ("import:\n  - from /a import b\n  - bad\n", Entry("import", 1), (4, 5)),
    ("tags:\n- a\n- ''\n", Entry("tags", 1), (4, 3)),  # a list at column 1
    ("tags:\n  - a\n  # a comment\n\n  - b\n", Entry("tags", 1), (6, 5)),
    ("tags:\n  - a\n  -\n", Entry("tags", 1), (4, 3)),  # a bare dash stands in
    ("tags:\n  - - x\n  - y\n", Entry("tags", 1), (4, 5)),
    ("tags: # note\n  - a\n  - b\n", Entry("tags", 1), (4, 5)),
    # Flow lists: the entry's own first character, an opening quote included.
    ('tags: ["", area]\n', Entry("tags", 0), (2, 8)),
    ("tags: [area, {key: value}]\n", Entry("tags", 1), (2, 14)),
    ('tags: ["a, b", c]\n', Entry("tags", 1), (2, 16)),  # a comma inside quotes
    ("tags: ['it''s', [x, y], z]\n", Entry("tags", 2), (2, 25)),
    ("tags: [\n  a,\n  '',\n]\n", Entry("tags", 1), (4, 3)),  # across lines
    ("tags: [a]\n", Entry("tags", 3), (2, 1)),  # no such entry: the key
    # A scalar value is the key's own.
    ("use: no_discovery\n", Entry("use", 0), (2, 1)),
    ("tags: []\n", Key("tags"), (2, 1)),
    # Columns count code points: the astral `𝒜` is one column, not two.
    ("tags: [𝒜, '']\n", Entry("tags", 1), (2, 11)),
]


@pytest.mark.parametrize(("block", "where", "position"), CASES)
def test_the_position_of(block, where, position):
    assert Locator(block)(where) == position


def test_the_block_itself_is_at_line_one_column_one():
    assert Locator("tags: [unclosed\n")(None) == (1, 1)


@pytest.mark.parametrize(
    ("block", "value"),
    [
        ("nav:\n  order: 1.0\n", "1.0"),
        ("nav:\n  order: 1e3  # an exponent\n", "1e3"),
        ("nav:\n  visibility: public\n  order:   -3\n", "-3"),
        ("nav:\n  visibility: public\n", None),  # no such key
        ("nav: {order: 1.0}\n", "1.0"),  # a flow mapping on the key's line
        ("nav: {visibility: public, order: 2}\n", "2"),
    ],
)
def test_the_raw_value_of_a_nested_key(block, value):
    assert Locator(block).nested_value("nav", "order") == value
