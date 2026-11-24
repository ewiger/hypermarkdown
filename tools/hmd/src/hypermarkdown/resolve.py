"""The workspace and the four-phase resolver (HMD-0001 §5).

Resolution order is named import, then spine, then imported search paths, then
autodiscovery. Precedence follows explicitness: a named import may shadow a
local card because that is what it is for, while an imported search path may
not — so adding `import *` can only resolve links that were previously red, and
can never change what an already-working link means.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

from .config import MARKER_DIR, Config
from .model import PRIVATE, PUBLIC, Document, ImportStmt
from .parse import parse, parse_markdown

SUFFIX = ".hmd"
#: The card extensions in priority order (HMD-0029): where two files compete for
#: one name, the earlier extension wins.
CARD_SUFFIXES = (".hmd", ".md", ".markdown")
INDEX_STEM = "index"

#: The UTF-8 byte-order mark. One at the start of a card is ignored, and byte 0
#: of the card is the byte after it.
BOM = b"\xef\xbb\xbf"


def read_card(path: Path) -> str:
    """A card's text: its bytes decoded as UTF-8, a leading BOM dropped.

    Read as bytes, not through a text-mode `open`, whose universal newlines
    would turn every `\r\n` into `\n` and shift every offset after it. Raises
    `UnicodeDecodeError` for a file that is not UTF-8, which is then not a card
    (HMD019).
    """
    data = path.read_bytes()
    if data.startswith(BOM):
        data = data[len(BOM) :]
    return data.decode("utf-8")


def nfc(value: str) -> str:
    """`value` in Unicode NFC, the form every name is compared in."""
    return unicodedata.normalize("NFC", value)


def _nfc_path(path: Path) -> Path:
    return Path(nfc(str(path)))


def card_suffix(name: str) -> str | None:
    """The card extension `name` ends in, or None."""
    for suffix in CARD_SUFFIXES:
        if name.endswith(suffix):
            return suffix
    return None


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


class _Escapes:
    """What `Workspace.bind` returns for a path that leaves the namespace."""

    def __repr__(self) -> str:
        return "ESCAPES"


#: A boundary violation met while binding: outside the root, inside a nested
#: vault, or through a symbolic link that leads out of the root. It is HMD003,
#: never an ordinary missing card.
ESCAPES = _Escapes()


@dataclass
class ImportTable:
    bindings: dict[str, Path] = field(default_factory=dict)
    search_paths: tuple[Path, ...] = ()
    #: (rule, message) problems found while building the table.
    problems: list[tuple[str, str]] = field(default_factory=list)


class Workspace:
    """Every card under the namespace root, plus resolution over them."""

    def __init__(self, config: Config):
        self.config = config
        self.root = config.root
        self.documents: dict[Path, Document] = {}
        self._pages: list[Path] = []
        #: Root-relative parts -> the pages addressable under them, for phase 3.
        self._by_parts: dict[tuple[str, ...], list[Path]] = {}
        self._import_tables: dict[Path, ImportTable] = {}
        #: Shadowed card -> the card of the same name that shadows it (HMD018).
        self.shadowed: dict[Path, Path] = {}
        #: Roots of the vaults nested below this one; their cards are not ours.
        self._nested_roots: frozenset[Path] = frozenset()
        #: Files with a card extension that are not UTF-8 -> why (HMD019).
        #: None of them is a card: not scanned, not a target, not a page.
        self.undecodable: dict[Path, str] = {}
        #: A card's path in NFC -> its path as stored on disk. A reference and
        #: a name on disk are compared in NFC, because the same name can be
        #: stored in either form and must resolve the same way everywhere.
        self._by_nfc: dict[Path, Path] = {}
        #: The same, for every directory below the root (import origins).
        self._dirs_by_nfc: dict[Path, Path] = {}
        #: Symbolic links below the root whose target lies outside it, in NFC.
        #: Neither they nor anything reached through them is part of the
        #: namespace, and a path that meets one escapes it.
        self._escaping_links: set[Path] = set()
        self._load()

    # -- loading ---------------------------------------------------------

    def _load(self) -> None:
        self._nested_roots = self._find_nested_roots()
        # Sorted, so nothing below depends on the order the filesystem lists
        # a directory in, or the order its files were created in.
        for path in sorted(self.root.rglob("*")):
            if path.is_symlink() and not self._inside_root(path.resolve()):
                if not self._hidden(path):
                    self._escaping_links.add(_nfc_path(path))
                continue
            if path.is_dir():
                if not self._hidden(path) and not self._in_nested_vault(path):
                    self._dirs_by_nfc.setdefault(_nfc_path(path), path)
                continue
            suffix = card_suffix(path.name)
            if suffix is None or path.name == suffix:
                continue
            if not path.is_file() or self._hidden(path) or self._in_nested_vault(path):
                continue
            try:
                text = read_card(path)
            except UnicodeDecodeError as exc:
                self.undecodable[path] = (
                    f"not valid UTF-8 (byte {exc.start} cannot be decoded), so it is not a card"
                )
                continue
            if _nfc_path(path) in self._by_nfc:
                # Two names on disk that are one name in NFC. Only the first,
                # in sorted order, is the card at that name.
                continue
            self._by_nfc[_nfc_path(path)] = path
            self._pages.append(path)
            read = parse if suffix == SUFFIX else parse_markdown
            self.documents[path] = read(path, text, self.rel(path))

        # Files of one directory whose names differ only in their card
        # extension claim one name; the earliest extension is the card at it.
        claims: dict[tuple[Path, str], list[Path]] = {}
        for path in self._pages:
            stem = nfc(path.name[: -len(card_suffix(path.name))])
            claims.setdefault((_nfc_path(path.parent), stem), []).append(path)
        for paths in claims.values():
            ranked = sorted(paths, key=lambda p: CARD_SUFFIXES.index(card_suffix(p.name)))
            for loser in ranked[1:]:
                self.shadowed[loser] = ranked[0]

        for path in self._pages:
            # A shadowed card is indexed too: a reference that writes its
            # extension reaches it in the sweep, and one that writes none
            # skips it there (see `_sweep`).
            parts = tuple(nfc(part) for part in self.parts(path))
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
        relative = path.relative_to(self.root).parts
        suffix = card_suffix(relative[-1]) or ""
        return (*relative[:-1], relative[-1][: len(relative[-1]) - len(suffix)])

    def pages(self) -> list[Path]:
        return list(self._pages)

    def card(self, path: Path) -> Path | None:
        """The card at `path` as stored on disk, comparing names in NFC."""
        return self._by_nfc.get(_nfc_path(path))

    # -- §5.1 binding ----------------------------------------------------

    def bind(
        self,
        directory: Path,
        parts: tuple[str, ...],
        suffix: str | None = None,
        directory_only: bool = False,
    ) -> Path | _Escapes | None:
        """Look `parts` up in one directory, honouring folder notes.

        The specification's *Resolving a reference within a directory*. The
        path is normalised first, and one that leaves the namespace is
        `ESCAPES`. The card extensions are tried in priority order, then the
        folder note with the same extensions in the same order. A target
        naming a directory resolves to that directory's folder note. When both
        `foo.hmd` and `foo/index.hmd` exist the file wins; the collision is
        reported separately as HMD012. A `suffix` the reference wrote binds
        only that extension, and `directory_only` — `[[./]]` and `[[../]]` —
        skips the file and binds only the folder note.
        """
        if not parts and not directory_only:
            return None
        base = _normalize(directory.joinpath(*parts))
        if self._violates(base):
            return ESCAPES
        suffixes = (suffix,) if suffix else CARD_SUFFIXES
        candidates = [] if directory_only or base == self.root else [
            base.parent / f"{base.name}{each}" for each in suffixes
        ]
        candidates += [base / f"{INDEX_STEM}{each}" for each in suffixes]
        for candidate in candidates:
            if _nfc_path(candidate) in self._escaping_links:
                return ESCAPES
            card = self.card(candidate)
            if card is not None:
                return card
        return None

    def _violates(self, path: Path) -> bool:
        """Whether a normalised `path` breaks the namespace's boundaries.

        Outside the root, inside a nested vault, or reached through a symbolic
        link that leads out of the root.
        """
        if not self._inside_root(path) or self._in_nested_vault(path):
            return True
        if not self._escaping_links:
            return False
        current = self.root
        for part in path.relative_to(self.root).parts:
            current = current / part
            if _nfc_path(current) in self._escaping_links:
                return True
        return False

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
            directory = self._directory(directory)
            if directory is None or self._in_nested_vault(directory):
                table.problems.append(("HMD015", f"import ref {stmt.ref!r} does not exist"))
                continue

            if stmt.wildcard:
                search.append(directory)
                continue

            for name, local in stmt.bindings:
                target = self.bind(directory, (name,))
                if not isinstance(target, Path):
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

    def _directory(self, path: Path) -> Path | None:
        """The directory at `path` as stored on disk, comparing names in NFC."""
        if path == self.root:
            return path
        return self._dirs_by_nfc.get(_nfc_path(path))

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
        if document is not None and document.is_markdown:
            # HMD-0029: a Markdown card is published wherever its file is, by
            # whatever publishes Markdown; HyperMarkdown does not gate it.
            return PUBLIC
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
        page_ref = nfc(page_ref)
        suffix = card_suffix(page_ref)
        stem = page_ref[: -len(suffix)] if suffix else page_ref

        if stem.startswith("/"):
            return _bound(self.bind(self.root, _split(stem), suffix))

        if stem.startswith("./") or stem.startswith("../"):
            base = _normalize(source.parent.joinpath(stem))
            if self._violates(base):
                return Resolution(Outcome.ESCAPES)
            if all(part in (".", "..") for part in _split(stem)):
                # `[[./]]`, `[[../]]`: the directory itself, so its folder note.
                return _bound(self.bind(base, (), suffix, directory_only=True))
            return _bound(self.bind(base.parent, (base.name,), suffix))

        parts = _split(stem)
        if not parts:
            return Resolution(Outcome.UNRESOLVED)

        table = self.import_table(source)

        # Phase 0 — named imports. A binding names a page, not a namespace, so
        # it applies to single-segment targets only, and not to a reference
        # that writes an extension the bound card does not have.
        if len(parts) == 1 and parts[0] in table.bindings:
            bound = table.bindings[parts[0]]
            if suffix is None or card_suffix(bound.name) == suffix:
                return Resolution(Outcome.RESOLVED, bound, phase=0)

        # Phase 1 — spine walk, non-recursive, nearest first.
        for directory in self._spine(source):
            target = self.bind(directory, parts, suffix)
            if target is ESCAPES:
                return Resolution(Outcome.ESCAPES)
            if target is not None:
                return Resolution(Outcome.RESOLVED, target, phase=1)

        # Phase 2 — imported search paths, in declaration order. Every one is
        # probed: the first card wins, and each other distinct card is
        # shadowed (HMD016). One card reached twice is not a collision.
        found: list[Path] = []
        for directory in table.search_paths:
            target = self.bind(directory, parts, suffix)
            if target is ESCAPES:
                return Resolution(Outcome.ESCAPES)
            if target is not None and target not in found:
                found.append(target)
        if found:
            return Resolution(Outcome.RESOLVED, found[0], phase=2, shadowed=tuple(found[1:]))

        if not self.autodiscovery_enabled(source):
            return Resolution(Outcome.UNRESOLVED)

        # Phase 3 — autodiscovery, at most once.
        matches = self._sweep(source, parts, suffix)
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

    def _sweep(self, source: Path, parts: tuple[str, ...], suffix: str | None = None) -> list[Path]:
        scope = source.parent if self.config.mode == "recursive" else self.root
        matches = {
            page
            for key, pages in self._by_parts.items()
            if key[-len(parts) :] == parts
            for page in pages
            if (scope == self.root or scope in page.parents)
            and (
                card_suffix(page.name) == suffix
                if suffix is not None
                else page not in self.shadowed
            )
        }
        # Sorted by root-relative POSIX path, so diagnostics are byte-identical
        # across platforms and runs (P1).
        return sorted(matches, key=self.rel)

    def _inside_root(self, path: Path) -> bool:
        return path == self.root or self.root in path.parents


def _bound(target: Path | _Escapes | None) -> Resolution:
    """The resolution of a path reference from what `bind` returned."""
    if target is ESCAPES:
        return Resolution(Outcome.ESCAPES)
    if target is None:
        return Resolution(Outcome.UNRESOLVED)
    return Resolution(Outcome.RESOLVED, target)


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
