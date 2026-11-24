"""The ``from <ref> import <names>`` mini-grammar (HMD-0001 §5.3).

A one-line statement form rather than nested YAML: the grammar is trivial and
the statement reads at a glance, which nested `from:`/`names:` keys would not.
"""

from __future__ import annotations

import re
import unicodedata

from .model import ImportStmt

# WS is spaces and tabs, and an import-name is a segment with no whitespace in
# it: no `/`, no reserved character, no `:`.
_STMT_RE = re.compile(r"^from[ \t]+(?P<ref>\S+)[ \t]+import[ \t]+(?P<names>.+?)[ \t]*$")
_NAME = r"[^\s/\[\]|#^:]+"
_NAME_RE = re.compile(rf"^(?P<name>{_NAME})(?:[ \t]+as[ \t]+(?P<alias>{_NAME}))?$")


class ImportError_(ValueError):
    """A malformed import statement (HMD014)."""


def is_qualified(ref: str) -> bool:
    """True if `ref` is absolute or relative, as an import ref must be.

    A bare ref would need resolving by the very algorithm the import feeds, and
    that circularity has no good answer.
    """
    return ref.startswith("/") or ref.startswith("./") or ref.startswith("../")


def parse_statement(raw: str) -> ImportStmt:
    """Parse one statement, or raise `ImportError_` (HMD014)."""
    if not isinstance(raw, str):
        raise ImportError_(f"import entry must be a string, got {type(raw).__name__}")

    m = _STMT_RE.match(raw.strip())
    if not m:
        raise ImportError_(f"expected 'from <ref> import <names>', got {raw.strip()!r}")

    ref = m.group("ref")
    if not is_qualified(ref):
        raise ImportError_(
            f"import ref {ref!r} must be absolute ('/x') or relative ('./x', '../x'), never bare"
        )

    names = m.group("names").strip(" \t")
    if names == "*":
        return ImportStmt(ref=ref, wildcard=True, bindings=(), raw=raw.strip())

    bindings: list[tuple[str, str]] = []
    for part in names.split(","):
        # Spaces and tabs may stand on either side of a comma, nothing else.
        part = part.strip(" \t")
        if not part:
            raise ImportError_(f"empty name in import list: {raw.strip()!r}")
        if part == "*":
            raise ImportError_("'*' may not be combined with named imports")
        nm = _NAME_RE.match(part)
        if not nm:
            raise ImportError_(f"expected '<name>' or '<name> as <alias>', got {part!r}")
        name = nm.group("name")
        # The local name is compared after NFC, as every name is.
        bindings.append((name, unicodedata.normalize("NFC", nm.group("alias") or name)))

    return ImportStmt(ref=ref, wildcard=False, bindings=tuple(bindings), raw=raw.strip())
