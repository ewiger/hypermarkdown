"""A card is UTF-8: HMD019, the byte-order mark, line endings, and NFC names."""

from __future__ import annotations

import unicodedata

from typer.testing import CliRunner

from hypermarkdown import config, graph
from hypermarkdown.cli import app
from hypermarkdown.lint import check
from hypermarkdown.resolve import Workspace

runner = CliRunner()

#: Latin-1 bytes: `é` as 0xE9, which is not UTF-8.
LATIN1 = "# Café\n\n[[other]]\n".encode("latin-1")


def workspace(root) -> Workspace:
    return Workspace(config.load(root_override=root))


# -- HMD019 --------------------------------------------------------------


def test_a_file_that_is_not_utf8_is_hmd019_and_not_a_card(tmp_path):
    (tmp_path / "bad.hmd").write_bytes(LATIN1)
    (tmp_path / "good.hmd").write_text("# Good\n\n[[bad]]\n", encoding="utf-8")
    ws = workspace(tmp_path)

    assert tmp_path / "bad.hmd" not in ws.documents
    assert tmp_path / "bad.hmd" not in ws.pages()
    diagnostics = check(ws)
    assert [(d.rule, d.severity, d.path, d.line, d.column) for d in diagnostics] == [
        ("HMD019", "error", "bad.hmd", 1, 1),
        # Not a link target either, so the link to it does not resolve.
        ("HMD001", "warning", "good.hmd", 3, 1),
    ]
    assert diagnostics[0].message == "not valid UTF-8 (byte 5 cannot be decoded), so it is not a card"


def test_an_undecodable_markdown_file_is_hmd019_too(tmp_path):
    """A Markdown card is not checked, but an undecodable file is not a card."""
    (tmp_path / "notes.md").write_bytes(LATIN1)
    (tmp_path / "notes.hmd").write_text("# Notes\n", encoding="utf-8")
    diagnostics = check(workspace(tmp_path))
    # Not a card, so it shadows nothing and is shadowed by nothing: no HMD018.
    assert [d.rule for d in diagnostics] == ["HMD019"]


def test_an_undecodable_file_is_left_out_of_the_graph(tmp_path):
    (tmp_path / "bad.hmd").write_bytes(LATIN1)
    (tmp_path / "good.hmd").write_text("# Good\n", encoding="utf-8")
    assert [node["path"] for node in graph.build(workspace(tmp_path))["nodes"]] == ["good.hmd"]


def test_lint_takes_an_undecodable_file_by_path(tmp_path, monkeypatch):
    (tmp_path / ".hmd").mkdir()
    (tmp_path / ".hmd" / "config.toml").write_text('location_path = "."\n', encoding="utf-8")
    (tmp_path / "bad.hmd").write_bytes(LATIN1)
    monkeypatch.chdir(tmp_path)

    result = runner.invoke(app, ["lint", "bad.hmd"])

    assert result.exit_code == 1
    assert "bad.hmd:1:1: error[HMD019]" in result.stdout


# -- the byte-order mark -------------------------------------------------


def test_a_bom_before_frontmatter_is_ignored(tmp_path):
    (tmp_path / "card.hmd").write_bytes(
        b"\xef\xbb\xbf---\ntags: [area/x]\n---\n# Title\n\n[[card#Title]]\n"
    )
    ws = workspace(tmp_path)
    document = ws.documents[tmp_path / "card.hmd"]
    assert document.card.tags == ("area/x",)
    assert not document.text.startswith("﻿")
    (link,) = document.links
    # Byte 0 is the byte after the BOM.
    assert document.text.encode("utf-8")[link.span.start : link.span.end] == b"[[card#Title]]"
    assert check(ws) == []


def test_only_one_bom_is_ignored(tmp_path):
    (tmp_path / "card.hmd").write_bytes(b"\xef\xbb\xbf\xef\xbb\xbf---\ntags: [x]\n---\n")
    document = workspace(tmp_path).documents[tmp_path / "card.hmd"]
    # The second mark is content, so the fence no longer starts at byte 0.
    assert document.text.startswith("﻿")
    assert document.frontmatter == {}


# -- line endings --------------------------------------------------------


def test_a_crlf_card_is_read_as_written(tmp_path):
    """Read as bytes: a text-mode read would turn `\\r\\n` into `\\n`."""
    (tmp_path / "card.hmd").write_bytes(b"---\r\ntags: [x]\r\n---\r\n# T ^top\r\n\r\n[[nope]]\r\n")
    ws = workspace(tmp_path)
    document = ws.documents[tmp_path / "card.hmd"]
    assert "\r\n" in document.text
    assert document.card.tags == ("x",)
    assert [a.block_id for a in document.anchors] == ["top"]
    (diagnostic,) = check(ws)
    assert (diagnostic.rule, diagnostic.line, diagnostic.column) == ("HMD001", 6, 1)


def test_a_lone_cr_ends_a_line(tmp_path):
    (tmp_path / "card.hmd").write_bytes(b"# T\r\r[[nope]]\r")
    (diagnostic,) = check(workspace(tmp_path))
    assert (diagnostic.line, diagnostic.column) == (3, 1)


# -- NFC names -----------------------------------------------------------


def test_a_reference_and_a_name_on_disk_compare_in_nfc(tmp_path):
    decomposed = unicodedata.normalize("NFD", "café")
    composed = unicodedata.normalize("NFC", "café")
    (tmp_path / f"{decomposed}.hmd").write_text("# Café\n", encoding="utf-8")
    (tmp_path / "a.hmd").write_text(
        f"# A\n\n[[{composed}]] [[{decomposed}]] [[/{composed}]] [[./{composed}]]\n",
        encoding="utf-8",
    )
    ws = workspace(tmp_path)
    document = ws.documents[tmp_path / "a.hmd"]
    targets = {ws.resolve(document.path, link.page_ref).path for link in document.links}
    assert len(targets) == 1 and None not in targets
    assert check(ws) == []


def test_an_import_origin_compares_in_nfc(tmp_path):
    decomposed = unicodedata.normalize("NFD", "études")
    composed = unicodedata.normalize("NFC", "études")
    (tmp_path / decomposed).mkdir()
    (tmp_path / decomposed / "note.hmd").write_text("# Note\n", encoding="utf-8")
    (tmp_path / "a").mkdir()
    (tmp_path / "a" / "x.hmd").write_text(
        f"---\nuse: [no_autodiscovery]\nimport:\n  - from /{composed} import *\n---\n\n[[note]]\n",
        encoding="utf-8",
    )
    assert check(workspace(tmp_path)) == []


def test_a_code_span_does_not_cross_a_blank_line_in_a_crlf_card():
    from hypermarkdown.scan import mask

    for ending in ("\n", "\r\n", "\r"):
        text = f"`[[a]]{ending}{ending}[[b]]`"
        assert "[[a]]" in mask(text) and "[[b]]" in mask(text), repr(ending)


def test_an_import_alias_is_compared_after_nfc(build_workspace):
    decomposed, composed = "cafe\u0301", "caf\u00e9"
    ws = build_workspace(
        {
            "a.hmd": f"---\nimport:\n  - from /lib import menu as {decomposed}\n---\n\n[[{composed}]]\n",
            "lib/menu.hmd": "# Menu\n",
        }
    )
    result = ws.resolve(ws.root / "a.hmd", composed)
    assert result.path == ws.root / "lib" / "menu.hmd"
