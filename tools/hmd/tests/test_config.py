"""Tables of `.hmd/config.toml` that `hmd` does not read (HMD-0028).

`[hql]` selects an HQL project and `[semantics]` names the vault's semantic
index and the models that fill it. Neither steers resolution, so a vault that
carries them loads and lints exactly as one that does not.
"""

from __future__ import annotations

from pathlib import Path

from typer.testing import CliRunner

from hypermarkdown import config
from hypermarkdown.cli import app

CONFIG = """\
wiki = "."

[hql]
project = ".."

[semantics]
index = ".hmd/index.sqlite"

[semantics.embedder]
provider    = "http"
model       = "text-embedding-3-small"
revision    = "2024-01-25"
endpoint    = "https://api.openai.com/v1/embeddings"
api_key_env = "OPENAI_API_KEY"
dimensions  = 1536

[semantics.summarizer]
provider = "http"
model    = "gpt-4.1-mini"
revision = "2025-04-14"
endpoint = "https://api.openai.com/v1/chat/completions"
"""


def _vault(root: Path, text: str = CONFIG) -> Path:
    (root / ".hmd").mkdir()
    (root / ".hmd" / "config.toml").write_text(text, encoding="utf-8")
    (root / "here.hmd").write_text("# Here\n\nSee [[there]].\n", encoding="utf-8")
    (root / "there.hmd").write_text("# There\n", encoding="utf-8")
    return root


def test_a_config_holding_the_hql_and_semantics_tables_loads(tmp_path):
    vault = _vault(tmp_path)
    loaded = config.load(start=vault)
    assert loaded.root == vault.resolve()
    assert loaded.source == (vault / ".hmd" / "config.toml").resolve()
    assert (loaded.autodiscovery, loaded.mode) == (True, "both")


def test_a_vault_holding_the_two_tables_lints_clean(tmp_path):
    vault = _vault(tmp_path)
    result = CliRunner().invoke(app, ["lint", "--root", str(vault), "--strict"])
    assert result.exit_code == 0, result.output


def test_a_value_only_hql_can_judge_is_not_refused(tmp_path):
    # Whether `project` is a string, and whether it names an HQL project, is
    # HQL's to refuse. `hmd` reads neither.
    vault = _vault(tmp_path, 'wiki = "."\n\n[hql]\nproject = 7\n\n[semantics]\nindex = 7\n')
    assert config.load(start=vault).root == vault.resolve()
    result = CliRunner().invoke(app, ["lint", "--root", str(vault), "--strict"])
    assert result.exit_code == 0, result.output


def test_linting_leaves_the_file_as_it_was(tmp_path):
    vault = _vault(tmp_path)
    CliRunner().invoke(app, ["lint", "--root", str(vault)])
    assert (vault / ".hmd" / "config.toml").read_text(encoding="utf-8") == CONFIG
