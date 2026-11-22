"""Grammar, frontmatter, headings and their keys, and spans."""

from __future__ import annotations

from pathlib import Path

import pytest

from hypermarkdown.model import heading_key
from hypermarkdown.parse import parse

PATH = Path("/tmp/page.hmd")


def doc(text: str):
    return parse(PATH, text, "page.hmd")


def rules(document) -> list[str]:
    return [d.rule for d in document.diagnostics]


# -- links ---------------------------------------------------------------


def test_plain_wikilink():
    (link,) = doc("[[Page]]\n").links
    assert (link.page_ref, link.fragment, link.display, link.is_embed) == ("Page", None, None, False)


def test_aliased_link_splits_on_the_first_pipe_only():
    (link,) = doc("[[Page|a | b]]\n").links
    assert link.page_ref == "Page" and link.display == "a | b"


def test_heading_and_block_fragments():
    heading, block = doc("[[P#Section]] [[P#^id-1]]\n").links
    assert (heading.fragment, heading.fragment_kind) == ("Section", "heading")
    assert (block.fragment, block.fragment_kind) == ("id-1", "block")


def test_embed_forms():
    assert all(link.is_embed for link in doc("![[A]] ![[B#S]] ![[C#^d]]\n").links)


def test_trailing_extension_is_kept_verbatim_for_the_resolver():
    (link,) = doc("[[Page.hmd]]\n").links
    assert link.page_ref == "Page.hmd"


@pytest.mark.parametrize(
    "text",
    [
        "[[]]\n",
        "[[Page|]]\n",
        "[[#tag]]\n",
        "[[#area/auth]]\n",
        "[[a^b]]\n",
        "[[P#^bad id]]\n",
        "[[P#^-leading]]\n",
        "[[P#]]\n",
        "[[unterminated\n",
    ],
    ids=["empty", "empty-display", "tag", "nested-tag", "caret", "space-in-id",
         "leading-dash", "empty-fragment", "unterminated"],
)
def test_malformed_links_raise_hmd010(text):
    assert "HMD010" in rules(doc(text))


def test_block_id_length_boundary():
    ok = "a" * 64
    assert doc(f"[[P#^{ok}]]\n").links[0].fragment == ok
    assert "HMD010" in rules(doc(f"[[P#^{'a' * 65}]]\n"))


def test_tags_are_never_link_targets():
    """`#` is reserved for fragments, which is what keeps the two axes apart."""
    assert doc("[[#area/auth]]\n").links == ()


# -- headings and keys ---------------------------------------------------


def test_a_heading_key_folds_case_and_punctuation():
    headings = doc("# My Section\n## Rotation!\n").headings
    assert [h.key for h in headings] == ["my section", "rotation"]


def test_repeated_headings_share_one_key_and_get_no_suffix():
    """The `_1` suffix is a renderer's numbering, not part of the language."""
    headings = doc("# Dup\n# Dup\n# dup!\n").headings
    assert [h.key for h in headings] == ["dup", "dup", "dup"]


def test_heading_text_drops_closing_hashes_and_anchors():
    headings = doc("## Title ##\n### Other ^anchor-id\n#### Both ## ^x\n").headings
    assert [h.text for h in headings] == ["Title", "Other", "Both"]


def test_heading_text_uses_original_text_not_masked_text():
    (heading,) = doc("## The `hmd` CLI\n").headings
    assert (heading.text, heading.key) == ("The hmd CLI", "the hmd cli")


@pytest.mark.parametrize(
    ("source", "text"),
    [
        ("# The *fast* path", "The fast path"),
        ("# **Bold** and _em_", "Bold and em"),
        ("# snake_case_name", "snake_case_name"),
        ("# 2 * 3", "2 * 3"),
        ("# See [the docs](https://example.org/x) now", "See the docs now"),
        ("# An ![icon](a.png) here", "An icon here"),
        ("# Raw <b>html</b> and <!-- note --> gone", "Raw html and gone"),
        ("# Fish &amp; chips", "Fish & chips"),
        ("# Escaped \\*star\\*", "Escaped *star*"),
        ("# Go to [[owl|the owl]] or [[bat#Wings]]", "Go to the owl or bat"),
        ("# <https://example.org>", "https://example.org"),
        ("# ##", ""),
    ],
)
def test_heading_text_is_what_a_reader_sees(source, text):
    (heading,) = doc(source + "\n").headings
    assert heading.text == text


@pytest.mark.parametrize(
    ("text", "key"),
    [
        ("Ошибка 404!", "ошибка 404"),
        ("Café — Menu", "café menu"),
        ("数据 · 分析", "数据 分析"),
        ("STRASSE", "strasse"),
        ("Straße", "strasse"),  # full case folding, not lowercasing
        ("  spaced   out  ", "spaced out"),
        ("!!!", ""),
        ("e\u0301", "\u00e9"),  # NFC first: a decomposed é is the composed one
    ],
)
def test_heading_key(text, key):
    assert heading_key(text) == key


def test_accents_are_significant():
    assert heading_key("Café") != heading_key("Cafe")


# -- setext headings -----------------------------------------------------


def test_setext_headings_are_headings():
    headings = doc("Setup\n=====\n\nUsage\n-----\n").headings
    assert [(h.level, h.text) for h in headings] == [(1, "Setup"), (2, "Usage")]


def test_a_setext_heading_may_span_lines():
    (heading,) = doc("First line\nsecond line\n===\n").headings
    assert heading.text == "First line second line"
    assert heading.span.line == 1


def test_a_setext_heading_drops_a_trailing_anchor():
    (heading,) = doc("Setup ^setup-linux\n---\n").headings
    assert heading.text == "Setup"


@pytest.mark.parametrize(
    "text",
    [
        "Para\n\n---\n",  # a break after a blank line
        "```\nCode\n---\n```\n",  # inside a fence
        "<!--\nNote\n---\n-->\n",  # inside a comment
        "> Quote\n---\n",  # a block quote is not underlined
        "- Item\n---\n",  # nor is a list item
        "    code\n---\n",  # nor an indented code block
        "---\n",  # a break with nothing above it
    ],
    ids=["blank-line", "fence", "comment", "quote", "list", "indented", "alone"],
)
def test_lines_that_are_not_setext_headings(text):
    assert doc(text).headings == ()


def test_frontmatter_fence_is_not_a_setext_underline():
    document = doc("---\ntitle: x\n---\nBody\n")
    assert document.frontmatter == {"title": "x"}
    assert document.headings == ()


def test_an_underline_after_a_frontmatter_line_is_a_heading_of_the_body():
    (heading,) = doc("---\ntitle: x\n---\nBody\n---\n").headings
    assert (heading.level, heading.text, heading.span.line) == (2, "Body", 4)


def test_setext_and_atx_headings_interleave_in_document_order():
    headings = doc("# One\nTwo\n---\n### Three\n").headings
    assert [h.text for h in headings] == ["One", "Two", "Three"]


# -- encoding, line endings, and spans -----------------------------------


@pytest.mark.parametrize("eol", ["\n", "\r\n", "\r"], ids=["lf", "crlf", "cr"])
def test_every_line_ending_counts_as_one(eol):
    text = eol.join(["# Title ^top", "", "Setup", "---", "", "see [[target]] here ^b", ""])
    document = doc(text)
    assert [(h.text, h.span.line) for h in document.headings] == [("Title", 1), ("Setup", 3)]
    assert [(a.block_id, a.span.line) for a in document.anchors] == [("top", 1), ("b", 6)]
    (link,) = document.links
    assert (link.span.line, link.span.column) == (6, 5)


def test_span_offsets_count_utf8_bytes_and_columns_count_code_points():
    text = "# Ü\n\n😀 é [[x]]\n"
    (link,) = doc(text).links
    data = text.encode("utf-8")
    assert data[link.span.start : link.span.end] == b"[[x]]"
    # Code points before the link: the emoji, a space, `é`, a space.
    assert (link.span.line, link.span.column) == (3, 5)
    assert text[link.span.index : link.span.index_end] == "[[x]]"


def test_a_diagnostic_column_counts_code_points():
    (diagnostic,) = doc("😀 [[]]\n").diagnostics
    assert (diagnostic.rule, diagnostic.line, diagnostic.column) == ("HMD010", 1, 3)


def test_lines_end_only_where_commonmark_says():
    """A form feed or U+2028 is not a line break, though `str.splitlines` thinks so."""
    document = doc("a\x0cb\u2028c [[x]]\n")
    assert document.links[0].span.line == 1


# -- anchors -------------------------------------------------------------


def test_anchor_extraction():
    assert [a.block_id for a in doc("Some text. ^my-id\n").anchors] == ["my-id"]


# -- frontmatter ---------------------------------------------------------


def test_frontmatter_is_parsed_and_body_offsets_stay_exact():
    document = doc("---\ntags: [a]\n---\n\n[[Target]]\n")
    assert document.card.tags == ("a",)
    assert document.links[0].span.line == 5


def test_frontmatter_must_start_at_byte_zero():
    document = doc("\n---\ntags: [a]\n---\n")
    assert document.frontmatter == {} and document.card.tags == ()


def test_empty_frontmatter_is_an_empty_mapping():
    assert doc("---\n---\n").frontmatter == {}


@pytest.mark.parametrize(
    "text", ["---\n: : :\n---\n", "---\n- a\n- b\n---\n", "---\njust a string\n---\n"]
)
def test_bad_frontmatter_raises_hmd009(text):
    assert "HMD009" in rules(doc(text))


def test_unknown_use_feature_raises_hmd013():
    assert "HMD013" in rules(doc("---\nuse: [autodiscovry]\n---\n"))


def test_no_prefix_disables_a_feature():
    assert doc("---\nuse: [no_autodiscovery]\n---\n").card.use == {"autodiscovery": False}


def test_use_accepts_a_bare_string():
    assert doc("---\nuse: autodiscovery\n---\n").card.use == {"autodiscovery": True}


def test_malformed_tags_raise_hmd013():
    assert "HMD013" in rules(doc("---\ntags: not-a-list\n---\n"))


def test_user_owned_keys_pass_through_untouched():
    document = doc("---\nauthor: yy\nweird_key: {a: 1}\n---\n")
    assert document.frontmatter["author"] == "yy"
    assert document.frontmatter["weird_key"] == {"a": 1}
    assert document.diagnostics == []


def test_links_inside_frontmatter_are_not_links():
    assert doc("---\ntitle: '[[not-a-link]]'\n---\n\nbody\n").links == ()
