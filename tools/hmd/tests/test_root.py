"""Only `.hmd/` marks a project root."""

from __future__ import annotations

import pytest
from typer.testing import CliRunner

from hypermarkdown import config
from hypermarkdown.cli import app

runner = CliRunner()


def test_the_nearest_marker_is_the_project_root(tmp_path):
    (tmp_path / ".hmd").mkdir()
    (tmp_path / "a" / "b").mkdir(parents=True)
    assert config.find_project_root(tmp_path / "a" / "b") == tmp_path.resolve()


def test_a_git_directory_does_not_mark_a_project_root(tmp_path):
    (tmp_path / ".git").mkdir()
    (tmp_path / "doc" / "wiki").mkdir(parents=True)
    assert config.find_project_root(tmp_path / "doc") is None
    with pytest.raises(config.ConfigError, match=r"vault not found: no \.hmd/ directory"):
        config.load(start=tmp_path / "doc")


def test_a_marker_below_a_git_directory_still_wins(tmp_path):
    (tmp_path / ".git").mkdir()
    (tmp_path / "vault" / ".hmd").mkdir(parents=True)
    (tmp_path / "vault" / "doc").mkdir(parents=True)
    loaded = config.load(start=tmp_path / "vault" / "doc")
    # With no `location_path`, the namespace root is the vault itself.
    assert loaded.root == (tmp_path / "vault").resolve()


def test_a_named_root_needs_no_marker_at_all(tmp_path):
    (tmp_path / ".git").mkdir()
    assert config.load(root_override=tmp_path).root == tmp_path.resolve()


def test_the_cli_refuses_a_tree_with_only_a_git_directory(tmp_path, monkeypatch):
    (tmp_path / ".git").mkdir()
    (tmp_path / "doc" / "wiki").mkdir(parents=True)
    monkeypatch.chdir(tmp_path)

    result = runner.invoke(app, ["lint"])

    assert result.exit_code == 2
    assert "vault not found" in result.stderr
    assert "Run `hmd init` to initialize a vault" in result.stderr


def test_the_written_config_does_not_promise_a_git_fallback():
    assert ".git" not in config.CONFIG_TEMPLATE
