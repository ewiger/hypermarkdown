"""The rule set (HMD-0001 §8).

Rule IDs are stable and are never renumbered once released; CI configuration and
suppression will reference them.
"""

from __future__ import annotations

from pathlib import Path

from .. import address as address_mod
from ..embed import MAX_EMBED_DEPTH
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
    "HMD012": ERROR,
    "HMD013": ERROR,
    "HMD014": ERROR,
    "HMD015": ERROR,
    "HMD016": WARNING,
    "HMD017": WARNING,
    "HMD018": WARNING,
    # HMD-0006: addresses inside a card.
    "HMD019": ERROR,
    "HMD020": ERROR,
    "HMD021": WARNING,
    "HMD022": WARNING,
    "HMD023": WARNING,
}


def check(workspace: Workspace, paths: list[Path] | None = None) -> list[Diagnostic]:
    """Lint `paths`, or the whole namespace tree."""
    targets = paths if paths is not None else workspace.pages()
    diagnostics: list[Diagnostic] = []

    for path in targets:
        document = workspace.documents.get(path)
        if document is None:
            continue
        if document.is_markdown:
            # HMD-0029: a Markdown card is not checked; no diagnostic comes
            # from its body.
            continue
        diagnostics.extend(document.diagnostics)  # HMD009, HMD010, HMD013, HMD014, HMD019
        diagnostics.extend(_duplicate_anchors(workspace, document))
        diagnostics.extend(_duplicate_slugs(workspace, document))
        diagnostics.extend(_shadowed_headings(workspace, document))
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


def _duplicate_slugs(workspace: Workspace, document: Document):
    """HMD011 — two headings sharing a base slug are addressed by `_1` suffixes."""
    rel = workspace.rel(document.path)
    for heading in document.headings:
        base, _, suffix = heading.slug.rpartition("_")
        if base and suffix.isdigit():
            yield _at(
                document,
                rel,
                "HMD011",
                heading.span.line,
                heading.span.column,
                f"heading slug collides with an earlier heading; addressable as '#{heading.slug}'",
            )


def _shadowed_headings(workspace: Workspace, document: Document):
    """HMD022 — a heading whose slug a short-form step reads as a unit."""
    rel = workspace.rel(document.path)
    for heading in address_mod.shadowed(document):
        yield _at(
            document,
            rel,
            "HMD022",
            heading.span.line,
            heading.span.column,
            f"'#{heading.slug}' counts {address_mod.plural(address_mod.SHORT_UNITS[heading.slug[0]])} "
            f"rather than naming this heading; anchor the heading to link to it",
        )


def _import_problems(workspace: Workspace, document: Document):
    """HMD003 and HMD015 raised while building the import table."""
    rel = workspace.rel(document.path)
    for rule, message in workspace.import_table(document.path).problems:
        yield _at(document, rel, rule, 1, 1, message)


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

        if result.shadowed:
            shadowed = tuple(workspace.rel(p) for p in result.shadowed if p)
            yield _at(
                document, rel, "HMD016", span.line, span.column,
                f"{link.raw} also matched {', '.join(shadowed)}; the earlier import won",
                candidates=shadowed,
            )


def _fragment(workspace: Workspace, document: Document, link: Link, target: Path, rel: str):
    """HMD004, HMD005, HMD020, HMD021, HMD023 — the address must land in the page."""
    if link.fragment is None or link.address is None:
        return  # no fragment, or a malformed one already reported as HMD019
    resolved = workspace.documents.get(target)
    if resolved is None:
        return
    span = link.span
    result = address_mod.resolve(resolved, link.address, workspace.rel(target))
    if result.failure is not None:
        rule, message = result.failure
        yield _at(document, rel, rule, span.line, span.column, message)
    for rule, message in result.warnings:
        yield _at(document, rel, rule, span.line, span.column, message)


# -- cross-document rules ------------------------------------------------


def _folder_note_collisions(workspace: Workspace, targets: list[Path]):
    """HMD012 — `foo.hmd` beside `foo/index.hmd`, of any card extensions."""
    wanted = set(targets)
    for page in workspace.pages():
        if page in workspace.shadowed:
            continue
        directory = page.parent / workspace.parts(page)[-1]
        note = next(
            (
                directory / f"{INDEX_STEM}{suffix}"
                for suffix in CARD_SUFFIXES
                if directory / f"{INDEX_STEM}{suffix}" in workspace.documents
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
    reported: set[tuple[Path, str | None]] = set()

    for start in targets:
        if start not in workspace.documents:
            continue
        yield from _walk(workspace, start, None, [], reported, wanted)


def _walk(workspace: Workspace, path: Path, fragment: str | None, stack, reported, wanted):
    key = (path, fragment)
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

    if len(stack) >= MAX_EMBED_DEPTH:
        rel = workspace.rel(path)
        if key not in reported:
            reported.add(key)
            yield Diagnostic(
                "HMD008", SEVERITY["HMD008"], rel, 1, 1,
                f"embed depth exceeds the limit of {MAX_EMBED_DEPTH}",
            )
        return

    document = workspace.documents.get(path)
    if document is None:
        return

    stack.append(key)
    for link in document.links:
        if not link.is_embed:
            continue
        result = workspace.resolve(path, link.page_ref)
        if result.outcome is not Outcome.RESOLVED or result.path is None:
            continue
        yield from _walk(workspace, result.path, link.fragment, stack, reported, wanted)
    stack.pop()
