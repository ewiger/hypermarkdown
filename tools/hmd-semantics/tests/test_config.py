"""Which embedder a vault declares, and what it refuses to declare.

Parsing only: nothing here loads a model or opens a socket.
"""

from pathlib import Path

import pytest

from hypermarkdown_semantics import config

BIRDS = Path(__file__).resolve().parent / "fixtures" / "birds"

REMOTE = """
[semantics]
index = ".hmd/index.sqlite"

[semantics.embedder]
provider    = "http"
model       = "text-embedding-3-small"
revision    = "2024-01-25"
endpoint    = "https://api.openai.com/v1/embeddings"
api_key_env = "OPENAI_API_KEY"
dimensions  = 1536
"""


def vault(tmp_path, text=None):
    if text is not None:
        path = tmp_path / config.CONFIG_FILE
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    return tmp_path


def test_a_vault_with_no_config_file_is_local(tmp_path):
    # A vault is usable before it is configured.
    assert config.read(vault(tmp_path)) == config.Embedder()
    assert config.read(vault(tmp_path)).provider == config.LOCAL


def test_a_vault_that_names_only_its_index_is_local(tmp_path):
    # What every existing vault looks like, the committed fixture included.
    declared = config.read(vault(tmp_path, '[semantics]\nindex = ".hmd/index.sqlite"\n'))
    assert declared == config.Embedder()


def test_the_index_defaults_to_the_vaults_hmd_directory(tmp_path):
    assert config.index(vault(tmp_path)) == tmp_path / ".hmd" / "index.sqlite"
    assert config.index(vault(tmp_path, "[semantics.embedder]\n")) == (
        tmp_path / ".hmd" / "index.sqlite"
    )


def test_the_declared_index_is_read_against_the_vault_root(tmp_path):
    declared = vault(tmp_path, '[semantics]\nindex = ".hmd/cards.sqlite"\n')
    assert config.index(declared) == tmp_path / ".hmd" / "cards.sqlite"


@pytest.mark.parametrize("path", ["/tmp/index.sqlite", "../index.sqlite", "", 7])
def test_an_index_outside_the_vault_is_refused(tmp_path, path):
    value = path if isinstance(path, int) else f'"{path}"'
    with pytest.raises(config.ConfigError, match="index"):
        config.index(vault(tmp_path, f"[semantics]\nindex = {value}\n"))


def test_hql_configuration_is_not_read(tmp_path):
    # `[semantics]` is HyperMarkdown's: a table in an HQL file selects nothing.
    (tmp_path / ".hql").mkdir()
    (tmp_path / ".hql" / "config.toml").write_text(
        '[semantics]\nindex = "elsewhere.sqlite"\n[semantics.embedder]\nprovider = "http"\n',
        encoding="utf-8",
    )
    assert config.index(tmp_path) == tmp_path / ".hmd" / "index.sqlite"
    assert config.read(tmp_path) == config.Embedder()


def test_the_committed_birds_vault_names_its_index():
    assert config.index(BIRDS) == BIRDS / ".hmd" / "index.sqlite"
    assert config.index(BIRDS).is_file()


def test_the_committed_birds_vault_stays_local():
    assert config.read(BIRDS).provider == config.LOCAL


def test_every_field_is_read(tmp_path):
    declared = config.read(vault(tmp_path, REMOTE))
    assert declared == config.Embedder(
        provider="http",
        model="text-embedding-3-small",
        revision="2024-01-25",
        endpoint="https://api.openai.com/v1/embeddings",
        api_key_env="OPENAI_API_KEY",
        dimensions=1536,
    )
    assert declared.remote


def test_a_key_written_into_the_committed_file_is_refused_and_told_where_it_goes(tmp_path):
    text = '[semantics.embedder]\nprovider = "http"\napi_key = "sk-secret"\n'
    with pytest.raises(config.ConfigError) as raised:
        config.read(vault(tmp_path, text))
    said = str(raised.value)
    assert "api_key_env" in said, "a refusal must say where the key goes"
    assert "sk-secret" not in said, "a refusal must not echo the key"


def test_an_unknown_key_is_refused_by_name(tmp_path):
    # A typo that silently selects a default is how a vault comes to be indexed
    # by a model nobody chose.
    text = '[semantics.embedder]\nprovidor = "http"\n'
    with pytest.raises(config.ConfigError, match="`providor`"):
        config.read(vault(tmp_path, text))


def test_an_unknown_provider_is_refused_by_name(tmp_path):
    text = '[semantics.embedder]\nprovider = "anthropic"\n'
    with pytest.raises(config.ConfigError, match="anthropic"):
        config.resolve(config.read(vault(tmp_path, text)))


@pytest.mark.parametrize(
    "text",
    [
        '[semantics.embedder]\nprovider = ""\n',
        '[semantics.embedder]\nmodel = "  "\n',
        "[semantics.embedder]\nmodel = 7\n",
        "[semantics.embedder]\ndimensions = 0\n",
        "[semantics.embedder]\ndimensions = -1\n",
        "[semantics.embedder]\ndimensions = true\n",
        '[semantics.embedder]\ndimensions = "1536"\n',
    ],
)
def test_a_field_of_the_wrong_shape_is_refused(tmp_path, text):
    with pytest.raises(config.ConfigError):
        config.read(vault(tmp_path, text))


def test_unreadable_toml_is_refused_rather_than_defaulted(tmp_path):
    # An absent file means the default; a broken one is a different thing.
    with pytest.raises(config.ConfigError, match="TOML"):
        config.read(vault(tmp_path, "[semantics.embedder\n"))


def test_http_needs_an_endpoint_and_a_model():
    with pytest.raises(config.ConfigError, match="`endpoint`"):
        config.check(config.Embedder(provider="http", model="m", revision="r"))
    with pytest.raises(config.ConfigError, match="`model`"):
        config.check(config.Embedder(provider="http", endpoint="http://x", revision="r"))


def test_http_needs_a_pinned_revision():
    # `Retrieval.revision` claims to pin the numbers a score is, and an endpoint
    # offers nothing to derive it from, so it is stated or refused.
    with pytest.raises(config.ConfigError, match="revision"):
        config.check(
            config.Embedder(provider="http", model="m", endpoint="http://x/v1/embeddings")
        )


def test_local_needs_neither_model_nor_revision():
    # `embed` supplies the pinned checkpoint it defaults to.
    assert config.check(config.Embedder()) == config.Embedder()


def test_a_flag_overrides_one_field_and_leaves_the_rest(tmp_path):
    declared = config.read(vault(tmp_path, REMOTE))
    resolved = config.resolve(declared, model="text-embedding-3-large", dimensions=3072)
    assert resolved.model == "text-embedding-3-large"
    assert resolved.dimensions == 3072
    assert resolved.endpoint == declared.endpoint
    assert resolved.api_key_env == declared.api_key_env
    assert resolved.revision == declared.revision


def test_a_flag_left_unset_overrides_nothing(tmp_path):
    declared = config.read(vault(tmp_path, REMOTE))
    assert config.resolve(declared, **dict.fromkeys(config.FIELDS)) == declared


def test_a_flag_can_switch_a_declared_remote_vault_to_local(tmp_path):
    declared = config.read(vault(tmp_path, REMOTE))
    resolved = config.resolve(declared, provider="local")
    assert not resolved.remote


def test_the_cards_start_where_location_path_says(tmp_path):
    (tmp_path / ".hmd").mkdir()
    assert config.namespace_root(tmp_path) == tmp_path / "."
    (tmp_path / ".hmd" / "config.toml").write_text('location_path = "doc/wiki"\n', encoding="utf-8")
    assert config.namespace_root(tmp_path) == tmp_path / "doc" / "wiki"


@pytest.mark.parametrize("text", ['wiki = "doc/wiki"\n', 'location_path = "."\nwiki = "."\n'])
def test_a_vault_that_sets_wiki_is_refused(tmp_path, text):
    (tmp_path / ".hmd").mkdir()
    (tmp_path / ".hmd" / "config.toml").write_text(text, encoding="utf-8")
    for setting in (config.namespace_root, config.index, config.read):
        with pytest.raises(config.ConfigError) as refused:
            setting(tmp_path)
        assert "`wiki`" in str(refused.value) and "`location_path`" in str(refused.value)


def test_a_vault_that_sets_wiki_is_not_built(tmp_path, capsys):
    from hypermarkdown_semantics import cli

    (tmp_path / ".hmd").mkdir()
    (tmp_path / ".hmd" / "config.toml").write_text('wiki = "."\n', encoding="utf-8")
    (tmp_path / "a.hmd").write_text("# A\n", encoding="utf-8")
    assert cli.main(["build", "--vault", str(tmp_path)]) == 1
    said = capsys.readouterr().err
    assert "`wiki`" in said and "`location_path`" in said
    assert not (tmp_path / ".hmd" / "index.sqlite").exists()


def test_a_nested_vault_and_files_outside_the_namespace_are_not_cards(tmp_path):
    from hypermarkdown_semantics import vault

    (tmp_path / ".hmd").mkdir()
    (tmp_path / ".hmd" / "config.toml").write_text(
        'location_path = "doc/wiki"\n', encoding="utf-8"
    )
    (tmp_path / "README.md").write_text("# Readme\n", encoding="utf-8")
    wiki = tmp_path / "doc" / "wiki"
    (wiki / "inner" / ".hmd").mkdir(parents=True)
    (wiki / "owl.hmd").write_text("# Owl\n", encoding="utf-8")
    (wiki / "notes.md").write_text("# Notes\n", encoding="utf-8")
    (wiki / "inner" / "heron.hmd").write_text("# Heron\n", encoding="utf-8")

    names = sorted(d.name for d in vault.load(config.namespace_root(tmp_path)))
    assert names == ["notes", "owl"]
