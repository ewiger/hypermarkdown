"""URL policy and the MkDocs plugin (HMD-0002 §1-§4)."""

from __future__ import annotations

import re
from pathlib import Path

import yaml

import pytest

from hypermarkdown import urls

mkdocs_build = pytest.importorskip("mkdocs.commands.build")
mkdocs_config = pytest.importorskip("mkdocs.config")

REPO_ROOT = Path(__file__).resolve().parents[1]
FIXTURE = REPO_ROOT / "examples" / "small"

#: Publication is opt-in (HMD-0002 §2). Prefixed to a card it publishes that
#: card; prefixed to a folder note it publishes the whole subtree, since
#: `nav.visibility` inherits.
PUBLIC = "---\nnav:\n  visibility: public\n---\n\n"
PRIVATE = "---\nnav:\n  visibility: private\n---\n\n"


# -- §1 URL policy -------------------------------------------------------


def test_a_card_serves_at_a_directory_url(tmp_path):
    assert urls.url_for(tmp_path, tmp_path / "a" / "b.hmd") == "a/b/"


def test_a_folder_note_and_a_card_share_one_url(tmp_path):
    """Two names for one page must not become two URLs for one page."""
    assert urls.url_for(tmp_path, tmp_path / "a" / "b" / "index.hmd") == "a/b/"
    assert urls.url_for(tmp_path, tmp_path / "a" / "b.hmd") == "a/b/"


def test_the_root_folder_note_is_the_site_home(tmp_path):
    assert urls.url_for(tmp_path, tmp_path / "index.hmd") == ""


def test_pages_are_registered_as_markdown(tmp_path):
    assert urls.dest_for(tmp_path, tmp_path / "a" / "b.hmd") == "a/b.md"
    assert urls.dest_for(tmp_path, tmp_path / "a" / "b" / "index.hmd") == "a/b.md"


@pytest.mark.parametrize(
    ("source", "target", "expected"),
    [
        ("a/one.hmd", "a/two.hmd", "two.md"),
        ("a/b/deep.hmd", "top.hmd", "../../top.md"),
        ("top.hmd", "a/b/deep.hmd", "a/b/deep.md"),
        ("a/one.hmd", "a/folder/index.hmd", "folder.md"),
    ],
)
def test_hrefs_are_relative_to_the_source_path(tmp_path, source, target, expected):
    """MkDocs resolves and validates links against the source tree, so it is
    handed a source-relative path rather than a finished URL."""
    assert urls.href_for(tmp_path, tmp_path / source, tmp_path / target) == expected


# -- the build -----------------------------------------------------------


def _build_config(tmp_path: Path, docs_dir: Path, **extra):
    """A loaded MkDocs config pointing at `docs_dir`, building into tmp_path."""
    site_dir = tmp_path / "site"
    config_file = tmp_path / "mkdocs.yml"
    settings = {
        "site_name": "test",
        "docs_dir": str(docs_dir),
        "site_dir": str(site_dir),
        "plugins": ["hypermarkdown"],
        "exclude_docs": "*.hmd",
        **extra,
    }
    config_file.write_text(yaml.safe_dump(settings), encoding="utf-8")
    return mkdocs_config.load_config(str(config_file))


def build(tmp_path: Path, docs_dir: Path, **extra) -> Path:
    """Build `docs_dir` into a temporary site and return the site directory."""
    mkdocs_build.build(_build_config(tmp_path, docs_dir, **extra))
    return tmp_path / "site"


def test_every_card_reaches_the_site(tmp_path):
    site = build(tmp_path, FIXTURE)
    assert (site / "index.html").is_file()
    assert (site / "specs" / "auth" / "login" / "index.html").is_file()
    # A folder note serves at its directory's URL, not at `.../index/`.
    assert (site / "specs" / "auth" / "index.html").is_file()
    assert not (site / "specs" / "auth" / "index" / "index.html").exists()


def test_a_wikilink_becomes_a_real_href(tmp_path):
    site = build(tmp_path, FIXTURE)
    html = (site / "specs" / "auth" / "login" / "index.html").read_text()
    assert 'href="../tokens/"' in html


def test_a_red_link_keeps_the_build_green(tmp_path):
    """The fixture's deliberate red link renders, and does not fail the build."""
    site = build(tmp_path, FIXTURE)
    html = (site / "glossary" / "index.html").read_text()
    assert 'class="hmd-redlink"' in html
    assert "idempotency" in html


def test_embeds_are_expanded_into_the_page(tmp_path):
    site = build(tmp_path, FIXTURE)
    html = (site / "specs" / "auth" / "login" / "index.html").read_text()
    assert "A bearer credential presented on every request" in html
    assert "^definition" not in html


def test_page_urls_match_the_policy(tmp_path):
    """What §1 says a page's URL is, is where the build actually puts it."""
    site = build(tmp_path, FIXTURE)
    for page in FIXTURE.rglob("*.hmd"):
        if any(part.startswith(".") for part in page.relative_to(FIXTURE).parts):
            continue
        expected = site / urls.url_for(FIXTURE, page) / "index.html"
        assert expected.is_file(), f"{page} is not served at {urls.url_for(FIXTURE, page)}"


def test_page_urls_are_directory_urls_only(tmp_path):
    from mkdocs.exceptions import Abort

    with pytest.raises((Abort, SystemExit)):
        build(tmp_path, FIXTURE, use_directory_urls=False)


# -- §2 nav --------------------------------------------------------------


def test_nav_orders_by_the_nav_order_key_then_by_path(tmp_path):
    docs = tmp_path / "docs"
    (docs / "sub").mkdir(parents=True)
    (docs / "index.hmd").write_text(PUBLIC + "# Home\n", encoding="utf-8")
    (docs / "aaa.hmd").write_text("---\nnav:\n  order: 20\n---\n\n# Aaa\n", encoding="utf-8")
    (docs / "zzz.hmd").write_text("---\nnav:\n  order: 10\n---\n\n# Zzz\n", encoding="utf-8")
    (docs / "mmm.hmd").write_text("# Mmm\n", encoding="utf-8")

    site = build(tmp_path, docs)
    html = (site / "index.html").read_text()
    # `order: 10` sorts ahead of `order: 20`, and both ahead of the unkeyed card.
    assert html.index(">Zzz<") < html.index(">Aaa<") < html.index(">Mmm<")


def test_a_scalar_nav_does_not_order_a_card(tmp_path):
    """The pre-mapping spelling. It is reported by lint; here it simply carries
    no order, so the card falls back to path (HMD-0002 §2)."""
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "index.hmd").write_text(PUBLIC + "# Home\n", encoding="utf-8")
    (docs / "zzz.hmd").write_text("---\nnav: 10\n---\n\n# Zzz\n", encoding="utf-8")
    (docs / "aaa.hmd").write_text("---\nnav:\n  order: 20\n---\n\n# Aaa\n", encoding="utf-8")

    html = (build(tmp_path, docs) / "index.html").read_text()
    assert html.index(">Aaa<") < html.index(">Zzz<")


def test_a_card_title_comes_from_its_first_heading(tmp_path):
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "index.hmd").write_text(PUBLIC + "# Home\n", encoding="utf-8")
    (docs / "some-card.hmd").write_text("# A Proper Title\n", encoding="utf-8")

    html = (build(tmp_path, docs) / "index.html").read_text()
    assert "A Proper Title" in html


def test_an_explicit_nav_wins(tmp_path):
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "index.hmd").write_text(PUBLIC + "# Home\n", encoding="utf-8")
    (docs / "hidden.hmd").write_text("# Hidden\n", encoding="utf-8")

    site = build(tmp_path, docs, nav=[{"Home": "index.md"}])
    html = (site / "index.html").read_text()
    assert "Hidden" not in html
    # The page still builds; it is simply absent from the nav.
    assert (site / "hidden" / "index.html").is_file()


# -- §2 visibility -------------------------------------------------------


def test_publication_is_opt_in(tmp_path):
    """A card with no `nav.visibility` and no ancestor that sets one gets no
    page and no URL — not merely a missing nav entry.

    The home here is plain markdown on purpose: a *public* root folder note
    would publish the whole tree under it, which is what inheritance is for.
    """
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "index.md").write_text("# Home\n", encoding="utf-8")
    (docs / "open.hmd").write_text(PUBLIC + "# Open\n", encoding="utf-8")
    (docs / "quiet.hmd").write_text("# Quiet\n", encoding="utf-8")

    site = build(tmp_path, docs)
    assert (site / "open" / "index.html").is_file()
    assert not (site / "quiet").exists()
    assert "Quiet" not in (site / "index.html").read_text()


def test_a_public_folder_note_publishes_its_whole_subtree(tmp_path):
    """The other half of opt-in, and the one that surprises: saying `public`
    once at the root is a decision about every card below it."""
    docs = tmp_path / "docs"
    (docs / "deep").mkdir(parents=True)
    (docs / "index.hmd").write_text(PUBLIC + "# Home\n", encoding="utf-8")
    (docs / "deep" / "card.hmd").write_text("# Card\n", encoding="utf-8")

    assert (build(tmp_path, docs) / "deep" / "card" / "index.html").is_file()


def test_visibility_inherits_from_a_folder_note(tmp_path):
    """A folder is the unit an author publishes; a card may still opt out."""
    docs = tmp_path / "docs"
    (docs / "open").mkdir(parents=True)
    (docs / "index.hmd").write_text(PUBLIC + "# Home\n", encoding="utf-8")
    (docs / "open" / "index.hmd").write_text(PUBLIC + "# Open\n", encoding="utf-8")
    (docs / "open" / "child.hmd").write_text("# Child\n", encoding="utf-8")
    (docs / "open" / "secret.hmd").write_text(
        "---\nnav:\n  visibility: private\n---\n\n# Secret\n", encoding="utf-8"
    )

    site = build(tmp_path, docs)
    assert (site / "open" / "child" / "index.html").is_file()
    assert not (site / "open" / "secret").exists()


def test_a_link_to_an_unpublished_card_is_a_red_link(tmp_path):
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "index.hmd").write_text(PUBLIC + "# Home\n\n[[quiet]]\n", encoding="utf-8")
    (docs / "quiet.hmd").write_text(PRIVATE + "# Quiet\n", encoding="utf-8")

    html = (build(tmp_path, docs) / "index.html").read_text()
    assert 'class="hmd-redlink"' in html
    assert "is not published" in html
    assert 'href="../quiet/"' not in html


def test_an_embed_of_an_unpublished_card_does_not_inline_it(tmp_path):
    """The leak the gate exists to stop: expansion would copy the target's
    bytes into a page that ships."""
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "index.hmd").write_text(PUBLIC + "# Home\n\n![[quiet]]\n", encoding="utf-8")
    (docs / "quiet.hmd").write_text(
        PRIVATE + "# Quiet\n\nthe confidential sentence\n", encoding="utf-8"
    )

    html = (build(tmp_path, docs) / "index.html").read_text()
    assert "the confidential sentence" not in html
    assert 'class="hmd-redlink"' in html


# -- §4 plain markdown ---------------------------------------------------


def test_plain_markdown_builds_alongside_cards(tmp_path):
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "index.hmd").write_text(PUBLIC + "# Home\n\n[[plain]]\n", encoding="utf-8")
    (docs / "plain.md").write_text("# Plain\n\nordinary markdown\n", encoding="utf-8")

    site = build(tmp_path, docs)
    assert (site / "plain" / "index.html").is_file()
    # `.md` is invisible to the resolver, so a wikilink naming one stays red.
    assert 'class="hmd-redlink"' in (site / "index.html").read_text()


# -- §5 serving ----------------------------------------------------------


def test_serving_watches_the_namespace_root(tmp_path):
    """MkDocs watches its docs_dir; the namespace root may be elsewhere, and a
    `.hmd` edit that triggers no rebuild makes `mkdocs serve` quietly stale."""

    class StubServer:
        def __init__(self):
            self.watched = []

        def watch(self, path, *args, **kwargs):
            self.watched.append(path)

    config = _build_config(tmp_path, FIXTURE)
    mkdocs_build.build(config)
    server = StubServer()
    config.plugins["hypermarkdown"].on_serve(server, config=config, builder=None)
    assert server.watched == [str(FIXTURE)]


# -- a restricted namespace inside a larger site -------------------------


def _book_and_wiki(tmp_path: Path) -> Path:
    """A docs tree where only part of it is a namespace."""
    docs = tmp_path / "docs"
    (docs / "wiki").mkdir(parents=True)
    (docs / "index.md").write_text("# Book\n\n[the wiki](wiki/one.md)\n", encoding="utf-8")
    (docs / "wiki" / "one.hmd").write_text(
        PUBLIC + "# One\n\n[[two]]\n", encoding="utf-8")
    (docs / "wiki" / "two.hmd").write_text(
        PUBLIC + "# Two\n", encoding="utf-8")
    return docs


def test_the_namespace_may_be_a_subtree_of_the_site(tmp_path):
    """`docs_dir` covers the book; `root` restricts what `[[…]]` can reach."""
    docs = _book_and_wiki(tmp_path)
    site = build(tmp_path, docs, plugins=[{"hypermarkdown": {"root": str(docs / "wiki")}}])

    assert (site / "index.html").is_file()  # the book page, not a card
    assert (site / "wiki" / "one" / "index.html").is_file()
    # Links between cards stay correct under the prefix.
    assert 'href="../two/"' in (site / "wiki" / "one" / "index.html").read_text()


def test_a_book_page_is_not_a_link_target(tmp_path):
    """The book is outside the namespace, so a card cannot wikilink into it."""
    docs = _book_and_wiki(tmp_path)
    (docs / "wiki" / "one.hmd").write_text(
        PUBLIC + "# One\n\n[[index]]\n", encoding="utf-8")
    site = build(tmp_path, docs, plugins=[{"hypermarkdown": {"root": str(docs / "wiki")}}])
    assert 'class="hmd-redlink"' in (site / "wiki" / "one" / "index.html").read_text()


def test_the_placeholder_splices_the_wiki_into_an_authored_nav(tmp_path):
    docs = _book_and_wiki(tmp_path)
    site = build(
        tmp_path,
        docs,
        plugins=[{"hypermarkdown": {"root": str(docs / "wiki")}}],
        nav=[{"Home": "index.md"}, {"Wiki": ["hmd://wiki"]}],
    )
    html = (site / "index.html").read_text()
    assert "Wiki" in html and ">One<" in html and ">Two<" in html
    assert "hmd://wiki" not in html


def test_a_card_the_book_places_is_not_derived_again(tmp_path):
    """A card promoted into the book keeps that placement and does not come
    back inside the spliced section — MkDocs gives a page one parent, so a
    page listed twice renders the wrong section as its own (HMD-0002 §2)."""
    docs = _book_and_wiki(tmp_path)
    site = build(
        tmp_path,
        docs,
        plugins=[{"hypermarkdown": {"root": str(docs / "wiki")}}],
        nav=[{"Home": "index.md"}, {"One": "wiki/one.md"}, {"Wiki": ["hmd://wiki"]}],
    )
    html = (site / "wiki" / "two" / "index.html").read_text()

    # One nav entry, not two. `rel="prev"` is pagination rather than placement,
    # and this asserts on the rendered nav rather than on `config.nav`.
    entries = [
        tag for tag in re.findall(r'<a\b[^>]*href="\.\./one/"[^>]*>', html) if "rel=" not in tag
    ]
    assert len(entries) == 1
    assert ">Wiki<" in html


def test_an_authored_nav_without_the_placeholder_is_left_alone(tmp_path):
    docs = _book_and_wiki(tmp_path)
    site = build(
        tmp_path,
        docs,
        plugins=[{"hypermarkdown": {"root": str(docs / "wiki")}}],
        nav=[{"Home": "index.md"}],
    )
    html = (site / "index.html").read_text()
    assert ">One<" not in html
    # The cards still build; they are simply absent from the nav.
    assert (site / "wiki" / "one" / "index.html").is_file()


# -- issue 0002: ordinary links to cards ---------------------------------


def test_a_markdown_link_to_a_card_reaches_its_page(tmp_path):
    """A page outside the namespace cannot use `[[…]]`, so it writes the real
    path. The site does not serve `.hmd`, so the link has to be repointed."""
    docs = tmp_path / "docs"
    (docs / "wiki").mkdir(parents=True)
    (docs / "index.md").write_text("# Book\n\n[card](wiki/one.hmd)\n", encoding="utf-8")
    (docs / "wiki" / "one.hmd").write_text(
        PUBLIC + "# One\n", encoding="utf-8")

    site = build(tmp_path, docs, plugins=[{"hypermarkdown": {"root": str(docs / "wiki")}}])
    html = (site / "index.html").read_text()
    assert 'href="wiki/one/"' in html
    assert ".hmd" not in html


def test_a_card_path_inside_a_fence_is_left_alone(tmp_path):
    docs = tmp_path / "docs"
    (docs / "wiki").mkdir(parents=True)
    (docs / "index.md").write_text(
        "# Book\n\n```\nsee [card](wiki/one.hmd)\n```\n", encoding="utf-8"
    )
    (docs / "wiki" / "one.hmd").write_text(
        PUBLIC + "# One\n", encoding="utf-8")

    site = build(tmp_path, docs, plugins=[{"hypermarkdown": {"root": str(docs / "wiki")}}])
    assert "wiki/one.hmd" in (site / "index.html").read_text()


def test_a_link_to_a_missing_hmd_file_is_untouched(tmp_path):
    docs = tmp_path / "docs"
    (docs / "wiki").mkdir(parents=True)
    (docs / "index.md").write_text("# Book\n\n[gone](wiki/nope.hmd)\n", encoding="utf-8")
    (docs / "wiki" / "one.hmd").write_text(
        PUBLIC + "# One\n", encoding="utf-8")

    site = build(tmp_path, docs, plugins=[{"hypermarkdown": {"root": str(docs / "wiki")}}])
    assert "wiki/nope.hmd" in (site / "index.html").read_text()


def test_a_card_can_also_link_to_a_card_by_path(tmp_path):
    """Cards get the same treatment: the rewrite runs after expansion."""
    docs = tmp_path / "docs"
    (docs / "wiki").mkdir(parents=True)
    (docs / "index.md").write_text("# Book\n", encoding="utf-8")
    (docs / "wiki" / "one.hmd").write_text(
        PUBLIC + "# One\n\n[two](two.hmd)\n", encoding="utf-8")
    (docs / "wiki" / "two.hmd").write_text(
        PUBLIC + "# Two\n", encoding="utf-8")

    site = build(tmp_path, docs, plugins=[{"hypermarkdown": {"root": str(docs / "wiki")}}])
    assert 'href="../two/"' in (site / "wiki" / "one" / "index.html").read_text()


# -- issue 0010: a folder note's ordinary links ---------------------------


def _folder_note_docs(tmp_path: Path, note: str) -> Path:
    """A folder note at `learn/types/index.hmd`, with files around it to link.

    The note is registered as `learn/types.md`, one directory above the file,
    so every relative link in it is written against a directory MkDocs does
    not resolve it from.
    """
    docs = tmp_path / "docs"
    types = docs / "learn" / "types"
    types.mkdir(parents=True)
    (docs / "index.hmd").write_text(PUBLIC + "# Home\n", encoding="utf-8")
    (docs / "reference.md").write_text("# Reference\n", encoding="utf-8")
    (types / "index.hmd").write_text("# Types\n\n" + note, encoding="utf-8")
    (types / "bool.hmd").write_text(
        "# Bool\n\n## Values\n\n[notes](notes.md) ![chart](chart.png)\n", encoding="utf-8"
    )
    (types / "notes.md").write_text("# Notes\n", encoding="utf-8")
    (types / "chart.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    return docs


def test_a_folder_note_links_a_sibling_card_by_path(tmp_path):
    """The common case: code in the link text, which a wikilink cannot hold, so
    the link is an ordinary one. It was looked up one directory too high, found
    nothing, and reached the site as a link to an unserved source file."""
    docs = _folder_note_docs(tmp_path, "[`Bool`](bool.hmd) and [values](bool.hmd#values)\n")
    html = (build(tmp_path, docs, strict=True) / "learn" / "types" / "index.html").read_text()
    assert '<a href="bool/"><code>Bool</code></a>' in html
    assert 'href="bool/#values"' in html
    assert ".hmd" not in html


def test_a_folder_note_links_other_files_from_its_own_directory(tmp_path):
    """A plain page, an image, and a page two levels up: none is a card, and
    each still names the file it named in the repository. `strict` makes MkDocs
    fail the build on a link it cannot place."""
    docs = _folder_note_docs(
        tmp_path,
        "[notes](notes.md) ![chart](chart.png) [reference](../../reference.md)\n"
        '[titled](notes.md "A title") [section](notes.md#notes)\n',
    )
    html = (build(tmp_path, docs, strict=True) / "learn" / "types" / "index.html").read_text()
    assert 'href="notes/"' in html
    assert 'src="chart.png"' in html
    assert 'href="../../reference/"' in html
    assert 'title="A title" href="notes/"' in html or 'href="notes/" title="A title"' in html
    assert 'href="notes/#notes"' in html


def test_a_folder_note_reference_definition_moves_with_it(tmp_path):
    docs = _folder_note_docs(
        tmp_path,
        "[the card][bool] and [the notes][notes]\n\n[bool]: bool.hmd\n[notes]: notes.md\n",
    )
    html = (build(tmp_path, docs, strict=True) / "learn" / "types" / "index.html").read_text()
    assert 'href="bool/"' in html
    assert 'href="notes/"' in html


def test_a_folder_note_wikilink_is_moved_once(tmp_path):
    """A wikilink is rewritten for the registered page already. It goes through
    the same pass as the ordinary links, and must not be moved a second time."""
    docs = _folder_note_docs(tmp_path, "[[bool]], [[bool#Values]], and [[index]]\n")
    html = (build(tmp_path, docs, strict=True) / "learn" / "types" / "index.html").read_text()
    assert 'href="bool/"' in html
    assert 'href="bool/#values"' in html
    assert 'href="../.."' in html  # the site home, from `learn/types/`


def test_a_folder_note_keeps_what_is_not_a_relative_path(tmp_path):
    """A scheme link, a site-absolute path, a fragment on the same page, and a
    path quoted as code mean the same thing wherever the page is registered."""
    docs = _folder_note_docs(
        tmp_path,
        "[site](https://example.org/a/bool.hmd) [mail](mailto:a@example.org)\n"
        "[top](#types) `[quoted](bool.hmd)`\n\n"
        "```\n[fenced](notes.md)\n```\n\n"
        "A footnote.[^1]\n\n[^1]: notes.md is where the notes are.\n",
    )
    site = build(tmp_path, docs, markdown_extensions=["footnotes"])
    html = (site / "learn" / "types" / "index.html").read_text()
    assert 'href="https://example.org/a/bool.hmd"' in html
    assert 'href="mailto:a@example.org"' in html
    assert 'href="#types"' in html
    assert "[quoted](bool.hmd)" in html
    assert "[fenced](notes.md)" in html
    assert "notes.md is where the notes are." in html


def test_an_ordinary_card_keeps_its_links_as_written(tmp_path):
    """Only a folder note is registered away from its file. A card beside it is
    registered in its own directory, and its links are left alone."""
    docs = _folder_note_docs(tmp_path, "")
    html = (
        build(tmp_path, docs, strict=True) / "learn" / "types" / "bool" / "index.html"
    ).read_text()
    assert 'href="../notes/"' in html
    assert 'src="../chart.png"' in html


def test_a_folder_note_below_a_namespace_prefix(tmp_path):
    """The namespace as a subtree of the site: the folder note's directory is
    counted from `docs_dir`, so a link that leaves the namespace still lands."""
    docs = tmp_path / "docs"
    (docs / "wiki" / "area").mkdir(parents=True)
    (docs / "index.md").write_text("# Book\n", encoding="utf-8")
    (docs / "wiki" / "area" / "index.hmd").write_text(
        PUBLIC + "# Area\n\n[`one`](one.hmd) and [the book](../../index.md)\n", encoding="utf-8"
    )
    (docs / "wiki" / "area" / "one.hmd").write_text("# One\n", encoding="utf-8")

    site = build(
        tmp_path, docs, strict=True, plugins=[{"hypermarkdown": {"root": str(docs / "wiki")}}]
    )
    html = (site / "wiki" / "area" / "index.html").read_text()
    assert '<a href="one/"><code>one</code></a>' in html
    assert 'href="../.."' in html


@pytest.mark.parametrize(
    ("target", "directory", "expected"),
    [
        ("a/b/c.md", "a/b", "c.md"),
        ("a/c.md", "a/b", "../c.md"),
        ("c.md", "", "c.md"),
        ("../c.md", "a", "../../c.md"),
        ("a", "a", "."),
    ],
)
def test_relative_paths_are_pure_arithmetic(target, directory, expected):
    """No working directory in it: a target above `docs_dir` reads the same
    wherever the build is started from."""
    from hypermarkdown.mkdocs_plugin import _relative

    assert _relative(target, directory) == expected


# -- issue 0003: the toolchain renders code blocks ------------------------


def test_fenced_code_survives_the_build(tmp_path):
    """A dependency can break fences without failing the build — Pygments 2.20
    silently stopped pymdownx.superfences from matching any fence at all, and
    every code block on the site degraded to inline text. Assert the output, not
    the versions."""
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "index.hmd").write_text(
        PUBLIC + "# Home\n\n```yaml\nkey: value\n```\n", encoding="utf-8"
    )

    site = build(
        tmp_path,
        docs,
        markdown_extensions=["pymdownx.superfences", "toc", "tables"],
    )
    html = (site / "index.html").read_text()
    assert "<pre" in html, "fenced code rendered as inline text"
    # Highlighting splits the text into spans, so the literal line is not
    # contiguous — check the tokens survived, not the formatting.
    assert "key" in html and "value" in html


# -- diagrams, math, callouts in a build ---------------------------------


def _rich_docs(tmp_path: Path) -> Path:
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "index.hmd").write_text(
        PUBLIC + "# Home\n\n"
        '!!! note "Heads up"\n\n    a callout body\n\n'
        "Inline $x^2$ and display:\n\n$$\nE = mc^2\n$$\n\n"
        "```d2\na -> b\n```\n\n"
        "```python\nprint('not a diagram')\n```\n",
        encoding="utf-8",
    )
    return docs


def _rich_extensions() -> list:
    return [
        "admonition",
        "footnotes",
        "tables",
        "toc",
        {"pymdownx.arithmatex": {"generic": True}},
        "pymdownx.details",
        "pymdownx.superfences",
        {"pymdownx.tasklist": {"custom_checkbox": True}},
        "pymdownx.tilde",
    ]


def test_the_free_syntax_survives_the_build(tmp_path):
    """The tail of HMD-0001 §9 — strikethrough, tables, task lists — is claimed
    by the Rich content page and was never gated. Issue 0005: the page quoted
    `~~strikethrough~~` inside backticks, so it rendered as its own source and
    read as a broken extension. Assert the output, as issue 0003 does."""
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "index.hmd").write_text(
        PUBLIC + "# Home\n\n"
        "plain ~~struck~~ text\n\n"
        "| a | b |\n| --- | --- |\n| 1 | 2 |\n\n"
        "- [x] done\n- [ ] todo\n",
        encoding="utf-8",
    )

    site = build(tmp_path, docs, markdown_extensions=_rich_extensions())
    html = (site / "index.html").read_text()
    assert "<del>struck</del>" in html, "strikethrough rendered as its own source"
    assert "<table" in html
    assert "task-list" in html


def test_callouts_and_math_survive_the_build(tmp_path):
    site = build(tmp_path, _rich_docs(tmp_path), markdown_extensions=_rich_extensions())
    html = (site / "index.html").read_text()
    assert 'class="admonition note"' in html
    assert "a callout body" in html
    # Arithmatex marks the spans; MathJax typesets them in the browser.
    assert html.count('class="arithmatex"') >= 2


def test_a_d2_fence_becomes_a_diagram_and_other_fences_do_not(tmp_path):
    site = build(tmp_path, _rich_docs(tmp_path), markdown_extensions=_rich_extensions())
    html = (site / "index.html").read_text()
    assert "hmd-diagram" in html
    assert "not a diagram" in html and "<pre" in html  # the python fence is code


def test_diagrams_can_be_switched_off(tmp_path):
    site = build(
        tmp_path,
        _rich_docs(tmp_path),
        plugins=[{"hypermarkdown": {"diagrams": False}}],
        markdown_extensions=_rich_extensions(),
    )
    assert "hmd-diagram" not in (site / "index.html").read_text()


def test_an_embedded_diagram_renders_in_the_host_page(tmp_path):
    """Diagrams run after expansion, so a diagram embedded from another card
    renders like one written here."""
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "index.hmd").write_text(PUBLIC + "# Home\n\n![[chart]]\n", encoding="utf-8")
    (docs / "chart.hmd").write_text("# Chart\n\n```d2\na -> b\n```\n", encoding="utf-8")

    site = build(tmp_path, docs, markdown_extensions=_rich_extensions())
    assert "hmd-diagram" in (site / "index.html").read_text()
