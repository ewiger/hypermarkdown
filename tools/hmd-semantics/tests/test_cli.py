"""The command: what `verify` and `inspect` say, with no model loaded."""

import shutil
from pathlib import Path

from hypermarkdown_semantics import cli

BIRDS = Path(__file__).resolve().parent / "fixtures" / "birds"


def test_verify_finds_the_committed_index_clean(capsys):
    assert cli.main(["verify", "--vault", str(BIRDS)]) == 0
    assert "clean" in capsys.readouterr().out


def test_verify_reports_a_card_edited_since_the_build(tmp_path, capsys):
    vault = tmp_path / "birds"
    shutil.copytree(BIRDS, vault)
    card = vault / "barn-owl.hmd"
    card.write_text(card.read_text(encoding="utf-8") + "\nAn edit.\n", encoding="utf-8")
    assert cli.main(["verify", "--vault", str(vault)]) == 1
    assert "barn-owl: stale" in capsys.readouterr().err


def test_verify_reports_a_card_the_index_does_not_hold(tmp_path, capsys):
    vault = tmp_path / "birds"
    shutil.copytree(BIRDS, vault)
    (vault / "new-card.hmd").write_text("# New card\n", encoding="utf-8")
    assert cli.main(["verify", "--vault", str(vault)]) == 1
    assert "new-card: absent from the index" in capsys.readouterr().err


def test_inspect_prints_what_the_index_says_about_itself(capsys):
    assert cli.main(["inspect", "--index", str(BIRDS / ".hmd" / "index.sqlite")]) == 0
    said = capsys.readouterr().out
    assert "schema        1" in said
    assert "sentence-transformers/all-MiniLM-L6-v2" in said


def test_a_configuration_the_tool_refuses_is_a_message_and_exit_1(tmp_path, capsys):
    (tmp_path / ".hmd").mkdir()
    (tmp_path / ".hmd" / "config.toml").write_text(
        'wiki = "."\n\n[semantics.embedder]\napi_key = "sk-secret"\n', encoding="utf-8"
    )
    (tmp_path / "a.hmd").write_text("# A\n", encoding="utf-8")
    assert cli.main(["build", "--vault", str(tmp_path)]) == 1
    said = capsys.readouterr().err
    assert "api_key_env" in said
    assert "sk-secret" not in said
