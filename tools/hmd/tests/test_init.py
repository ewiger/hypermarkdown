"""`hmd init` — the one command that writes rather than reads.

Two claims carry the weight here. The file it writes must load back through
`config.load()` with the values it names, or `init` has produced a project the
rest of the tool disagrees with; and it must refuse to replace a config it did
not write, because overwriting one discards settings somebody chose.
"""

from __future__ import annotations

import tomllib

import pytest
from typer.testing import CliRunner

from hypermarkdown import config
from hypermarkdown.cli import app

runner = CliRunner()


def test_init_writes_the_marker_and_the_root_it_names(tmp_path):
    result = config.init(tmp_path)

    assert result.config == tmp_path / ".hmd" / "config.toml"
    assert result.config.is_file()
    assert result.wiki == tmp_path / "doc" / "wiki"
    assert result.wiki.is_dir(), "the wiki root is created too; load() rejects one that is missing"


def test_the_written_config_parses_to_the_documented_defaults(tmp_path):
    written = tomllib.loads(config.init(tmp_path).config.read_text(encoding="utf-8"))

    assert written == {
        "wiki": "doc/wiki",
        "namespace": {"name": tmp_path.name, "provider": "folder"},
        "discovery": {"autodiscovery": True, "mode": "both"},
    }


def test_a_fresh_project_loads_without_arguments(tmp_path):
    """The point of the command: `hmd init` then any other command, no `--root`."""
    config.init(tmp_path)

    loaded = config.load(start=tmp_path)

    assert loaded.root == (tmp_path / "doc" / "wiki").resolve()
    assert loaded.source == (tmp_path / ".hmd" / "config.toml").resolve()
    assert loaded.autodiscovery is True
    assert loaded.mode == "both"


def test_a_custom_wiki_round_trips(tmp_path):
    result = config.init(tmp_path, wiki="notes")

    assert result.wiki == tmp_path / "notes"
    assert config.load(start=tmp_path).root == (tmp_path / "notes").resolve()


def test_the_project_root_itself_can_be_the_wiki(tmp_path):
    """`wiki = "."` is what `examples/small` uses to be self-contained."""
    config.init(tmp_path, wiki=".")

    assert config.load(start=tmp_path).root == tmp_path.resolve()


# --- the namespace name and its provider -------------------------------------


def test_the_namespace_name_defaults_to_the_project_directory(tmp_path):
    project = tmp_path / "my-wiki"

    result = config.init(project)

    assert result.name == "my-wiki"
    assert result.derived_name is True
    assert result.provider == "folder"


def test_a_bare_init_names_the_namespace_after_the_working_directory(tmp_path, monkeypatch):
    """`hmd init` alone: project is `.`, and the namespace is what `.` is called."""
    project = tmp_path / "field-notes"
    project.mkdir()
    monkeypatch.chdir(project)

    result = config.init()

    assert result.project == project.resolve()
    assert result.name == "field-notes"


@pytest.mark.parametrize(
    ("directory", "expected"),
    [
        ("My Notes", "My-Notes"),
        ("notes (2026)", "notes-2026"),
        ("--edges--", "edges"),
        ("a.b_c-d", "a.b_c-d"),
        ("café", "caf"),
    ],
)
def test_a_derived_name_is_repaired_into_the_address_form(tmp_path, directory, expected):
    """A folder name is not a request, so deriving repairs rather than refuses."""
    assert config.init(tmp_path / directory).name == expected


def test_a_directory_name_with_nothing_usable_asks_for_one(tmp_path):
    with pytest.raises(config.ConfigError, match="cannot derive a namespace name"):
        config.init(tmp_path / "!!!")


def test_an_explicit_name_is_used_verbatim(tmp_path):
    result = config.init(tmp_path, name="shared")

    assert result.name == "shared"
    assert result.derived_name is False
    assert tomllib.loads(result.config.read_text(encoding="utf-8"))["namespace"]["name"] == "shared"


@pytest.mark.parametrize("name", ["", "  ", "-leading", ".dotted", "has space", "has:colon", "a/b", "x[y]"])
def test_an_explicit_name_is_refused_rather_than_repaired(tmp_path, name):
    """`--name` is a request. Silently answering a different one is worse than an error."""
    with pytest.raises(config.ConfigError, match="namespace name must start with"):
        config.init(tmp_path, name=name)

    assert not (tmp_path / ".hmd").exists()


def test_an_unknown_provider_is_refused(tmp_path):
    with pytest.raises(config.ConfigError, match="provider must be one of"):
        config.init(tmp_path, provider="url")

    assert not (tmp_path / ".hmd").exists()


def test_load_still_ignores_everything_but_the_two_settings_it_reads(tmp_path):
    """The spec pins this: the MVP reads `wiki` and `[discovery]`, and nothing else.

    `init` writes `[namespace]` because binding needs somewhere to land, but no
    key of it may reach resolution before HMD-0004 says what it means.
    """
    config.init(tmp_path, name="shared")

    loaded = config.load(start=tmp_path)

    assert not hasattr(loaded, "name")
    assert not hasattr(loaded, "provider")
    assert (loaded.root, loaded.autodiscovery, loaded.mode) == (
        (tmp_path / "doc" / "wiki").resolve(),
        True,
        "both",
    )


def test_a_config_with_no_namespace_section_still_loads(tmp_path):
    """Every tree written before `init` existed has no `[namespace]`, and must not break."""
    (tmp_path / ".hmd").mkdir()
    (tmp_path / ".hmd" / "config.toml").write_text('wiki = "w"\n', encoding="utf-8")
    (tmp_path / "w").mkdir()

    assert config.load(start=tmp_path).root == (tmp_path / "w").resolve()


def test_a_missing_project_directory_is_created(tmp_path):
    target = tmp_path / "new" / "project"

    result = config.init(target)

    assert target.is_dir()
    assert target.resolve() in result.created


def test_created_names_only_what_was_absent(tmp_path):
    (tmp_path / "doc" / "wiki").mkdir(parents=True)

    result = config.init(tmp_path)

    assert result.created == frozenset({result.config})


def test_reinitialising_is_refused(tmp_path):
    config.init(tmp_path)

    with pytest.raises(config.ConfigError, match="already initialised"):
        config.init(tmp_path)


def test_force_replaces_an_existing_config(tmp_path):
    config.init(tmp_path, wiki="notes")

    result = config.init(tmp_path, wiki="doc/wiki", force=True)

    assert result.overwritten is True
    assert config.load(start=tmp_path).root == (tmp_path / "doc" / "wiki").resolve()


def test_a_marker_directory_without_a_config_is_not_reinitialisation(tmp_path):
    """`.hmd/` may hold other things; only the config file is the claim."""
    (tmp_path / ".hmd").mkdir()

    result = config.init(tmp_path)

    assert result.overwritten is False
    assert result.config.is_file()


@pytest.mark.parametrize(
    "wiki",
    ["/etc", "../outside", "doc/../../outside", "", "   ", 'doc/"wiki"'],
)
def test_an_unusable_wiki_setting_is_refused(tmp_path, wiki):
    with pytest.raises(config.ConfigError):
        config.init(tmp_path, wiki=wiki)

    assert not (tmp_path / ".hmd").exists(), "a rejected setting must not leave a half-written project"


def test_a_file_where_the_wiki_root_should_be_is_refused_before_anything_is_written(tmp_path):
    (tmp_path / "notes").write_text("", encoding="utf-8")

    with pytest.raises(config.ConfigError, match="not a directory"):
        config.init(tmp_path, wiki="notes")

    assert not (tmp_path / ".hmd").exists(), "a config naming a root that cannot exist must not be written"


def test_a_file_where_the_marker_should_be_is_refused(tmp_path):
    (tmp_path / ".hmd").write_text("", encoding="utf-8")

    with pytest.raises(config.ConfigError, match="not a directory"):
        config.init(tmp_path)


def test_a_file_where_the_project_should_be_is_refused(tmp_path):
    target = tmp_path / "afile"
    target.write_text("", encoding="utf-8")

    with pytest.raises(config.ConfigError, match="not a directory"):
        config.init(target)


def test_a_nested_project_is_reported_rather_than_refused(tmp_path):
    config.init(tmp_path)
    inner = tmp_path / "doc" / "wiki" / "inner"

    result = config.init(inner)

    assert result.enclosing == tmp_path.resolve()


def test_an_unnested_project_reports_no_enclosing_root(tmp_path):
    assert config.init(tmp_path).enclosing is None


# --- the CLI layer: exit codes and the paths it prints ------------------------


def test_cli_init_succeeds_and_names_what_it_made(tmp_path):
    result = runner.invoke(app, ["init", str(tmp_path)])

    assert result.exit_code == 0
    assert str((tmp_path / ".hmd" / "config.toml").resolve()) in result.stdout
    assert "(created)" in result.stdout


def test_cli_init_defaults_to_the_working_directory(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)

    assert runner.invoke(app, ["init"]).exit_code == 0
    assert (tmp_path / ".hmd" / "config.toml").is_file()


def test_cli_init_reports_the_namespace_it_chose(tmp_path):
    project = tmp_path / "field-notes"

    result = runner.invoke(app, ["init", str(project)])

    assert result.exit_code == 0
    assert "namespace: field-notes (folder)" in result.stdout
    assert "from the directory name" in result.stdout


def test_cli_init_takes_an_explicit_name(tmp_path):
    result = runner.invoke(app, ["init", str(tmp_path), "--name", "shared"])

    assert result.exit_code == 0
    assert "namespace: shared (folder)" in result.stdout
    assert "from the directory name" not in result.stdout


def test_cli_init_rejects_an_unusable_name_with_a_usage_exit(tmp_path):
    result = runner.invoke(app, ["init", str(tmp_path), "--name", "has space"])

    assert result.exit_code == 2
    assert not (tmp_path / ".hmd").exists()


def test_cli_init_refuses_a_second_run_with_a_usage_exit(tmp_path):
    runner.invoke(app, ["init", str(tmp_path)])

    result = runner.invoke(app, ["init", str(tmp_path)])

    assert result.exit_code == 2
    assert "--force" in result.output


def test_cli_init_then_lint_is_clean(tmp_path):
    """The sequence a new author runs. An empty namespace has nothing to report."""
    runner.invoke(app, ["init", str(tmp_path)])
    (tmp_path / "doc" / "wiki" / "index.hmd").write_text("# Home\n", encoding="utf-8")

    result = runner.invoke(app, ["lint", "--root", str(tmp_path / "doc" / "wiki")])

    assert result.exit_code == 0
