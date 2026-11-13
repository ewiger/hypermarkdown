"""A directory carrying its own `.hmd/` is another vault (issue 0009).

Discovery already stops at the nearest marker; these pin that loading does too,
so a card belongs to exactly one vault whichever root a tool is handed.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from typer.testing import CliRunner

from hypermarkdown import config
from hypermarkdown.cli import app
from hypermarkdown.resolve import Outcome, Workspace

PUBLIC = "---\nnav:\n  visibility: public\n---\n\n"

TREE = {
    "here.hmd": PUBLIC + "# Here\n\nSee [[time]].\n",
    "wiki/time.hmd": PUBLIC + "# Time\n",
    "inner/.hmd/config.toml": 'wiki = "."\n',
    "inner/time.hmd": PUBLIC + "# Inner time\n",
    "inner/abs.hmd": PUBLIC + "# Abs\n\nSee [[/time]].\n",
}


def _write(root: Path, files: dict[str, str]) -> Path:
    for rel, text in files.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    return root


@pytest.fixture
def tree(tmp_path) -> Path:
    return _write(tmp_path, TREE)


def _workspace(root: Path) -> Workspace:
    return Workspace(config.load(root_override=root))


def test_outer_vault_does_not_load_the_nested_one(tree):
    ws = _workspace(tree)
    assert sorted(ws.rel(p) for p in ws.pages()) == ["here.hmd", "wiki/time.hmd"]


def test_bare_name_in_both_vaults_is_not_ambiguous(tree):
    ws = _workspace(tree)
    result = ws.resolve(tree / "here.hmd", "time")
    assert result.outcome is Outcome.RESOLVED
    assert ws.rel(result.path) == "wiki/time.hmd"


def test_nested_vault_still_resolves_against_its_own_root(tree):
    ws = _workspace(tree / "inner")
    assert sorted(ws.rel(p) for p in ws.pages()) == ["abs.hmd", "time.hmd"]
    result = ws.resolve(tree / "inner" / "abs.hmd", "/time")
    assert result.outcome is Outcome.RESOLVED
    assert ws.rel(result.path) == "time.hmd"


def test_import_cannot_reach_into_a_nested_vault(tmp_path):
    root = _write(
        tmp_path,
        {
            "a.hmd": "---\nimport:\n  - from /inner import time\n---\n\n# A\n",
            "inner/.hmd/config.toml": 'wiki = "."\n',
            "inner/time.hmd": "# Inner time\n",
        },
    )
    table = _workspace(root).import_table(root / "a.hmd")
    assert table.bindings == {}
    assert [rule for rule, _ in table.problems] == ["HMD015"]


def test_a_file_named_like_the_marker_is_not_a_vault(tmp_path):
    root = _write(tmp_path, {"sub/.hmd": "not a directory\n", "sub/card.hmd": "# Card\n"})
    assert [_workspace(root).rel(p) for p in _workspace(root).pages()] == ["sub/card.hmd"]


def _lint(root: Path) -> list[dict]:
    result = CliRunner().invoke(app, ["lint", "--root", str(root), "--format", "json"])
    return json.loads(result.output)["diagnostics"]


def test_lint_from_outer_root_reports_nothing_from_the_nested_vault(tree):
    assert _lint(tree) == []


def test_lint_with_root_set_to_the_nested_vault_sees_its_cards(tree):
    (tree / "inner" / "broken.hmd").write_text("# Broken\n\nSee [[nowhere]].\n")
    diagnostics = _lint(tree / "inner")
    assert [d["rule"] for d in diagnostics] == ["HMD001"]


def test_mkdocs_plugin_registers_no_page_from_a_nested_vault(tree, tmp_path_factory):
    pytest.importorskip("mkdocs")
    from mkdocs.config import load_config
    from mkdocs.structure.files import Files

    project = tmp_path_factory.mktemp("project")
    (project / "mkdocs.yml").write_text(
        "site_name: t\n"
        f"docs_dir: {tree}\n"
        f"site_dir: {project / 'site'}\n"
        "plugins:\n"
        "  - hypermarkdown:\n"
        "      build_nav: false\n",
        encoding="utf-8",
    )
    cfg = load_config(str(project / "mkdocs.yml"))
    # Run through the collection, as a build does, so `File.generated` knows
    # which plugin is calling it.
    files = cfg.plugins.on_files(Files([]), config=cfg)

    plugin = cfg.plugins["hypermarkdown"]
    assert sorted(plugin.sources) == ["here.md", "wiki/time.md"]
    assert not any(f.src_uri.startswith("inner/") for f in files)
