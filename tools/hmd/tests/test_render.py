"""Flat markdown and HTML rendering (HMD-0002 §5)."""

from __future__ import annotations

from hypermarkdown.render import flat
from hypermarkdown.render.ids import heading_ids


def page(ws, rel):
    return ws.root / rel


def test_a_resolved_link_becomes_a_relative_markdown_link(build_workspace):
    ws = build_workspace({"a/one.hmd": "# One\n\n[[two]]\n", "a/two.hmd": "# Two\n"})
    assert "[two](two.md)" in flat.render(ws, page(ws, "a/one.hmd")).text


def test_a_link_up_the_tree_is_relative_to_the_source(build_workspace):
    ws = build_workspace({"a/b/deep.hmd": "# Deep\n\n[[top]]\n", "top.hmd": "# Top\n"})
    assert "[top](../../top.md)" in flat.render(ws, page(ws, "a/b/deep.hmd")).text


def test_display_text_is_preserved(build_workspace):
    ws = build_workspace({"a.hmd": "# A\n\n[[b|the other one]]\n", "b.hmd": "# B\n"})
    assert "[the other one](b.md)" in flat.render(ws, page(ws, "a.hmd")).text


def test_a_heading_fragment_becomes_a_slug_anchor(build_workspace):
    ws = build_workspace({"a.hmd": "# A\n\n[[b#My Section]]\n", "b.hmd": "# B\n\n## My Section\n"})
    assert "(b.md#my-section)" in flat.render(ws, page(ws, "a.hmd")).text


def test_a_block_fragment_drops_the_anchor(build_workspace):
    """Plain markdown has no anchor for a block id, so a dead link is not emitted."""
    ws = build_workspace({"a.hmd": "# A\n\n[[b#^id]]\n", "b.hmd": "# B\n\ntext ^id\n"})
    out = flat.render(ws, page(ws, "a.hmd")).text
    assert "(b.md)" in out and "#^id" not in out


def test_an_unresolved_link_survives_as_written(build_workspace):
    ws = build_workspace({"a.hmd": "# A\n\n[[nope]]\n"})
    assert "[[nope]]" in flat.render(ws, page(ws, "a.hmd")).text


def test_a_link_inside_an_embed_is_written_relative_to_the_host(build_workspace):
    """The link resolves from the card it was written in, but the text it becomes
    belongs to the page being rendered."""
    ws = build_workspace(
        {
            "host.hmd": "# Host\n\n![[deep/card]]\n",
            "deep/card.hmd": "# Card\n\n[[sibling]]\n",
            "deep/sibling.hmd": "# Sibling\n",
        }
    )
    out = flat.render(ws, page(ws, "host.hmd")).text
    assert "[sibling](deep/sibling.md)" in out


def test_links_in_code_spans_are_left_alone(build_workspace):
    ws = build_workspace({"a.hmd": "# A\n\n`[[b]]`\n", "b.hmd": "# B\n"})
    assert "`[[b]]`" in flat.render(ws, page(ws, "a.hmd")).text


def test_html_output_runs_the_python_markdown_pipeline(build_workspace):
    ws = build_workspace({"a.hmd": "# A\n\n| x | y |\n| - | - |\n| 1 | 2 |\n"})
    html = flat.to_html(ws, page(ws, "a.hmd")).text
    assert "<h1" in html and "<table>" in html


def test_html_links_point_at_html(build_workspace):
    ws = build_workspace({"a.hmd": "# A\n\n[[b]]\n", "b.hmd": "# B\n"})
    assert 'href="b.html"' in flat.to_html(ws, page(ws, "a.hmd")).text


def test_the_example_fixture_renders_without_diagnostics(example_workspace):
    result = flat.render(example_workspace, example_workspace.root / "specs/auth/login.hmd")
    assert result.diagnostics == []
    # The block embed of the glossary definition is inlined, marker stripped.
    assert "A bearer credential presented on every request" in result.text
    assert "^definition" not in result.text


# -- heading ids ---------------------------------------------------------


def test_a_repeated_heading_links_to_the_id_toc_gives_it(build_workspace):
    """The language reaches the first `Setup`; `toc` names it `setup`, and a
    fragment written differently still lands there."""
    ws = build_workspace(
        {"a.hmd": "# A\n\n[[b#setup!]]\n", "b.hmd": "# B\n\n## Intro\n\n## Setup\n\n## Setup\n"}
    )
    assert "(b.md#setup)" in flat.render(ws, page(ws, "a.hmd")).text


def test_an_embedded_heading_takes_its_id_first(build_workspace):
    """`toc` numbers repeats across the page, embeds included, so a card's own
    `Setup` after an embedded one is `setup_1` on its page."""
    ws = build_workspace(
        {
            "a.hmd": "# A\n\n[[b#Setup]]\n",
            "b.hmd": "# B\n\n![[c]]\n\n## Setup\n",
            "c.hmd": "## Setup\n\nembedded\n",
        }
    )
    assert heading_ids(ws, page(ws, "b.hmd")) == ["b", "setup_1"]
    assert "(b.md#setup_1)" in flat.render(ws, page(ws, "a.hmd")).text


def test_a_heading_toc_cannot_slug_still_gets_its_id(build_workspace):
    ws = build_workspace({"a.hmd": "# A\n\n[[b#数据]]\n", "b.hmd": "# B\n\n## 数据\n"})
    assert heading_ids(ws, page(ws, "b.hmd")) == ["b", "_1"]
    assert "(b.md#_1)" in flat.render(ws, page(ws, "a.hmd")).text


def test_ids_match_python_markdown_on_the_rendered_page(build_workspace):
    import re

    ws = build_workspace(
        {
            "b.hmd": (
                "# B\n\n![[c]]\n\n## Ошибка 404!\n\nSetup\n-----\n\n## The *fast* path\n\n"
                "## Setup\n\n## 数据\n"
            ),
            "c.hmd": "## Setup\n",
        }
    )
    html = flat.to_html(ws, page(ws, "b.hmd")).text
    rendered = re.findall(r'<h[1-6] id="([^"]*)"', html)
    b = ws.documents[page(ws, "b.hmd")]
    ids = heading_ids(ws, page(ws, "b.hmd"))
    assert len(ids) == len(b.headings)
    # The card's own headings are the rendered ones less the embedded `Setup`.
    assert ids == [rendered[0], *rendered[2:]]


def test_an_unmatched_fragment_links_to_the_page(build_workspace):
    ws = build_workspace({"a.hmd": "# A\n\n[[b#Nope]]\n", "b.hmd": "# B\n"})
    assert "(b.md)" in flat.render(ws, page(ws, "a.hmd")).text


def test_attr_list_sets_an_id_outright(build_workspace):
    ws = build_workspace({"b.hmd": "# B\n\n## Setup {#install .wide}\n\n## Setup\n"})
    assert heading_ids(ws, page(ws, "b.hmd"), attr_list=True) == ["b", "install", "setup"]
    assert heading_ids(ws, page(ws, "b.hmd")) == ["b", "setup-install-wide", "setup"]
