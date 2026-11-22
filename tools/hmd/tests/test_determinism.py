"""The same tree gives the same result, whatever order its files arrived in.

The specification asks for byte-identical diagnostics however a tree is
processed, on whichever platform, and in whatever order its files were created
or are listed by the filesystem. Two ways in: build the tree twice in opposite
creation orders, and make the directory listing itself come back reversed.
"""

from __future__ import annotations

import os
import shutil

import pytest

from hypermarkdown import config, graph
from hypermarkdown.lint import check, format_json
from hypermarkdown.resolve import Workspace

#: Enough of the language to give the order somewhere to leak: an ambiguous
#: sweep with sorted candidates, a shadowed card, a folder-note collision, a
#: duplicate heading, an embed, and links in several directories.
TREE = {
    "index.hmd": "# Root\n\n[[dup]] [[owl]] [[c/deep#Setup]]\n",
    "a/dup.hmd": "# A\n",
    "b/dup.hmd": "# B\n",
    "owl.hmd": "# Owl\n",
    "owl.md": "# Owl\n",
    "coll.hmd": "# Coll\n",
    "coll/index.hmd": "# Coll note\n",
    "c/deep.hmd": "# Deep\n\n## Setup\n\n## Setup\n\n![[../owl]]\n[[missing]]\n",
    "c/other.hmd": "Other\n=====\n\n[[deep#nope]] [[zeta]]\n",
    "zeta.hmd": "---\ntags: [x]\n---\n# Zeta\n",
}


def write(root, names):
    for rel in names:
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(TREE[rel], encoding="utf-8")


def outputs(root) -> tuple[str, str]:
    workspace = Workspace(config.load(root_override=root))
    return format_json(check(workspace)), graph.to_json(workspace)


def test_creation_order_does_not_change_lint_or_graph_output(tmp_path):
    root = tmp_path / "tree"
    write(root, sorted(TREE))
    first = outputs(root)

    shutil.rmtree(root)
    write(root, sorted(TREE, reverse=True))
    second = outputs(root)

    assert first == second
    assert '"HMD002"' in first[0] and '"HMD011"' in first[0]


@pytest.mark.parametrize("order", ["reversed", "rotated"])
def test_listing_order_does_not_change_lint_or_graph_output(tmp_path, monkeypatch, order):
    root = tmp_path / "tree"
    write(root, sorted(TREE))
    expected = outputs(root)

    real = os.scandir

    class Listing:
        """`os.scandir`, but handing its entries back in another order."""

        def __init__(self, *args, **kwargs):
            with real(*args, **kwargs) as it:
                entries = list(it)
            if order == "reversed":
                entries.reverse()
            else:
                entries = entries[1:] + entries[:1]
            self._entries = entries

        def __iter__(self):
            return iter(self._entries)

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def close(self):
            pass

    monkeypatch.setattr(os, "scandir", Listing)
    real_listdir = os.listdir
    monkeypatch.setattr(os, "listdir", lambda *a, **k: list(reversed(real_listdir(*a, **k))))

    assert outputs(root) == expected
