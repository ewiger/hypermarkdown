"""Which embedder fills an index, as a vault declares it.

A vault's `.hmd/config.toml` owns its index, and an embedder is how an index
comes to exist, so `[semantics]` names the index path and `[semantics.embedder]`
the model that fills it, rather than a third file or flags a contributor has to
remember. The table is HyperMarkdown's: no HQL configuration file takes it.
Only this producer reads `[semantics.embedder]`: a reader has no model to
configure, and reads what produced a score out of the index rather than out of
configuration.

Nothing here reaches a network or loads a model. It parses, merges and refuses.
"""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, replace
from pathlib import Path

CONFIG_FILE = ".hmd/config.toml"
"""The vault's configuration file, relative to the vault root. A reader of the
index reads `[semantics] index` from the same file."""

DEFAULT_INDEX = ".hmd/index.sqlite"
"""Where a vault's index is when `[semantics] index` does not say."""

LOCAL = "local"
HTTP = "http"
PROVIDERS = (LOCAL, HTTP)

FIELDS = ("provider", "model", "revision", "endpoint", "api_key_env", "dimensions")
"""Every key `[semantics.embedder]` accepts. An unknown one is refused rather
than ignored: a typo that silently selects a default is how a vault comes to be
indexed by a model nobody chose."""


class ConfigError(Exception):
    """A vault's embedder cannot be used as declared."""


@dataclass(frozen=True)
class Embedder:
    """A declared embedder, before any default the provider itself owns.

    `model` and `revision` stay `None` for `local`, where `embed` supplies the
    pinned checkpoint it defaults to. They are required for `http`, which has
    nothing to default to.
    """

    provider: str = LOCAL
    model: str | None = None
    revision: str | None = None
    endpoint: str | None = None
    api_key_env: str | None = None
    dimensions: int | None = None

    @property
    def remote(self) -> bool:
        return self.provider == HTTP


def read(root: Path) -> Embedder:
    """`[semantics.embedder]` from a vault, or the `local` default without one.

    A vault is usable before it is configured, so an absent file and an absent
    table both mean the default. A file that does not parse is a different thing
    and is refused.
    """
    path = Path(root) / CONFIG_FILE
    table = _semantics(path).get("embedder")
    if table is None:
        return Embedder()
    if not isinstance(table, dict):
        raise ConfigError(f"{path}: [semantics.embedder] is not a table")
    return _from_table(table, path)


def index(root: Path) -> Path:
    """The vault's index: `[semantics] index` against the vault root, or
    `.hmd/index.sqlite` where the vault does not say.

    The path stays inside the vault, as a reader requires: an index
    belongs to the one vault whose cards it was built from.
    """
    root = Path(root)
    path = root / CONFIG_FILE
    declared = _semantics(path).get("index", DEFAULT_INDEX)
    if not isinstance(declared, str) or not declared.strip():
        raise ConfigError(f"{path}: [semantics] `index` must be a non-empty string")
    relative = Path(declared.strip())
    if relative.is_absolute() or ".." in relative.parts:
        raise ConfigError(
            f"{path}: [semantics] `index` must be a path inside the vault, "
            f"not `{declared}`"
        )
    return root / relative


def _semantics(path: Path) -> dict:
    """The `[semantics]` table of a vault's configuration, empty where the
    file or the table is absent."""
    try:
        text = path.read_bytes()
    except (FileNotFoundError, NotADirectoryError):
        return {}
    except OSError as error:
        raise ConfigError(f"{path}: cannot be read: {error}") from error
    try:
        parsed = tomllib.loads(text.decode("utf-8"))
    except (tomllib.TOMLDecodeError, UnicodeDecodeError) as error:
        raise ConfigError(f"{path}: is not readable TOML: {error}") from error
    section = parsed.get("semantics")
    return section if isinstance(section, dict) else {}


def _from_table(table: dict, path: Path) -> Embedder:
    where = f"{path}: [semantics.embedder]"
    if "api_key" in table:
        # Whoever wrote a key here needs telling where it goes, not only that it
        # is wrong: `.hmd/config.toml` is committed, and a key in it is a leaked key.
        raise ConfigError(
            f"{where}: `api_key` must not hold a key, because this file is "
            "committed. Name the environment variable that holds it instead: "
            'api_key_env = "OPENAI_API_KEY"'
        )
    unknown = sorted(set(table) - set(FIELDS))
    if unknown:
        named = ", ".join(f"`{key}`" for key in unknown)
        raise ConfigError(f"{where}: unknown {_plural('key', unknown)} {named}; "
                          f"accepted: {', '.join(FIELDS)}")

    values: dict = {}
    for key in ("provider", "model", "revision", "endpoint", "api_key_env"):
        if key not in table:
            continue
        value = table[key]
        if not isinstance(value, str) or not value.strip():
            raise ConfigError(f"{where}: `{key}` must be a non-empty string")
        values[key] = value.strip()
    if "dimensions" in table:
        value = table["dimensions"]
        # `bool` is an `int` in Python, and `dimensions = true` is not a width.
        if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
            raise ConfigError(f"{where}: `dimensions` must be a positive integer")
        values["dimensions"] = value
    return Embedder(**values)


def resolve(declared: Embedder, **overrides) -> Embedder:
    """The declared embedder with command-line flags over it, field by field.

    A flag left unset is `None` and overrides nothing, so a vault records the
    embedder it is indexed by and a one-off build need not edit the vault to
    change it.
    """
    unknown = sorted(set(overrides) - set(FIELDS))
    if unknown:
        raise ConfigError(f"not embedder fields: {', '.join(unknown)}")
    given = {key: value for key, value in overrides.items() if value is not None}
    return check(replace(declared, **given))


def check(embedder: Embedder) -> Embedder:
    """Refuse an embedder that cannot be used, naming what is missing."""
    if embedder.provider not in PROVIDERS:
        raise ConfigError(
            f"unknown embedder provider `{embedder.provider}`; "
            f"accepted: {', '.join(PROVIDERS)}"
        )
    if embedder.dimensions is not None and embedder.dimensions <= 0:
        raise ConfigError("`dimensions` must be a positive integer")
    if not embedder.remote:
        return embedder

    missing = [key for key in ("endpoint", "model") if not getattr(embedder, key)]
    if missing:
        named = ", ".join(f"`{key}`" for key in missing)
        raise ConfigError(
            f"the `http` provider needs {named}: an endpoint speaking "
            "`POST /v1/embeddings`, and the model to ask it for"
        )
    if not embedder.revision:
        # A score claims to pin the numbers behind it. A hosted endpoint offers
        # nothing to derive that from, so whoever configures the vault states it;
        # an unpinnable claim is better refused than invented.
        raise ConfigError(
            "the `http` provider needs `revision`: `Retrieval.revision` pins the "
            "numbers a score is, and an endpoint offers nothing to derive it "
            'from. State what you are calling, e.g. revision = "2024-01-25"'
        )
    return embedder


def _plural(word: str, items) -> str:
    return word if len(items) == 1 else f"{word}s"
