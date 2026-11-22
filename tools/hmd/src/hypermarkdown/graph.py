"""Resolved-graph assembly and JSON serialization (HMD-0001 §7)."""

from __future__ import annotations

import json

from .resolve import Outcome, Workspace


def build(workspace: Workspace) -> dict:
    """Nodes with frontmatter and headings, edges with kind and source span."""
    nodes = []
    edges = []

    for path in workspace.pages():
        document = workspace.documents[path]
        rel = workspace.rel(path)
        table = workspace.import_table(path)
        nodes.append(
            {
                "path": rel,
                "namespace": path.parent.relative_to(workspace.root).as_posix() or "/",
                "tags": list(document.card.tags),
                "frontmatter": _plain(document.frontmatter),
                "headings": [
                    {"level": h.level, "text": h.text, "key": h.key, "line": h.span.line}
                    for h in document.headings
                ],
                "anchors": [a.block_id for a in document.anchors],
                "autodiscovery": workspace.autodiscovery_enabled(path),
                "imports": {
                    "bindings": {k: workspace.rel(v) for k, v in sorted(table.bindings.items())},
                    "search_paths": [workspace.rel(p) if p != workspace.root else "/" for p in table.search_paths],
                },
            }
        )

        for link in document.links:
            result = workspace.resolve(path, link.page_ref)
            edges.append(
                {
                    "source": rel,
                    "target": workspace.rel(result.path) if result.path else None,
                    "kind": "embed" if link.is_embed else "link",
                    "raw": link.raw,
                    "outcome": result.outcome.value,
                    "phase": result.phase,
                    "fragment": link.fragment,
                    "line": link.span.line,
                    "column": link.span.column,
                }
            )

    nodes.sort(key=lambda n: n["path"])
    edges.sort(key=lambda e: (e["source"], e["line"], e["column"]))
    return {"root": str(workspace.root), "nodes": nodes, "edges": edges}


def to_json(workspace: Workspace) -> str:
    return json.dumps(build(workspace), indent=2, sort_keys=True)


def _plain(value):
    """Coerce YAML scalars to JSON-serializable values."""
    if isinstance(value, dict):
        return {str(k): _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


__all__ = ["build", "to_json", "Outcome"]
