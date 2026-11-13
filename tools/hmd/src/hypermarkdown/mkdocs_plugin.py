"""The MkDocs plugin (HMD-0002).

MkDocs is consumed for the code it already provides. The plugin's whole job is
to make `.hmd` visible to a build and to write down what the resolver has
already decided — it never resolves anything a second time.

Three hooks carry it. `on_files` registers `.hmd` pages under `.md` names, since
MkDocs matches a fixed extension set. `on_nav`… is not used: nav is built in
`on_files` instead, because MkDocs needs the config's `nav` before it builds its
own. `on_page_markdown` expands embeds and rewrites links before Python-Markdown
runs, so `toc` and `footnotes` see one finished document.
"""

from __future__ import annotations

import posixpath
import re
from pathlib import Path

from mkdocs.config import config_options
from mkdocs.config.base import Config as BaseConfig
from mkdocs.exceptions import PluginError
from mkdocs.plugins import BasePlugin
from mkdocs.structure.files import File, Files

from . import config as config_mod
from . import diagram, scan, urls
from .embed import expand
from .model import Link
from .parse import slug_for
from .resolve import Workspace


#: A nav entry with this value is replaced by the derived wiki section, so an
#: authored book nav can say *where* the generated pages go.
NAV_PLACEHOLDER = "hmd://wiki"

#: The destination of an inline markdown link or image: what follows `](`, up
#: to a space (where a title starts) or the closing parenthesis. A destination
#: in angle brackets is not matched, and stays as written.
_INLINE_HREF_RE = re.compile(r"\]\((?P<href>[^)\s<>]+)")

#: The destination of a reference definition, `[label]: path`. A footnote
#: definition, `[^label]: text`, has the same shape and is not one.
_REFERENCE_HREF_RE = re.compile(
    r"^[ ]{0,3}\[(?!\^)[^\]\n]+\]:[ \t]*(?P<href>[^\s<>]+)", re.MULTILINE
)

#: `https:`, `mailto:`, and every other scheme: a destination that is not a path.
_SCHEME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:")


class PluginConfig(BaseConfig):
    #: The namespace root. Defaults to `docs_dir`, but may name a subtree of it:
    #: a site can cover all of `doc/` while `[[…]]` stays restricted to
    #: `doc/wiki`, so a book and its wiki live in one build.
    root = config_options.Optional(config_options.Dir(exists=True))
    build_nav = config_options.Type(bool, default=True)
    #: Render `d2` fences. With no `d2` binary on PATH they degrade to a
    #: labelled placeholder rather than failing the build (HMD-0022 §5).
    diagrams = config_options.Type(bool, default=True)


class HyperMarkDownPlugin(BasePlugin[PluginConfig]):
    """Collect `.hmd` pages, order them, expand them, rewrite their links."""

    def __init__(self) -> None:
        self.workspace: Workspace | None = None
        #: MkDocs source path (`a/b.md`) -> the `.hmd` page it came from.
        self.sources: dict[str, Path] = {}
        #: The `.hmd` page -> the MkDocs source path it was registered under.
        self.destinations: dict[Path, str] = {}
        #: Where the namespace root sits inside `docs_dir`, as a URL prefix.
        self.prefix = ""
        self.docs_dir: Path | None = None
        self.engine = diagram.D2Engine()

    # -- collection ------------------------------------------------------

    def on_files(self, files: Files, /, *, config) -> Files:
        if not config.use_directory_urls:
            raise PluginError(
                "HyperMarkDown requires use_directory_urls: true — a card and its "
                "folder note share one URL, which page.html cannot express"
            )

        self.docs_dir = docs_dir = Path(config.docs_dir).resolve()
        root = Path(self.config.root).resolve() if self.config.root else docs_dir
        self.workspace = Workspace(config_mod.load(root_override=root))
        self.prefix = _prefix(docs_dir, self.workspace.root)

        for path in self.workspace.pages():
            # Publication is opt-in (§2). An unpublished card is not registered
            # at all: no file, no URL, nothing about it in `site/`. Skipping it
            # here is what makes that true everywhere downstream — nav derives
            # from `self.sources`, and link rewriting from `self.destinations`.
            if not self.workspace.is_public(path):
                continue
            dest = self._dest(path)
            self.sources[dest] = path
            self.destinations[path] = dest
            files.append(
                File.generated(
                    config,
                    dest,
                    content=self.workspace.documents[path].text,
                )
            )

        if not self.config.build_nav:
            return files

        # An authored nav wins, except where it asks for the wiki by name. That
        # is the whole integration: a book keeps its own order and says where
        # the generated section belongs. A card the book already placed is not
        # derived a second time — MkDocs gives a page one `parent`, so a card
        # promoted into the book *and* listed in the wiki renders twice with
        # the wrong section expanded on its own page.
        if not config.nav:
            config.nav = self._nav()
            return files

        config.nav = _splice(config.nav, self._nav(claimed=_claimed(config.nav)))
        return files

    def _dest(self, path: Path) -> str:
        """The MkDocs source path a card is registered under, prefix included."""
        dest = urls.dest_for(self.workspace.root, path)
        return posixpath.join(self.prefix, dest) if self.prefix else dest

    # -- §2 nav ----------------------------------------------------------

    def _nav(self, claimed: frozenset[str] = frozenset()) -> list:
        """Derive the nav from the namespace tree.

        Ordering is `nav.order` first, ascending, then root-relative path —
        deterministic and independent of filesystem iteration order (P1).
        `claimed` names the pages an authored nav has already placed; they are
        left out, because a placement made by hand is still a placement.
        """
        assert self.workspace is not None
        tree: dict = {}

        for dest, path in sorted(self.sources.items()):
            if dest in claimed:
                continue
            parts = urls.parts_for(self.workspace.root, path)
            node = tree
            for part in parts[:-1] if parts else ():
                node = node.setdefault(part, {})
            if len(parts) <= 1 and parts and parts[0] == urls.INDEX_STEM:
                node["__index__"] = dest
            elif self._is_folder_note(path):
                node.setdefault(parts[-1], {})["__index__"] = dest if parts else dest
            else:
                node[parts[-1] if parts else urls.INDEX_STEM] = dest

        return self._nav_items(tree)

    def _is_folder_note(self, path: Path) -> bool:
        return path.stem == urls.INDEX_STEM and path.parent != self.workspace.root

    def _order(self, dest: str) -> tuple[int, int, str]:
        """`nav.order` first, ascending; then path. Absent order sorts last."""
        order = self.workspace.documents[self.sources[dest]].card.nav.order
        return (1, 0, dest) if order is None else (0, order, dest)

    def _nav_items(self, node: dict) -> list:
        items: list = []
        index = node.get("__index__")
        if index is not None:
            items.append({self._title(index): index})

        entries = [(key, value) for key, value in node.items() if key != "__index__"]
        entries.sort(key=lambda kv: self._order(kv[1]) if isinstance(kv[1], str) else (1, 0.0, kv[0]))

        for key, value in entries:
            if isinstance(value, str):
                items.append({self._title(value): value})
            else:
                items.append({_titlecase(key): self._nav_items(value)})
        return items

    def _title(self, dest: str) -> str:
        document = self.workspace.documents[self.sources[dest]]
        for heading in document.headings:
            if heading.level == 1:
                return heading.text
        return _titlecase(Path(dest).stem)

    # -- §3 expansion and rewriting --------------------------------------

    def on_page_markdown(self, markdown: str, /, *, page, config, files) -> str:
        """Expand embeds and rewrite links before Python-Markdown runs."""
        if self.workspace is None:
            return markdown

        registered = posixpath.dirname(page.file.src_uri)
        source = self.sources.get(page.file.src_uri)
        if source is None:
            # Not a card. It may still link *to* one — a book page or a proposal
            # writes an ordinary relative link to a `.hmd` file, because a
            # wikilink does not work from outside the namespace — and it may
            # carry diagrams of its own.
            return self._diagrams(self._relink(markdown, registered, registered))

        root = self.workspace.root
        # A folder note `a/b/index.hmd` is registered as `a/b.md`, one directory
        # above the file. Its ordinary links were written against `a/b/`, so the
        # whole page is kept relative to that directory until `_relink` moves
        # every link at once — the wikilinks rewritten below included.
        written = self._written_dir(source, registered)

        def rewrite(link: Link, target: Path | None) -> str:
            text = link.display or link.page_ref
            if target is None:
                # A red link keeps the build green and marks a page worth
                # writing later; lint tracks it as HMD001.
                return f'<a class="hmd-redlink" title="{link.target} does not resolve">{text}</a>'
            if not self.workspace.is_public(target):
                # The target resolves but was never published, so there is no
                # page to point at. Same red link, different reason — and a
                # distinct title, because "unwritten" and "not for this site"
                # are different problems for whoever reads it. HMD017.
                return (
                    f'<a class="hmd-redlink" title="{link.target} is not published">{text}</a>'
                )
            href = urls.href_for(root, source, target)
            if written != registered:
                href = _relative(posixpath.normpath(posixpath.join(registered, href)), written)
            if link.fragment is not None and link.fragment_kind == "heading":
                href = f"{href}#{slug_for(link.fragment, set())}"
            return f"[{text}]({href})"

        expanded = expand(
            self.workspace, source, rewrite=rewrite, can_embed=self.workspace.is_public
        ).text
        return self._diagrams(self._relink(expanded, written, registered))

    def _written_dir(self, source: Path, registered: str) -> str:
        """The directory a card's own relative links were written against.

        That is the directory of the `.hmd` file inside `docs_dir`. It differs
        from the registered page's directory for a folder note only. A card
        outside `docs_dir` has no such directory, and keeps the registered one.
        """
        assert self.docs_dir is not None
        try:
            directory = source.parent.relative_to(self.docs_dir).as_posix()
        except ValueError:
            return registered
        return "" if directory == "." else directory

    def _diagrams(self, markdown: str) -> str:
        """Render `d2` fences to images, or to a labelled placeholder.

        Runs after expansion, so a diagram embedded from another card renders
        like one written here.
        """
        if not self.config.diagrams:
            return markdown

        out: list[str] = []
        cursor = 0
        for info, body, start, end in scan.find_fences(markdown):
            language = info.split()[0].lower() if info.split() else ""
            if language not in diagram.LANGUAGES:
                continue
            out.append(markdown[cursor:start])
            out.append(diagram.to_html(language, body, self.engine) + "\n")
            cursor = end

        out.append(markdown[cursor:])
        return "".join(out)

    def _relink(self, markdown: str, written: str, registered: str) -> str:
        """Move a page's ordinary relative links to the place it is registered.

        Each link is resolved from `written`, the directory it was written
        against, and rewritten relative to `registered`, the directory of the
        page MkDocs builds. Two things happen on the way:

        - A link to a `.hmd` card becomes a link to the page that card is
          registered as. The written path is a real file, which is what makes
          it work when the repository is browsed on its own. The built site
          does not serve `.hmd` sources, so the same link has to arrive at the
          rendered card instead of 404ing.
        - On a folder note, where the two directories differ, a link to any
          other file is rewritten to name the same file from the new place.

        Inline links, images, and reference definitions are covered. Masked
        first, so a path quoted inside a fence or a code span stays quoted.
        """
        masked = scan.mask(markdown)
        matches = sorted(
            (
                *_INLINE_HREF_RE.finditer(masked),
                *_REFERENCE_HREF_RE.finditer(masked),
            ),
            key=lambda match: match.start("href"),
        )
        out: list[str] = []
        cursor = 0

        for match in matches:
            if match.start("href") < cursor:
                continue
            href = self._moved(match.group("href"), written, registered)
            if href is None:
                continue
            out.append(markdown[cursor : match.start("href")])
            out.append(href)
            cursor = match.end("href")

        out.append(markdown[cursor:])
        return "".join(out)

    def _moved(self, href: str, written: str, registered: str) -> str | None:
        """One destination as it reads from `registered`, or None to keep it.

        A scheme link, a site-absolute path, and a fragment on the same page
        mean the same thing wherever the page sits, so they are kept.
        """
        if _SCHEME_RE.match(href) or href.startswith(("/", "#", "?")):
            return None
        cut = min((i for i in (href.find("#"), href.find("?")) if i != -1), default=len(href))
        path, tail = href[:cut], href[cut:]
        target = posixpath.normpath(posixpath.join(written, path))

        dest = self._card_at(target)
        if dest is not None:
            return _relative(dest, registered) + tail
        if written == registered:
            return None
        moved = _relative(target, registered)
        if path.endswith("/") and not moved.endswith("/"):
            moved += "/"
        return moved + tail

    def _card_at(self, target: str) -> str | None:
        """The registered page for a `.hmd` file in `docs_dir`, or None."""
        if self.docs_dir is None or not target.endswith(".hmd"):
            return None
        return self.destinations.get((self.docs_dir / target).resolve())

    # -- serving ---------------------------------------------------------

    def on_serve(self, server, /, *, config, builder):
        """Watch the namespace root, which MkDocs would otherwise ignore."""
        if self.workspace is not None:
            server.watch(str(self.workspace.root))
        return server


def _prefix(docs_dir: Path, root: Path) -> str:
    """How far the namespace root sits below `docs_dir`, as a URL prefix.

    A root outside `docs_dir` gets no prefix: its pages are still generated, they
    simply land at the site root.
    """
    try:
        relative = root.relative_to(docs_dir).as_posix()
    except ValueError:
        return ""
    return "" if relative == "." else relative


def _relative(target: str, directory: str) -> str:
    """`target` as a path relative to `directory`, both relative to `docs_dir`.

    Pure arithmetic on normalized paths. `posixpath.relpath` would anchor both
    at the working directory first, and a target above `docs_dir` then depends
    on how deep that directory happens to be.
    """
    parts = target.split("/")
    base = directory.split("/") if directory else []
    shared = 0
    while shared < min(len(parts), len(base)) and parts[shared] == base[shared]:
        shared += 1
    return "/".join([".."] * (len(base) - shared) + parts[shared:]) or "."


def _splice(node, derived: list):
    """Replace every `hmd://wiki` in an authored nav with the derived section.

    As a mapping value it becomes that entry's children; as a list item it is
    spliced in place, so a section can hold hand-written pages beside generated
    ones.
    """
    if isinstance(node, list):
        out: list = []
        for item in node:
            if item == NAV_PLACEHOLDER:
                out.extend(derived)
            else:
                out.append(_splice(item, derived))
        return out
    if isinstance(node, dict):
        return {
            key: derived if value == NAV_PLACEHOLDER else _splice(value, derived)
            for key, value in node.items()
        }
    return node


def _claimed(node) -> frozenset[str]:
    """Every source path an authored nav names, at any depth.

    The placeholder is not one of them: it stands for the section about to be
    spliced in, not for a page.
    """
    if isinstance(node, str):
        return frozenset() if node == NAV_PLACEHOLDER else frozenset({posixpath.normpath(node)})
    values = node.values() if isinstance(node, dict) else node if isinstance(node, list) else ()
    return frozenset().union(*(_claimed(value) for value in values)) if values else frozenset()


def _titlecase(stem: str) -> str:
    return stem.replace("-", " ").replace("_", " ").strip().capitalize()
