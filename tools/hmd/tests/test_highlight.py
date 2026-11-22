"""The Pygments lexer for cards, registered as `hmd`."""

from __future__ import annotations

from pathlib import Path

import pytest

pygments = pytest.importorskip("pygments")

from pygments.lexers import get_lexer_by_name  # noqa: E402
from pygments.token import Error, Name  # noqa: E402

from hypermarkdown.highlight import HmdLexer  # noqa: E402

EXAMPLES = Path(__file__).resolve().parents[3] / "examples"


def _tokens(source: str):
    return list(HmdLexer().get_tokens_unprocessed(source))


def _values(source: str, token):
    return [value for _, kind, value in _tokens(source) if kind is token]


def test_pygments_finds_the_lexer_by_name():
    assert isinstance(get_lexer_by_name("hmd"), HmdLexer)
    assert isinstance(get_lexer_by_name("hypermarkdown"), HmdLexer)


#: The corpus case that is deliberately not UTF-8, so not a card to lex.
NOT_UTF8 = EXAMPLES / "conformance" / "cases" / "invalid-utf8" / "tree" / "bad.hmd"

CARDS = sorted(p for p in EXAMPLES.rglob("*.hmd") if p.is_file() and p != NOT_UTF8)


@pytest.mark.parametrize("card", CARDS, ids=lambda p: p.name)
def test_every_example_card_lexes_whole(card):
    """A highlighter must not lose or invent text, and must never give up."""
    source = card.read_text(encoding="utf-8")
    tokens = _tokens(source)
    assert "".join(value for _, _, value in tokens) == source
    assert not [value for _, kind, value in tokens if kind is Error]


def test_a_link_and_an_embed_are_different_tokens():
    source = "See [[tokens#Rotation|the window]] and ![[glossary/token#^definition]].\n"
    assert _values(source, Name.Tag) == ["[[", "tokens", "]]"]
    assert _values(source, Name.Decorator) == ["![[", "glossary/token", "]]"]
    assert _values(source, Name.Attribute) == ["Rotation", "definition"]


def test_a_trailing_block_anchor_is_a_label():
    assert _values("A definition. ^definition\n", Name.Label) == ["^definition"]


def test_a_link_inside_a_code_span_is_not_a_link():
    assert _values("Write `[[card]]` to link.\n", Name.Tag) == []


def test_frontmatter_is_lexed_as_yaml():
    source = "---\ntags: [area/auth]\n---\n\n# Title\n"
    assert "tags" in _values(source, Name.Tag)


def test_a_cell_fence_keeps_its_info_string_and_a_plain_body():
    source = "```hql#eval id=books\ncards | size\n```\n"
    assert _values(source, Name.Label) == ["hql#eval id=books"]
    # The body is code, not a link, whatever brackets it holds.
    assert _values("```hql#eval\n[[not-a-link]]\n```\n", Name.Tag) == []


def test_a_longer_fence_holds_a_shorter_one():
    source = "````hmd\n```d2\na -> b\n```\n````\n"
    tokens = _tokens(source)
    assert "".join(value for _, _, value in tokens) == source
    assert _values(source, Name.Label) == ["hmd", "d2"]
