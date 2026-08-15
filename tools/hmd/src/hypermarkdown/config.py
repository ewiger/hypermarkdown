"""Root discovery and `.hmd/config.toml` (HMD-0001 §4, §5.3)."""

from __future__ import annotations

import re
import tomllib
from dataclasses import dataclass
from pathlib import Path, PurePosixPath, PureWindowsPath

MARKER_DIR = ".hmd"
CONFIG_NAME = "config.toml"
DEFAULT_WIKI = "doc/wiki"
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
# walking up from the working directory looking for `.hmd/`, falling back to
# `.git/`. Only the settings below are read; every other key is ignored, so the
# file is safe to extend.

# The namespace root, relative to this project root. Every `.hmd` card beneath
# it is a page, and links resolve within it. Nothing outside it is checked.
wiki = "{wiki}"

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
    wiki: Path  # the namespace root the config names, absolute
    created: frozenset[Path]  # of the three above, the ones that did not exist
    name: str = ""  # the namespace name written, derived or given
    provider: str = DEFAULT_PROVIDER  # what backs that name
    derived_name: bool = False  # the name came from the directory, not the caller
    overwritten: bool = False  # an existing config replaced under `force`
    enclosing: Path | None = None  # an ancestor project this one now nests inside


class ConfigError(Exception):
    """An unusable root or config file — exit code 2, not a lint finding."""


def find_project_root(start: Path) -> Path | None:
    """Nearest ancestor holding `.hmd/`, else nearest holding `.git`."""
    start = start.resolve()
    candidates = [start, *start.parents] if start.is_dir() else list(start.parents)
    for parent in candidates:
        if (parent / MARKER_DIR).is_dir():
            return parent
    for parent in candidates:
        if (parent / ".git").exists():
            return parent
    return None


def load(root_override: Path | None = None, start: Path | None = None) -> Config:
    """Resolve the namespace root and discovery policy.

    Absent `.hmd/config.toml` entirely, the root is `doc/wiki`, autodiscovery is
    on, and the mode is `both` — a tree with no configuration behaves the way a
    new author expects.
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
            f"no project root above {start}: expected a .hmd/ or .git directory. "
            f"Pass --root to name the namespace root directly."
        )

    data, source = _read(project)
    wiki = data.get("wiki", DEFAULT_WIKI)
    if not isinstance(wiki, str):
        raise ConfigError(f"`wiki` must be a string in {source}")

    root = (project / wiki).resolve()
    if not root.is_dir():
        raise ConfigError(f"namespace root does not exist: {root}")

    return Config(root=root, autodiscovery=_autodiscovery(data), mode=_mode(data), source=source)


def init(
    project: Path | None = None,
    wiki: str = DEFAULT_WIKI,
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
    refuses a `wiki` setting that points at nothing, so writing the file and
    stopping there would leave a project whose very next command fails with a
    message about a directory the author never asked for.

    Refuses to replace an existing config unless `force`; overwriting one is
    discarding settings somebody chose, and a marker directory already there is
    the ordinary way to discover a project has been initialised before.
    """
    project = (project or Path.cwd()).expanduser()
    if project.exists() and not project.is_dir():
        raise ConfigError(f"project root is not a directory: {project}")

    setting = _wiki_setting(wiki)
    namespace = _namespace_name(project) if name is None else _checked_name(name)
    if provider not in VALID_PROVIDERS:
        raise ConfigError(f"provider must be one of {sorted(VALID_PROVIDERS)}, got {provider!r}")
    enclosing = _enclosing_project(project)

    marker = project / MARKER_DIR
    config_path = marker / CONFIG_NAME
    wiki_path = project / setting

    # Everything that can fail is checked before anything is written. The
    # command touches three paths, and a run that creates the marker and then
    # trips over the wiki root leaves a project half-made — with a config file
    # claiming a root that is not there, which is the one state `load` cannot
    # explain to whoever finds it.
    overwritten = config_path.is_file()
    if overwritten and not force:
        raise ConfigError(f"already initialised: {config_path} exists. Pass --force to replace it.")
    if marker.exists() and not marker.is_dir():
        raise ConfigError(f"{marker} exists and is not a directory")
    if wiki_path.exists() and not wiki_path.is_dir():
        raise ConfigError(f"wiki root exists and is not a directory: {wiki_path}")

    created = frozenset(path for path in (project, config_path, wiki_path) if not path.exists())

    try:
        marker.mkdir(parents=True, exist_ok=True)
        config_path.write_text(
            CONFIG_TEMPLATE.format(
                wiki=setting,
                name=namespace,
                provider=provider,
                autodiscovery="true",
                mode=DEFAULT_MODE,
            ),
            encoding="utf-8",
        )
        wiki_path.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise ConfigError(f"cannot initialise {project}: {exc}") from exc

    return InitResult(
        project=project.resolve(),
        config=config_path.resolve(),
        wiki=wiki_path.resolve(),
        created=frozenset(path.resolve() for path in created),
        name=namespace,
        provider=provider,
        derived_name=name is None,
        overwritten=overwritten,
        enclosing=enclosing,
    )


def _wiki_setting(value: str) -> str:
    """Normalise a `--wiki` argument into a TOML-safe relative path.

    Rejected rather than escaped: absolute paths, `..` escapes, and the two
    characters a TOML basic string would need escaping. A wiki root outside the
    project it is configured from is not a narrower project, it is a config file
    filed somewhere it does not describe.
    """
    text = value.strip().replace("\\", "/")
    if not text:
        raise ConfigError("wiki must name a directory relative to the project root")
    if PurePosixPath(text).is_absolute() or PureWindowsPath(text).is_absolute():
        raise ConfigError(f"wiki must be relative to the project root, got {value!r}")
    if ".." in PurePosixPath(text).parts:
        raise ConfigError(f"wiki must stay inside the project root, got {value!r}")
    if '"' in text or any(ord(char) < 0x20 for char in text):
        raise ConfigError(f"wiki contains characters a TOML string cannot hold: {value!r}")
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

    Only the marker counts, not the `.git` fallback — every repository would
    answer to that one, and nesting inside a repository is the normal case.
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
            return tomllib.load(handle), path
    except (OSError, tomllib.TOMLDecodeError) as exc:
        raise ConfigError(f"cannot read {path}: {exc}") from exc


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
