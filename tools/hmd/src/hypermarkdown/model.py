"""Core data model for HyperMarkDown documents.

Every construct carries an exact source `Span`, so a diagnostic can point at it
and a future language server can reuse the same positions (HMD-0001 §1).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

# Severities.
ERROR = "error"
WARNING = "warning"


@dataclass(frozen=True)
class Span:
    """A byte range in a source file, with a 1-indexed line and column."""

    start: int
    end: int
    line: int
    column: int


@dataclass(frozen=True)
class Heading:
    level: int
    text: str
    slug: str
    span: Span


@dataclass(frozen=True)
class Anchor:
    """A trailing ``^block-id`` marker (HMD-0001 §2)."""

    block_id: str
    span: Span


@dataclass(frozen=True)
class Link:
    """A ``[[wikilink]]`` or, when `is_embed`, a ``![[embed]]``."""

    page_ref: str
    fragment: str | None
    fragment_kind: str | None  # "heading" | "block" | "address" | None
    display: str | None
    is_embed: bool
    raw: str
    span: Span
    #: The parsed fragment (HMD-0006): set for every fragment that parses, a
    #: one-step heading or block fragment included. None for a malformed
    #: address, which is reported as HMD019 and otherwise left unchecked.
    address: object | None = None

    @property
    def target(self) -> str:
        """The link as written, minus any display text — for diagnostics."""
        if self.fragment is None:
            return self.page_ref
        marker = "#^" if self.fragment_kind == "block" else "#"
        return f"{self.page_ref}{marker}{self.fragment}"


@dataclass(frozen=True)
class ImportStmt:
    """One parsed ``from <ref> import <names>`` statement (HMD-0001 §5.3)."""

    ref: str
    wildcard: bool
    bindings: tuple[tuple[str, str], ...]  # (name, local_name)
    raw: str


# `nav.visibility` values. Publication is opt-in: a card reaches a built site
# only if it resolves to PUBLIC, and the resolved default is PRIVATE. Absent
# means "inherit" so a folder note can govern its subtree.
PUBLIC = "public"
PRIVATE = "private"
VISIBILITIES = frozenset({PUBLIC, PRIVATE})


@dataclass(frozen=True)
class NavConfig:
    """The `nav` mapping: how a card places itself in a published site.

    A mapping rather than a bare number because placement has more than one
    dimension — order was simply the one that existed first. A scalar would have
    had to grow a second spelling the moment `visibility` was wanted.
    """

    #: Sort position within the card's directory. None sorts after every keyed
    #: sibling, so ordering one card does not reshuffle the rest.
    order: int | None = None
    #: `public` or `private`. None means inherit — from the nearest ancestor
    #: folder note, and failing that from the default, which is private.
    visibility: str | None = None


@dataclass
class CardConfig:
    """The reserved frontmatter keys: `tags`, `use`, `import`, `nav`."""

    tags: tuple[str, ...] = ()
    # Feature name -> enabled. Absent means "inherit".
    use: dict[str, bool] = field(default_factory=dict)
    imports: tuple[ImportStmt, ...] = ()
    nav: NavConfig = field(default_factory=NavConfig)


@dataclass
class Diagnostic:
    rule: str
    severity: str
    path: str  # root-relative, POSIX separators
    line: int
    column: int
    message: str
    candidates: tuple[str, ...] = ()

    def sort_key(self) -> tuple:
        return (self.path, self.line, self.column, self.rule)

    def to_dict(self) -> dict:
        out = {
            "rule": self.rule,
            "severity": self.severity,
            "path": self.path,
            "line": self.line,
            "column": self.column,
            "message": self.message,
        }
        if self.candidates:
            out["candidates"] = list(self.candidates)
        return out


# Card kinds (HMD-0029). A HyperMarkdown card is scanned and checked; a
# Markdown card is addressable and has headings, and its body is CommonMark.
HMD = "hmd"
MARKDOWN = "markdown"


@dataclass
class Document:
    """One parsed card: a `.hmd` file, or a `.md` or `.markdown` file."""

    path: Path
    text: str
    frontmatter: dict
    card: CardConfig
    headings: tuple[Heading, ...] = ()
    anchors: tuple[Anchor, ...] = ()
    links: tuple[Link, ...] = ()
    # Diagnostics discovered at parse time (HMD009, HMD010, HMD013, HMD014).
    diagnostics: list[Diagnostic] = field(default_factory=list)
    #: `HMD` or `MARKDOWN`.
    kind: str = HMD

    @property
    def is_markdown(self) -> bool:
        return self.kind == MARKDOWN

    def heading_slugs(self) -> set[str]:
        return {h.slug for h in self.headings}

    def block_ids(self) -> set[str]:
        return {a.block_id for a in self.anchors}
