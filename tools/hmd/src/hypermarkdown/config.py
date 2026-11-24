"""Root discovery and `.hmd/config.toml` (HMD-0001 §4, §5.3)."""

from __future__ import annotations

import re
import tomllib
from dataclasses import dataclass
from pathlib import Path, PurePosixPath, PureWindowsPath

MARKER_DIR = ".hmd"
CONFIG_NAME = "config.toml"
#: The namespace root, relative to the vault, when `location_path` is not set:
#: the vault itself.
DEFAULT_LOCATION_PATH = "."

#: The key `location_path` replaced, with the default `doc/wiki`. A config that
#: still sets it is refused rather than read with a different root: the vault
#: would load, silently, as a different namespace than its author wrote.
RETIRED_KEY = "wiki"
DEFAULT_MODE = "both"
VALID_MODES = frozenset({"both", "recursive"})

#: The provider kinds a namespace name can be bound to. Only a local directory
#: is implementable today; a remote provider is reserved and unbuilt, which is
#: why the key is written at all — the distinction is the thing it records.
DEFAULT_PROVIDER = "folder"
VALID_PROVIDERS = frozenset({"folder"})

#: A namespace name has to survive `name:card`, the address form another
#: project uses to reach into a bound namespace. Everything that would make
#: that ambiguous is out: the wikilink punctuation `[]|#^`, the separator `:`,
#: the path separators, and whitespace.
NAME_PATTERN = re.compile(r"\A[A-Za-z0-9][A-Za-z0-9._-]*\Z")

#: What `hmd init` writes. Every setting is stated at its default rather than
#: left implicit: the file is the one place an author learns which keys exist,
#: and a commented-out default teaches nothing a blank file does not.
CONFIG_TEMPLATE = """\
# HyperMarkdown project configuration.
#
# This directory doubles as the project root marker — `hmd` finds a project by
# walking up from the working directory looking for `.hmd/`, and nothing else
# marks one. Only the settings below are read; every other key is ignored, so
# the file is safe to extend.

# The cards location: where inside this project the cards start, relative to
# this project root, with `/` between directories. It names the namespace
# root; "." is this project root itself. Every `.hmd` card beneath it is a
# page, and links resolve within it. Nothing outside it is checked.
location_path = "{location_path}"

[namespace]
# This tree's own name. A project's own namespace is otherwise unnamed — there
# is nothing to tell it apart from until a second tree is in play — and naming
# it is what lets another project bind to it and address a card as `name:card`.
# Nothing reads this yet: binding is specified but not implemented, so today
# the key records the intent rather than doing anything.
name = "{name}"

# What provides the tree behind that name. "folder" is a local directory, this
# one. A remote provider is reserved and not implemented.
provider = "{provider}"

[discovery]
# Whether a bare [[link]] the spine walk missed falls back to a sweep of the
# whole namespace. A card overrides this in either direction with `use`.
autodiscovery = {autodiscovery}

# How that sweep searches once it runs: "both" covers the whole namespace,
# "recursive" only the source card's own subtree. Not settable per card.
mode = "{mode}"
"""


@dataclass(frozen=True)
class Config:
    """Resolved project configuration."""

    root: Path  # the namespace root, absolute
    autodiscovery: bool = True
    mode: str = DEFAULT_MODE
    source: Path | None = None  # the config file actually read, if any


@dataclass(frozen=True)
class InitResult:
    """What `init` found and what it had to make."""

    project: Path  # the project root, absolute
    config: Path  # the config file, written either way
    location: Path  # the namespace root the config names, absolute
    created: frozenset[Path]  # of the three above, the ones that did not exist
    name: str = ""  # the namespace name written, derived or given
    provider: str = DEFAULT_PROVIDER  # what backs that name
    derived_name: bool = False  # the name came from the directory, not the caller
    overwritten: bool = False  # an existing config replaced under `force`
    enclosing: Path | None = None  # an ancestor project this one now nests inside


class ConfigError(Exception):
    """An unusable root or config file — exit code 2, not a lint finding."""


def find_project_root(start: Path) -> Path | None:
    """Nearest ancestor holding `.hmd/`, or None.

    Only `.hmd/` marks a project root. A `.git` directory does not: every
    repository has one, and a repository is not a vault until it says so. A
    tree with no marker above it has its namespace root named directly.
    """
    start = start.resolve()
    candidates = [start, *start.parents] if start.is_dir() else list(start.parents)
    for parent in candidates:
        if (parent / MARKER_DIR).is_dir():
            return parent
    return None


def load(root_override: Path | None = None, start: Path | None = None) -> Config:
    """Resolve the namespace root and discovery policy.

    Absent `.hmd/config.toml` entirely, the root is the project root itself,
    autodiscovery is on, and the mode is `both` — a tree with no configuration
    behaves the way a new author expects.
    """
    if root_override is not None:
        root = root_override.resolve()
        if not root.is_dir():
            raise ConfigError(f"root is not a directory: {root}")
        project = find_project_root(root) or root
        data, source = _read(project)
        return Config(
            root=root,
            autodiscovery=_autodiscovery(data),
            mode=_mode(data),
            source=source,
        )

    start = (start or Path.cwd()).resolve()
    project = find_project_root(start)
    if project is None:
        raise ConfigError(
            f"no project root above {start}: expected a .hmd/ directory. "
            f"Run `hmd init`, or pass --root to name the namespace root directly."
        )

    data, source = _read(project)
    location = data.get("location_path", DEFAULT_LOCATION_PATH)
    if not isinstance(location, str):
        raise ConfigError(f"`location_path` must be a string in {source}")

    root = (project / location).resolve()
    _check_not_in_nested_vault(project, location, source)
    if not root.is_dir():
        raise ConfigError(f"namespace root does not exist: {root}")

    return Config(root=root, autodiscovery=_autodiscovery(data), mode=_mode(data), source=source)


def init(
    project: Path | None = None,
    location_path: str = DEFAULT_LOCATION_PATH,
    name: str | None = None,
    provider: str = DEFAULT_PROVIDER,
    force: bool = False,
) -> InitResult:
    """Write `.hmd/config.toml` under `project` and make the root it names.

    `project` defaults to the working directory and `name` to that directory's
    own name, so a bare `init` is a complete answer: the common case is a
    project you are standing in, whose namespace should be called what the
    folder is already called.

    The namespace root is created alongside the config on purpose. `load`
    refuses a `location_path` setting that points at nothing, so writing the file and
    stopping there would leave a project whose very next command fails with a
    message about a directory the author never asked for.

    Refuses to replace an existing config unless `force`; overwriting one is
    discarding settings somebody chose, and a marker directory already there is
    the ordinary way to discover a project has been initialised before.
    """
    project = (project or Path.cwd()).expanduser()
    if project.exists() and not project.is_dir():
        raise ConfigError(f"project root is not a directory: {project}")

    setting = _location_setting(location_path)
    namespace = _namespace_name(project) if name is None else _checked_name(name)
    if provider not in VALID_PROVIDERS:
        raise ConfigError(f"provider must be one of {sorted(VALID_PROVIDERS)}, got {provider!r}")
    enclosing = _enclosing_project(project)

    marker = project / MARKER_DIR
    config_path = marker / CONFIG_NAME
    location = project / setting

    # Everything that can fail is checked before anything is written. The
    # command touches three paths, and a run that creates the marker and then
    # trips over the namespace root leaves a project half-made — with a config file
    # claiming a root that is not there, which is the one state `load` cannot
    # explain to whoever finds it.
    overwritten = config_path.is_file()
    if overwritten and not force:
        raise ConfigError(f"already initialised: {config_path} exists. Pass --force to replace it.")
    if marker.exists() and not marker.is_dir():
        raise ConfigError(f"{marker} exists and is not a directory")
    if location.exists() and not location.is_dir():
        raise ConfigError(f"namespace root exists and is not a directory: {location}")

    created = frozenset(path for path in (project, config_path, location) if not path.exists())

    try:
        marker.mkdir(parents=True, exist_ok=True)
        config_path.write_text(
            CONFIG_TEMPLATE.format(
                location_path=setting,
                name=namespace,
                provider=provider,
                autodiscovery="true",
                mode=DEFAULT_MODE,
            ),
            encoding="utf-8",
        )
        location.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise ConfigError(f"cannot initialise {project}: {exc}") from exc

    return InitResult(
        project=project.resolve(),
        config=config_path.resolve(),
        location=location.resolve(),
        created=frozenset(path.resolve() for path in created),
        name=namespace,
        provider=provider,
        derived_name=name is None,
        overwritten=overwritten,
        enclosing=enclosing,
    )


def _check_not_in_nested_vault(project: Path, location: str, source: Path | None) -> None:
    """Refuse a `location_path` that resolves into a nested vault.

    The namespace root has to lie in the vault whose config names it. A
    directory between the vault and the root that carries its own `.hmd/` is
    another vault, and its cards are never this vault's. The vault's own marker
    is not counted.
    """
    directory = project
    for part in PurePosixPath(location).parts:
        if part in (".", "/"):
            continue
        directory = directory / part
        if (directory / MARKER_DIR).is_dir():
            raise ConfigError(
                f"`location_path` {location!r} in {source} resolves into the nested vault at "
                f"{directory.relative_to(project).as_posix()}; the namespace root must lie in "
                f"the vault that names it"
            )


def _location_setting(value: str) -> str:
    """Normalise a `--location-path` argument into a TOML-safe relative path.

    Rejected rather than escaped: absolute paths, `..` escapes, and the two
    characters a TOML basic string would need escaping. A namespace root outside
    the project it is configured from is not a narrower project, it is a config
    file filed somewhere it does not describe.
    """
    text = value.strip().replace("\\", "/")
    if not text:
        raise ConfigError("location_path must name a directory relative to the project root")
    if PurePosixPath(text).is_absolute() or PureWindowsPath(text).is_absolute():
        raise ConfigError(f"location_path must be relative to the project root, got {value!r}")
    if ".." in PurePosixPath(text).parts:
        raise ConfigError(f"location_path must stay inside the project root, got {value!r}")
    if '"' in text or any(ord(char) < 0x20 for char in text):
        raise ConfigError(
            f"location_path contains characters a TOML string cannot hold: {value!r}"
        )
    return PurePosixPath(text).as_posix()


def _namespace_name(project: Path) -> str:
    """Derive a namespace name from the project directory's own name.

    Derivation is lenient where validation is strict, and the asymmetry is the
    point. A folder called `My Notes` is not the author asking for anything, so
    rewriting it to `My-Notes` is helpful; a `--name` of `My Notes` *is* a
    request, and quietly returning something else would be answering a question
    nobody asked. So this repairs, `_checked_name` refuses.
    """
    raw = project.resolve().name
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", raw).strip("-._")
    if not NAME_PATTERN.match(slug):
        raise ConfigError(
            f"cannot derive a namespace name from {raw!r}. Pass --name to give the project one."
        )
    return slug


def _checked_name(value: str) -> str:
    """Validate a namespace name the caller asked for, never repair it."""
    name = value.strip()
    if not NAME_PATTERN.match(name):
        raise ConfigError(
            f"namespace name must start with a letter or digit and hold only "
            f"letters, digits, dot, dash, or underscore, got {value!r}"
        )
    return name


def _enclosing_project(project: Path) -> Path | None:
    """The nearest ancestor already carrying a `.hmd/`, if any.

    Only the marker counts, the same rule `find_project_root` follows.
    """
    start = project.resolve()
    for parent in start.parents:
        if (parent / MARKER_DIR).is_dir():
            return parent
    return None


def _read(project: Path) -> tuple[dict, Path | None]:
    path = project / MARKER_DIR / CONFIG_NAME
    if not path.is_file():
        return {}, None
    try:
        with path.open("rb") as handle:
            data = tomllib.load(handle)
    except (OSError, tomllib.TOMLDecodeError) as exc:
        raise ConfigError(f"cannot read {path}: {exc}") from exc
    if RETIRED_KEY in data:
        raise ConfigError(
            f"{path} sets `{RETIRED_KEY}`, which HyperMarkDown 0.1 renamed to "
            f"`location_path`. Rename the key; the vault is not loaded until it is."
        )
    return data, path


def _discovery(data: dict) -> dict:
    section = data.get("discovery", {})
    return section if isinstance(section, dict) else {}


def _autodiscovery(data: dict) -> bool:
    value = _discovery(data).get("autodiscovery", True)
    if not isinstance(value, bool):
        raise ConfigError("[discovery] autodiscovery must be a boolean")
    return value


def _mode(data: dict) -> str:
    value = _discovery(data).get("mode", DEFAULT_MODE)
    if value not in VALID_MODES:
        raise ConfigError(f"[discovery] mode must be one of {sorted(VALID_MODES)}, got {value!r}")
    return value
