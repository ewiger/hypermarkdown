"""The rule set: the specification's Diagnostics table.

Rule IDs are stable and are never renumbered once released; CI configuration and
suppression will reference them.
"""

from __future__ import annotations

from pathlib import Path

from ..embed import MAX_EMBED_DEPTH, target_region
from ..model import ERROR, WARNING, Diagnostic, Document, Link
from ..resolve import CARD_SUFFIXES, INDEX_STEM, Outcome, Workspace

SEVERITY = {
    "HMD001": WARNING,
    "HMD002": ERROR,
    "HMD003": ERROR,
    "HMD004": ERROR,
    "HMD005": ERROR,
    "HMD006": ERROR,
    "HMD007": ERROR,
    "HMD008": ERROR,
    "HMD009": ERROR,
    "HMD010": ERROR,
    "HMD011": WARNING,
    "HMD012": WARNING,
    "HMD013": ERROR,
    "HMD014": ERROR,
    "HMD015": ERROR,
    "HMD016": WARNING,
    "HMD017": WARNING,
    "HMD018": WARNING,
    "HMD019": ERROR,
}


def check(workspace: Workspace, paths: list[Path] | None = None) -> list[Diagnostic]:
    """Lint `paths`, or the whole namespace tree."""
    targets = paths if paths is not None else workspace.pages()
    diagnostics: list[Diagnostic] = list(_undecodable(workspace, paths))

    for path in targets:
        document = workspace.documents.get(path)
        if document is None:
            continue
        if document.is_markdown:
            # HMD-0029: a Markdown card is not checked; no diagnostic comes
            # from its body.
            continue
        diagnostics.extend(document.diagnostics)  # HMD009, HMD010, HMD013, HMD014
        diagnostics.extend(_duplicate_anchors(workspace, document))
        diagnostics.extend(_duplicate_headings(workspace, document))
        diagnostics.extend(_import_problems(workspace, document))
        diagnostics.extend(_links(workspace, document))

    diagnostics.extend(_folder_note_collisions(workspace, targets))
    diagnostics.extend(_shadowed(workspace, targets))
    diagnostics.extend(_embed_cycles(workspace, targets))

    diagnostics.sort(key=Diagnostic.sort_key)
    return diagnostics


def _at(document: Document, rel: str, rule: str, line: int, column: int, message: str, **kw) -> Diagnostic:
    return Diagnostic(rule, SEVERITY[rule], rel, line, column, message, **kw)


# -- per-document rules --------------------------------------------------


def _undecodable(workspace: Workspace, paths: list[Path] | None):
    """HMD019 — a file with a card extension that is not UTF-8 is not a card."""
    selected = workspace.undecodable if paths is None else set(paths)
    for path in sorted(workspace.undecodable):
        if path in selected:
            yield Diagnostic(
                "HMD019", SEVERITY["HMD019"], workspace.rel(path), 1, 1, workspace.undecodable[path]
            )


def _duplicate_anchors(workspace: Workspace, document: Document):
    """HMD006 — a block id must be unique within its page."""
    rel = workspace.rel(document.path)
    seen: dict[str, int] = {}
    for anchor in document.anchors:
        if anchor.block_id in seen:
            yield _at(
                document,
                rel,
                "HMD006",
                anchor.span.line,
                anchor.span.column,
                f"duplicate block anchor '^{anchor.block_id}' (first defined on line {seen[anchor.block_id]})",
            )
        else:
            seen[anchor.block_id] = anchor.span.line


def _duplicate_headings(workspace: Workspace, document: Document):
    """HMD011 — a heading has the same key as an earlier one in the card.

    A fragment reaches the first of them, so every later one is unreachable by
    its text. A later heading that carries a block anchor is reachable by it:
    the author has applied the remedy, and nothing is reported. A heading whose
    key is empty is unreachable by text anyway, and two of them collide over
    nothing.
    """
    rel = workspace.rel(document.path)
    anchored = {anchor.span.line for anchor in document.anchors}
    first: dict[str, int] = {}
    for heading in document.headings:
        if not heading.key:
            continue
        if heading.key not in first:
            first[heading.key] = heading.span.line
            continue
        if heading.span.line in anchored:
            continue
        yield _at(
            document,
            rel,
            "HMD011",
            heading.span.line,
            heading.span.column,
            f"heading '{heading.text}' has the same key as the heading on line "
            f"{first[heading.key]}, which a fragment reaches instead; anchor this "
            f"one with a block id to link to it",
        )


def _import_problems(workspace: Workspace, document: Document):
    """HMD003 and HMD015 raised while building the import table."""
    rel = workspace.rel(document.path)
    for rule, message, stmt in workspace.import_table(document.path).problems:
        yield _at(document, rel, rule, stmt.line, stmt.column, message)


def _links(workspace: Workspace, document: Document):
    """HMD001..HMD005 — resolution and fragment checks."""
    rel = workspace.rel(document.path)
    for link in document.links:
        span = link.span
        result = workspace.resolve(document.path, link.page_ref)

        if result.outcome is Outcome.ESCAPES:
            yield _at(
                document, rel, "HMD003", span.line, span.column,
                f"{link.raw} resolves outside the namespace root",
            )
            continue

        if result.outcome is Outcome.AMBIGUOUS:
            candidates = tuple(workspace.rel(p) for p in result.candidates)
            yield _at(
                document, rel, "HMD002", span.line, span.column,
                f"{link.raw} matches {len(candidates)} pages; qualify it "
                f"(candidates: {', '.join(candidates)})",
                candidates=candidates,
            )
            continue

        if result.outcome is Outcome.UNRESOLVED:
            yield _at(
                document, rel, "HMD001", span.line, span.column,
                f"{link.raw} does not resolve to a page",
            )
            continue

        for diagnostic in _fragment(workspace, document, link, result.path, rel):
            yield diagnostic

        # HMD017 — a published card reaching into one that is not published.
        # Only from a public card: private cards referring to each other is the
        # ordinary case, and warning about it would bury the real finding.
        if workspace.is_public(document.path) and not workspace.is_public(result.path):
            kind = "embeds" if link.is_embed else "links to"
            yield _at(
                document, rel, "HMD017", span.line, span.column,
                f"{link.raw} {kind} {workspace.rel(result.path)}, which is not "
                f"published; it renders as a red link",
            )

        for directory in result.escaped:
            yield _at(
                document, rel, "HMD003", span.line, span.column,
                f"{link.raw} through the imported path '/{workspace.rel(directory)}' "
                f"resolves outside the namespace root",
            )

        if result.shadowed:
            shadowed = tuple(workspace.rel(p) for p in result.shadowed if p)
            yield _at(
                document, rel, "HMD016", span.line, span.column,
                f"{link.raw} also matched {', '.join(shadowed)}; the earlier import won",
                candidates=shadowed,
            )


def _fragment(workspace: Workspace, document: Document, link: Link, target: Path, rel: str):
    """HMD004 and HMD005 — the fragment must exist in the resolved page."""
    if link.fragment is None:
        return
    resolved = workspace.documents.get(target)
    if resolved is None:
        return
    span = link.span

    if link.fragment_kind == "block":
        if link.fragment not in resolved.block_ids():
            yield _at(
                document, rel, "HMD005", span.line, span.column,
                f"{workspace.rel(target)} has no block '^{link.fragment}'",
            )
        return

    if resolved.find_heading(link.fragment) is None:
        yield _at(
            document, rel, "HMD004", span.line, span.column,
            f"{workspace.rel(target)} has no heading '#{link.fragment}'",
        )


# -- cross-document rules ------------------------------------------------


def _folder_note_collisions(workspace: Workspace, targets: list[Path]):
    """HMD012 — `foo.hmd` beside `foo/index.hmd`, of any card extensions.

    A warning, not an error: the card shadows the module's folder note, which
    stays reachable by its `index` path, as HMD018 does for extensions.
    """
    wanted = set(targets)
    for page in workspace.pages():
        if page in workspace.shadowed:
            continue
        directory = page.parent / workspace.parts(page)[-1]
        # Looked up the way binding looks, so names compare in NFC.
        note = next(
            (
                found
                for suffix in CARD_SUFFIXES
                if (found := workspace.card(directory / f"{INDEX_STEM}{suffix}")) is not None
            ),
            None,
        )
        if note is None:
            continue
        if page not in wanted and note not in wanted:
            continue
        rel = workspace.rel(page)
        yield Diagnostic(
            "HMD012",
            SEVERITY["HMD012"],
            rel,
            1,
            1,
            f"{rel} and {workspace.rel(note)} both claim the name "
            f"'{'/'.join(workspace.parts(page))}'; the file wins",
        )


def _shadowed(workspace: Workspace, targets: list[Path]):
    """HMD018 — a card shadows one of the same name with a later extension."""
    wanted = set(targets)
    for loser, winner in sorted(workspace.shadowed.items()):
        if loser not in wanted and winner not in wanted:
            continue
        rel = workspace.rel(loser)
        parts = workspace.parts(loser)
        if len(parts) > 1 and parts[-1] == INDEX_STEM:
            parts = parts[:-1]  # a folder note is named by its directory
        name = "/".join(parts)
        yield Diagnostic(
            "HMD018",
            SEVERITY["HMD018"],
            rel,
            1,
            1,
            f"{workspace.rel(winner)} shadows {rel}; [[{name}]] means {workspace.rel(winner)}",
        )


def _embed_cycles(workspace: Workspace, targets: list[Path]):
    """HMD007 and HMD008 — cycle detection and the depth bound."""
    wanted = set(targets)
    reported: set[tuple[Path, int | None]] = set()

    for start in targets:
        if start not in workspace.documents:
            continue
        yield from _walk(workspace, start, None, [], reported, wanted)


def _walk(workspace: Workspace, path: Path, via: Link | None, stack, reported, wanted):
    """Follow the embeds inside what `via` embeds of `path`.

    `via` is the embed that reached this card, or None for a card linted on its
    own, which is walked whole. An embed of a section or a block expands to that
    region only, so only the embeds inside it can continue the chain; one
    section embedding another section of its own card is not a cycle.
    """
    document = workspace.documents.get(path)
    if document is None:
        return

    # What is being expanded, identified by what it resolved to rather than
    # by how the embed was spelled: the whole card, or the section or block,
    # named by where its region starts. `#Linux`, `#linux`, and an anchor on
    # the `## Linux` line all name one section, so they are one stack entry.
    if via is None or via.fragment is None:
        region = (0, len(document.text))
        identity = None
    else:
        region = target_region(document, via)
        if region is None:
            # The fragment matches nothing, so nothing expands; HMD004 or
            # HMD005 reports the fragment itself.
            return
        identity = region[0]
    start, end = region
    key = (path, identity)

    if key in stack:
        if key not in reported:
            reported.add(key)
            rel = workspace.rel(path)
            chain = " -> ".join(workspace.rel(p) for p, _ in stack[stack.index(key) :])
            yield Diagnostic(
                "HMD007", SEVERITY["HMD007"], rel, 1, 1,
                f"embed cycle: {chain} -> {rel}",
            )
        return

    # The starting card has depth zero and each nested embed adds one, so this
    # card's depth is the number of cards above it. An embed that would exceed
    # the limit is reported where it is written, in the card that embeds this
    # one, once however many chains reach it.
    if len(stack) > MAX_EMBED_DEPTH:
        parent = stack[-1][0]
        where = ("HMD008", parent, via.span.line, via.span.column)
        if where not in reported:
            reported.add(where)
            yield Diagnostic(
                "HMD008", SEVERITY["HMD008"], workspace.rel(parent),
                via.span.line, via.span.column,
                f"embed depth exceeds the limit of {MAX_EMBED_DEPTH}",
            )
        return

    stack.append(key)
    for link in document.links:
        if not link.is_embed or not start <= link.span.index < end:
            continue
        result = workspace.resolve(path, link.page_ref)
        if result.outcome is not Outcome.RESOLVED or result.path is None:
            continue
        yield from _walk(workspace, result.path, link, stack, reported, wanted)
    stack.pop()
