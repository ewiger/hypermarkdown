"""The workspace and the four-phase resolver (HMD-0001 §5).

Resolution order is named import, then spine, then imported search paths, then
autodiscovery. Precedence follows explicitness: a named import may shadow a
local card because that is what it is for, while an imported search path may
not — so adding `import *` can only resolve links that were previously red, and
can never change what an already-working link means.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

from .config import MARKER_DIR, Config
from .model import PRIVATE, PUBLIC, Document, ImportStmt
from .parse import parse

SUFFIX = ".hmd"
INDEX_STEM = "index"


class Outcome(Enum):
    RESOLVED = "resolved"
    UNRESOLVED = "unresolved"
    AMBIGUOUS = "ambiguous"
    ESCAPES = "escapes"


@dataclass(frozen=True)
class Resolution:
    outcome: Outcome
    path: Path | None = None
    candidates: tuple[Path, ...] = ()
    #: Which phase produced a RESOLVED result, for diagnostics and tests.
    phase: int | None = None
    #: Origins that also held the name but lost on declaration order (HMD016).
    shadowed: tuple[Path, ...] = ()


@dataclass
class ImportTable:
    bindings: dict[str, Path] = field(default_factory=dict)
    search_paths: tuple[Path, ...] = ()
    #: (rule, message) problems found while building the table.
    problems: list[tuple[str, str]] = field(default_factory=list)


class Workspace:
    """Every `.hmd` file under the namespace root, plus resolution over them."""

    def __init__(self, config: Config):
        self.config = config
        self.root = config.root
        self.documents: dict[Path, Document] = {}
        self._pages: list[Path] = []
        #: Root-relative parts -> the pages addressable under them, for phase 3.
        self._by_parts: dict[tuple[str, ...], list[Path]] = {}
        self._import_tables: dict[Path, ImportTable] = {}
        #: Roots of the vaults nested below this one; their cards are not ours.
        self._nested_roots: frozenset[Path] = frozenset()
        self._load()

    # -- loading ---------------------------------------------------------

    def _load(self) -> None:
        self._nested_roots = self._find_nested_roots()
        for path in sorted(self.root.rglob(f"*{SUFFIX}")):
            if not path.is_file() or self._hidden(path) or self._in_nested_vault(path):
                continue
            self._pages.append(path)
            text = path.read_text(encoding="utf-8")
            self.documents[path] = parse(path, text, self.rel(path))

        for path in self._pages:
            parts = self.parts(path)
            self._by_parts.setdefault(parts, []).append(path)
            # A folder note is also addressable by its directory's name, so a
            # bare name means the same thing in phase 1 and phase 3.
            if parts and parts[-1] == INDEX_STEM and len(parts) > 1:
                self._by_parts.setdefault(parts[:-1], []).append(path)

    def _hidden(self, path: Path) -> bool:
        return any(part.startswith(".") for part in path.relative_to(self.root).parts)

    def _find_nested_roots(self) -> frozenset[Path]:
        """Directories below the root that carry their own `.hmd/`.

        Each one is the root of another vault, so nothing beneath it belongs
        to this one. The root's own marker does not count: every vault has one.
        """
        nested = set()
        for marker in self.root.rglob(MARKER_DIR):
            directory = marker.parent
            if directory == self.root or not marker.is_dir():
                continue
            if self._hidden(directory):
                continue
            nested.add(directory)
        return frozenset(nested)

    def _in_nested_vault(self, path: Path) -> bool:
        """Whether `path` is a nested vault's root or lies beneath one."""
        return any(
            path == nested or nested in path.parents for nested in self._nested_roots
        )

    # -- naming ----------------------------------------------------------

    def rel(self, path: Path) -> str:
        return path.relative_to(self.root).as_posix()

    def parts(self, path: Path) -> tuple[str, ...]:
        return path.relative_to(self.root).with_suffix("").parts

    def pages(self) -> list[Path]:
        return list(self._pages)

    # -- §5.1 binding ----------------------------------------------------

    def bind(self, directory: Path, parts: tuple[str, ...]) -> Path | None:
        """Bind `parts` in one directory, honouring folder notes.

        A target naming a directory resolves to that directory's `index.hmd`,
        which is what makes a folder note the namespace's landing page. When
        both `foo.hmd` and `foo/index.hmd` exist the file wins; the collision is
        reported separately as HMD012.
        """
        if not parts:
            return None
        candidate = directory.joinpath(*parts).with_suffix(SUFFIX)
        if candidate in self.documents:
            return candidate
        folder_note = directory.joinpath(*parts) / f"{INDEX_STEM}{SUFFIX}"
        if folder_note in self.documents:
            return folder_note
        return None

    # -- imports ---------------------------------------------------------

    def import_table(self, source: Path) -> ImportTable:
        if source not in self._import_tables:
            self._import_tables[source] = self._build_import_table(source)
        return self._import_tables[source]

    def _build_import_table(self, source: Path) -> ImportTable:
        table = ImportTable()
        document = self.documents.get(source)
        if document is None:
            return table

        search: list[Path] = []
        for stmt in document.card.imports:
            directory = self._import_dir(source, stmt)
            if directory is None:
                table.problems.append(
                    ("HMD003", f"import ref {stmt.ref!r} resolves outside the namespace root")
                )
                continue
            # A nested vault is another namespace, so a directory inside one
            # does not exist as far as this vault is concerned.
            if not directory.is_dir() or self._in_nested_vault(directory):
                table.problems.append(("HMD015", f"import ref {stmt.ref!r} does not exist"))
                continue

            if stmt.wildcard:
                search.append(directory)
                continue

            for name, local in stmt.bindings:
                target = self.bind(directory, (name,))
                if target is None:
                    table.problems.append(
                        ("HMD015", f"cannot import {name!r} from {stmt.ref!r}: no such page")
                    )
                    continue
                if local in table.bindings and table.bindings[local] != target:
                    table.problems.append(
                        (
                            "HMD015",
                            f"{local!r} is bound twice by imports "
                            f"({self.rel(table.bindings[local])} and {self.rel(target)})",
                        )
                    )
                    continue
                table.bindings[local] = target

        table.search_paths = tuple(search)
        return table

    def _import_dir(self, source: Path, stmt: ImportStmt) -> Path | None:
        if stmt.ref.startswith("/"):
            directory = self.root.joinpath(*_split(stmt.ref))
        else:
            directory = source.parent.joinpath(stmt.ref)
        directory = _normalize(directory)
        return directory if self._inside_root(directory) else None

    # -- §5.3 effective feature toggles ----------------------------------

    def autodiscovery_enabled(self, source: Path) -> bool:
        """Card `use`, then the nearest ancestor `index.hmd`, then config.

        Frontmatter always beats configuration, because the card is the most
        local place an author can say what they mean.
        """
        document = self.documents.get(source)
        if document is not None and "autodiscovery" in document.card.use:
            return document.card.use["autodiscovery"]

        directory = source.parent
        while True:
            note = directory / f"{INDEX_STEM}{SUFFIX}"
            if note != source and note in self.documents:
                use = self.documents[note].card.use
                if "autodiscovery" in use:
                    return use["autodiscovery"]
            if directory == self.root or self.root not in directory.parents:
                break
            directory = directory.parent

        return self.config.autodiscovery

    # -- HMD-0002 §2 publication -----------------------------------------

    def visibility(self, source: Path) -> str:
        """Card `nav.visibility`, then the nearest ancestor `index.hmd`, then
        the default — which is `private`.

        Same walk as `autodiscovery_enabled`, and for the same reason: a folder
        is a unit an author thinks in, so publishing one should not mean editing
        every card inside it. The default is the strict end on purpose. A card
        that says nothing about itself has not asked to be published, and the
        failure mode of guessing the other way is a leak rather than a 404.
        """
        document = self.documents.get(source)
        if document is not None and document.card.nav.visibility is not None:
            return document.card.nav.visibility

        directory = source.parent
        while True:
            note = directory / f"{INDEX_STEM}{SUFFIX}"
            if note != source and note in self.documents:
                inherited = self.documents[note].card.nav.visibility
                if inherited is not None:
                    return inherited
            if directory == self.root or self.root not in directory.parents:
                break
            directory = directory.parent

        return PRIVATE

    def is_public(self, source: Path) -> bool:
        return self.visibility(source) == PUBLIC

    # -- §5.2 the algorithm ----------------------------------------------

    def resolve(self, source: Path, page_ref: str) -> Resolution:
        stem = page_ref[: -len(SUFFIX)] if page_ref.endswith(SUFFIX) else page_ref

        if stem.startswith("/"):
            parts = _split(stem)
            target = self.bind(self.root, parts)
            return _hit(target, phase=None) if target else Resolution(Outcome.UNRESOLVED)

        if stem.startswith("./") or stem.startswith("../"):
            base = _normalize(source.parent.joinpath(stem))
            if not self._inside_root(base):
                return Resolution(Outcome.ESCAPES)
            target = self.bind(base.parent, (base.name,))
            return _hit(target, phase=None) if target else Resolution(Outcome.UNRESOLVED)

        parts = _split(stem)
        if not parts:
            return Resolution(Outcome.UNRESOLVED)

        table = self.import_table(source)

        # Phase 0 — named imports. A binding names a page, not a namespace, so
        # it applies to single-segment targets only.
        if len(parts) == 1 and parts[0] in table.bindings:
            return Resolution(Outcome.RESOLVED, table.bindings[parts[0]], phase=0)

        # Phase 1 — spine walk, non-recursive, nearest first.
        for directory in self._spine(source):
            target = self.bind(directory, parts)
            if target is not None:
                return Resolution(Outcome.RESOLVED, target, phase=1)

        # Phase 2 — imported search paths, in declaration order.
        hits = [d for d in table.search_paths if self.bind(d, parts) is not None]
        if hits:
            winner = self.bind(hits[0], parts)
            shadowed = tuple(self.bind(d, parts) for d in hits[1:])
            return Resolution(Outcome.RESOLVED, winner, phase=2, shadowed=shadowed)

        if not self.autodiscovery_enabled(source):
            return Resolution(Outcome.UNRESOLVED)

        # Phase 3 — autodiscovery, at most once.
        matches = self._sweep(source, parts)
        if len(matches) == 1:
            return Resolution(Outcome.RESOLVED, matches[0], phase=3)
        if len(matches) > 1:
            return Resolution(Outcome.AMBIGUOUS, candidates=tuple(matches))
        return Resolution(Outcome.UNRESOLVED)

    def _spine(self, source: Path) -> list[Path]:
        """The source's own directory outward to the root, inclusive."""
        spine = []
        directory = source.parent
        while True:
            spine.append(directory)
            if directory == self.root:
                break
            if self.root not in directory.parents:
                break
            directory = directory.parent
        return spine

    def _sweep(self, source: Path, parts: tuple[str, ...]) -> list[Path]:
        scope = source.parent if self.config.mode == "recursive" else self.root
        matches = {
            page
            for key, pages in self._by_parts.items()
            if key[-len(parts) :] == parts
            for page in pages
            if scope == self.root or scope in page.parents
        }
        # Sorted by root-relative POSIX path, so diagnostics are byte-identical
        # across platforms and runs (P1).
        return sorted(matches, key=self.rel)

    def _inside_root(self, path: Path) -> bool:
        return path == self.root or self.root in path.parents


def _hit(target: Path, phase: int | None) -> Resolution:
    return Resolution(Outcome.RESOLVED, target, phase=phase)


def _split(ref: str) -> tuple[str, ...]:
    return tuple(part for part in ref.strip("/").split("/") if part)


def _normalize(path: Path) -> Path:
    """Collapse `.` and `..` without touching the filesystem.

    `Path.resolve()` follows symlinks, which must not be able to carry a target
    out of the root (HMD-0001 §4).
    """
    parts: list[str] = []
    for part in path.parts:
        if part == ".":
            continue
        if part == ".." and parts and parts[-1] not in ("..", path.anchor):
            parts.pop()
            continue
        parts.append(part)
    return Path(*parts) if parts else path
