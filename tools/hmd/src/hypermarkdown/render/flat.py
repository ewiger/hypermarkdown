"""Flat markdown: erasure of the HyperMarkDown layer (HMD-0002 §5).

Every embed is inlined and every resolved link becomes an ordinary relative
markdown link, leaving output that GitHub or a plain renderer reads without
knowing the format exists. This is a one-way build product. The output no longer
records where a link came from — spine, named import, or sweep — and no longer
marks where an embedded card began and ended.

An unresolved link is left as written. There is nothing to erase it to, and a
`[[name]]` surviving in the output is a truthful statement that the page does
not exist yet.
"""

from __future__ import annotations

import os
import posixpath
from pathlib import Path

import markdown

from ..embed import Expansion, expand
from ..model import Link
from ..address import page_anchor
from ..resolve import Workspace

#: The "free" half of the syntax — everything the format does not own itself
#: (HMD-0001 §9). Consumed as a dependency, never reimplemented.
EXTENSIONS = [
    "admonition",
    "footnotes",
    "tables",
    "toc",
    "pymdownx.arithmatex",
    "pymdownx.details",
    "pymdownx.superfences",
    "pymdownx.tasklist",
    "pymdownx.tilde",
]


def render(workspace: Workspace, path: Path, suffix: str = ".md") -> Expansion:
    """Expand `path` and rewrite its resolved links to relative `suffix` paths."""
    home = path.parent

    def rewrite(link: Link, target: Path | None) -> str:
        if target is None:
            return link.raw
        return f"[{_text(link)}]({_href(home, target, link, suffix, workspace.documents.get(target))})"

    return expand(workspace, path, rewrite=rewrite)


def to_html(workspace: Workspace, path: Path) -> Expansion:
    """Render `path` to HTML through the Python-Markdown pipeline."""
    flat = render(workspace, path, suffix=".html")
    flat.text = markdown.Markdown(extensions=EXTENSIONS).convert(flat.text)
    return flat


def _text(link: Link) -> str:
    if link.display:
        return link.display
    # A block fragment is dropped from the href, so showing it in the link text
    # would promise an anchor the output does not have.
    return link.page_ref if link.fragment_kind == "block" else link.target


def _href(home: Path, target: Path, link: Link, suffix: str, document=None) -> str:
    relative = os.path.relpath(target.with_suffix(suffix), home)
    href = posixpath.join(*Path(relative).parts) if relative != "." else ""

    # A block id has no anchor in plain markdown, so the fragment is dropped
    # rather than emitted as a link that goes nowhere.
    anchor = page_anchor(link, document)
    if anchor:
        href = f"{href}#{anchor}"
    return href
