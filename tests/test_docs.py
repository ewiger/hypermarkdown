"""Checks on the project's own documentation — its prose sources, and the site
its own `mkdocs.yml` builds.

Most of these gate authored content rather than rendered output. Issue 0003 and
issue 0005 both needed the opposite — assert the HTML, because the defect was
produced by the toolchain. Issue 0006 is authored: the renderer is correct and
will not change, so the source is the right place to catch it.

The branding test at the bottom is of the first kind and belongs here rather
than in `test_mkdocs.py`, which builds synthetic fixtures: the logo, the palette,
and the hero are settings in *this repository's* `mkdocs.yml`, so only a build
of the real site can tell whether they reached a page.
"""

import re
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parent.parent

# A code span, and the escape the table forces. These are two patterns rather
# than one because a single `[^`]*\|[^`]*` is free to start matching at a
# *closing* backtick, which makes the gap between two spans look like the inside
# of one: `` `a` \| `b` `` renders as a bare pipe and is not the defect. Pairing
# the spans left to right the way markdown pairs them, then testing each body,
# is what tells the two apart.
CODE_SPAN = re.compile(r"`[^`\n]+`")
ESCAPED_PIPE = re.compile(r"\\\|")
FENCE = re.compile(r"^\s*(```|~~~)")


def _prose_sources() -> list[Path]:
    """Tracked *and* new-but-not-ignored files.

    `git ls-files` alone lists only what is already committed, which makes a
    guard blind to the file being written — the case it most needs to catch.
    `--exclude-standard` keeps `.gitignore` honoured, so `site/` stays out.

    The index also names files that are no longer on disk: a file moved with
    `mv` rather than `git mv` stays cached at its old path until the deletion
    is staged. Those are dropped, because a path with no bytes behind it has no
    prose to check — reading it would turn every in-progress move into a
    `FileNotFoundError` from a guard that is about content.
    """
    out = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "*.md", "*.hmd"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()
    # .grem/ is dormant control data the project does not maintain.
    paths = {ROOT / p for p in out if not p.startswith(".grem/")}
    return sorted(p for p in paths if p.is_file())


def _offending_lines(text: str):
    """Table rows carrying the defect, with fenced blocks masked.

    Two narrowings, both load-bearing. Only a **table row** is a defect: a pipe
    has to be escaped in a table cell and nowhere else, so `` `\\|` `` in
    running prose is an author quoting the sequence deliberately — issue 0006's
    own title does exactly that. And a fenced block is a quotation too, which is
    how an issue shows the broken syntax without tripping the check that exists
    because of it.
    """
    in_fence = False
    for lineno, line in enumerate(text.splitlines(), start=1):
        if FENCE.match(line):
            in_fence = not in_fence
            continue
        if in_fence or not line.lstrip().startswith("|"):
            continue
        if any(ESCAPED_PIPE.search(span.group()) for span in CODE_SPAN.finditer(line)):
            yield lineno, line.strip()


def test_no_escaped_pipe_inside_a_table_code_span():
    offenders = [
        f"{path.relative_to(ROOT)}:{lineno}: {line}"
        for path in _prose_sources()
        for lineno, line in _offending_lines(path.read_text(encoding="utf-8"))
    ]

    assert not offenders, (
        "a table cell cannot escape a pipe inside a code span — the table needs"
        " the backslash and the code span shows it (issue 0006). Write the cell"
        " as raw <code>…&#124;…</code> instead:\n  " + "\n  ".join(offenders)
    )


def test_the_guard_catches_the_original_defect_and_nothing_else():
    """Pin the three judgement calls, so a rewrite of the pattern stays honest."""
    defect = r"| `[[page\|display text]]` | the same link |"
    assert list(_offending_lines(defect))

    # The accepted fix.
    assert not list(
        _offending_lines("| <code>[[page&#124;display text]]</code> | the same link |")
    )
    # Prose quoting the sequence — issue 0006's own title.
    assert not list(_offending_lines(r"# `\|` inside a table code span"))
    # A fenced block showing the defect on purpose.
    assert not list(_offending_lines("```markdown\n" + defect + "\n```"))


#: The sentence the language specification opens with, which is the only place the
#: language's version is declared. A second literal in a config file or a `VERSION`
#: would be a number free to disagree with the document that defines the format.
SPEC_VERSION = re.compile(r"specifies HyperMarkDown (\d+(?:\.\d+)*)")


def test_the_language_version_has_a_changelog_section():
    """The root changelog is the *language's*, and its top section is the version
    the spec card claims.

    This is the counterpart of `tools/hmd/tests/test_cli.py`, which makes the same
    check for the Python tool against `tools/hmd/CHANGELOG.md`. Four things version
    independently here — the language and three tools — and the failure this
    prevents is the quiet one: a construct changes, the card is bumped, and the
    history of what changed is nowhere.
    """
    card = (ROOT / "doc" / "wiki" / "hmd-lang-spec.hmd").read_text(encoding="utf-8")
    match = SPEC_VERSION.search(card)
    assert match is not None, (
        "hmd-lang-spec.hmd no longer says which version of the language it"
        " specifies; that sentence is the version's only declaration"
    )
    version = match.group(1)

    changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    assert re.search(rf"^## \[{re.escape(version)}\]", changelog, re.M), (
        f"the spec card specifies HyperMarkDown {version}, and CHANGELOG.md has"
        f" no `## [{version}]` section. A language version is the specification"
        " plus the record of what it changed."
    )

    # The README's `spec` badge is the one other place the number is written out,
    # and a shields.io URL is exactly the kind of literal nobody thinks to bump.
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert f"/badge/spec-{version}-" in readme, (
        f"the spec card specifies HyperMarkDown {version}, and README.md's `spec`"
        " badge says something else. Either bump the badge or drop it — the card's"
        " opening sentence is the declaration, the badge only repeats it."
    )


@pytest.fixture(scope="module")
def built_site(tmp_path_factory) -> Path:
    """The real site, built from the repository's own `mkdocs.yml`.

    Built into a temporary directory rather than `site/`, so running the suite
    never clobbers whatever a `mkdocs serve` is holding.
    """
    if shutil.which("mkdocs") is None:
        pytest.skip("mkdocs is not installed; the site extra is optional")

    out = tmp_path_factory.mktemp("site")
    subprocess.run(
        ["mkdocs", "build", "--strict", "--site-dir", str(out)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return out


@pytest.fixture(scope="module")
def built_home(built_site: Path) -> str:
    """The real site's home page. Most checks here only need this one page."""
    return (built_site / "index.html").read_text(encoding="utf-8")


def _tabs(home: str) -> str:
    """The top-bar nav, which is where a visitor meets the site's structure."""
    match = re.search(r'<nav class="md-tabs".*?</nav>', home, re.S)
    assert match is not None, "the theme emitted no tab bar"
    return match.group(0)


def _drawer(home: str) -> str:
    """The whole nav tree. `navigation.tabs` lifts the sidebar to show only the
    open tab's pages, but the primary nav is still rendered in full for the
    drawer — which is the only place one page can see every section's entries.
    It ends where the page's own table of contents is nested into it."""
    start = home.find('<nav class="md-nav md-nav--primary')
    end = home.rfind('<nav class="md-nav md-nav--secondary')
    assert start != -1 and end > start, "the theme emitted no primary nav"
    return home[start:end]


def test_the_top_bar_offers_the_language_specification(built_home):
    """The site's headline deliverable is the specification of the *language*,
    so the top bar has to reach it rather than leave it a row in the wiki
    section.

    It is the first page of the `Language` section, and a section tab takes its
    href from the first page beneath it — so the tab reads `Language` and leads
    here. The href is asserted in the tab bar and the title in the tree, because
    the two fail separately: regrouping the nav moves the href, while the title
    is lost to MkDocs building a page's `Page` from its **first** nav appearance
    and silently discarding any title given at a later one.
    """
    tab = re.search(r'<a href="wiki/hmd-lang-spec/"[^>]*>', _tabs(built_home))
    assert tab is not None, "the top bar no longer reaches the specification"

    entry = re.search(
        r'<a href="wiki/hmd-lang-spec/"[^>]*>(.*?)</a>', _drawer(built_home), re.S
    )
    assert entry is not None, "the nav has no language specification entry"
    assert "Language Specification" in re.sub(r"<[^>]+>", "", entry.group(1))


def test_the_top_bar_does_not_advertise_the_internal_proposals(built_home):
    """The numbered proposals specify the *tools*, not the format. They had a
    "Specifications" tab, which promised a visitor the language's specification
    and delivered implementation notes instead."""
    tabs = _tabs(built_home)
    assert "proposals/" not in tabs, "an HMD-NNNN proposal is back in the top bar"


def test_the_proposals_are_unlisted_but_still_published(built_site: Path):
    """`not_in_nav`, not `exclude_docs`. The cover, the public chapters, and
    several wiki cards link to the proposals with ordinary relative links; under
    `validation.links.not_found: info` those would rot into 404s that no gate
    reports. Unlisted and reachable is the state that costs nothing."""
    for number in ("HMD-0001", "HMD-0002", "HMD-0003", "HMD-0004"):
        assert (built_site / "proposals" / number / "index.html").is_file(), (
            f"{number} stopped being published; links to it now 404 silently"
        )


def test_the_bolt_reaches_the_page_as_a_logo_and_a_favicon(built_home):
    """The mark is the README's `⚡`, shipped as an asset rather than a glyph.

    Asserting the HTML and not `mkdocs.yml` is the standing lesson of issues
    0003 and 0005: a green build is not evidence of correct output. A logo path
    that is merely *set* proves nothing — `--strict` would catch a missing file,
    but not a theme that stopped emitting the tag.
    """
    assert 'src="wiki/assets/logo.svg"' in built_home, "no logo in the header"
    assert 'href="wiki/assets/favicon.svg"' in built_home, "no favicon"

    # Both SVGs carry an explicit fill, and neither may use `currentColor`.
    # Material references the logo as `<img src=…>`, not as inline markup, and
    # an externally-referenced SVG is an isolated document: there is no parent
    # to inherit from, so `currentColor` resolves to the initial black and the
    # bolt disappears against the near-black header. Material's own
    # `.md-logo img { fill: currentcolor }` cannot help — `fill` does nothing
    # to an `<img>` element. A favicon has no inherited color either.
    for name in ("logo.svg", "favicon.svg"):
        svg = (ROOT / "doc" / "wiki" / "assets" / name).read_text(encoding="utf-8")
        assert "currentColor" not in svg, (
            f"{name} is referenced as <img>, which inherits no color —"
            " currentColor renders it black on a black header"
        )
        assert 'fill="#' in svg, f"{name} needs an explicit fill"


def test_the_cover_renders_its_hero(built_home):
    """`attr_list` is what puts the class on the heading; without the extension
    the marker degrades to literal `{ .hmd-hero }` text on the page."""
    assert 'class="hmd-hero"' in built_home
    assert "{ .hmd-hero }" not in built_home, "attr_list is not enabled"


def test_the_site_names_its_repository(built_home):
    assert "ewiger/hypermarkdown" in built_home
    # `extra.generator: false` leaves the project's own license line alone in
    # the footer.
    assert "Made with" not in built_home


# -- two licenses --------------------------------------------------------
#
# The code is MIT; everything under `doc/` is CC BY 4.0. Five files carry that
# claim and all five have to agree — the shape that rots the first time one of
# them is edited alone.

#: The MIT files: the root, plus one byte-identical copy per distributable
#: tool. Each of those copies ships *inside* an artifact — the wheel and sdist,
#: the npm tarball's `files`, the VSIX — where nothing else from this
#: repository is present.
MIT_LICENSES = (
    "LICENSE",
    "tools/hmd/LICENSE",
    "tools/hmd-ts-core/LICENSE",
    "tools/hmd-vsc-ext/LICENSE",
)

CONTRIBUTORS_URL = (
    "https://github.com/ewiger/hypermarkdown/blob/main/CONTRIBUTORS.md"
)

#: The one copyright line, in every license file.
#:
#: It is folded onto a single line rather than split across two, and that is
#: load-bearing rather than cosmetic. GitHub identifies a license with
#: `licensee`, which strips lines beginning with a copyright symbol and then
#: scores what remains against the canonical text by word overlap, at a 98%
#: threshold. A holder's name costs nothing because the whole line is stripped
#: — but a note on a line of its own is *not* stripped, and adds a dozen novel
#: words to a 93-word set. Measured: 93.9%, which is GitHub reporting no
#: detected license at all. Keep the note on this line.
COPYRIGHT_LINE = (
    "Copyright (c) 2026 HyperMarkDown Contributors —"
    f" see {CONTRIBUTORS_URL} for full attribution."
)

#: Any line opening a copyright claim, whoever it names. `licensee` strips by
#: roughly this shape, which is why every one of them has to be
#: `COPYRIGHT_LINE`. The year is required rather than optional: CC BY's
#: legalcode wraps its prose onto lines that begin with the bare word
#: "copyright", and those are sentences rather than claims.
COPYRIGHT_CLAIM = re.compile(
    r"^\s*copyright\s*(?:\(c\)|©)?\s*\d{4}.*$", re.I | re.M
)


def test_every_license_names_the_contributors():
    """One holder, named once, in all five license files.

    A personal name in a copyright line gets less true with every merged pull
    request, and the alternative to fixing that early is renegotiating it file
    by file later. `CONTRIBUTORS.md` is the list; the license files point at it
    by absolute URL because the three packaged copies travel without it.
    """
    for rel in (*MIT_LICENSES, "LICENSE-DOCS"):
        path = ROOT / rel
        assert path.is_file(), f"{rel} is missing"
        text = path.read_text(encoding="utf-8")

        claims = COPYRIGHT_CLAIM.findall(text)
        assert claims, f"{rel} makes no copyright claim"
        offenders = [c.strip() for c in claims if c.strip() != COPYRIGHT_LINE]
        assert not offenders, (
            f"{rel} carries a copyright line that is not the project's."
            " Every license file names `HyperMarkDown Contributors` and links"
            f" {CONTRIBUTORS_URL}, on one line — see COPYRIGHT_LINE above for"
            f" why the line may not be split:\n  " + "\n  ".join(offenders)
        )

    # The four MIT files are copies, not variations. A tool whose license has
    # drifted is a tool shipping different terms than the repository claims.
    digests = {(ROOT / rel).read_bytes() for rel in MIT_LICENSES}
    assert len(digests) == 1, (
        "the MIT license files have diverged; they are byte-identical copies of"
        f" the root LICENSE, one per tool: {', '.join(MIT_LICENSES)}"
    )

    # The URL those five files point at has to resolve to something.
    assert (ROOT / "CONTRIBUTORS.md").is_file(), (
        f"every license file links {CONTRIBUTORS_URL}, and CONTRIBUTORS.md is"
        " not there — the link is dead in three published artifacts"
    )


def test_the_documentation_is_cc_by_4():
    """`doc/` is CC BY 4.0: the book, the wiki, the language specification, and
    the proposals. The corpus under `examples/` deliberately is *not* — it gets
    vendored into other implementations, and an attribution clause on fixture
    data is friction with no upside.

    The legalcode is asserted section by section rather than by length. A
    truncated paste is the failure that looks fine: the header still says CC BY
    4.0, and the terms that were actually granted are gone.
    """
    text = (ROOT / "LICENSE-DOCS").read_text(encoding="utf-8")
    assert "Attribution 4.0 International" in text
    assert "doc/" in text, "LICENSE-DOCS does not say what it covers"
    sections = re.findall(r"^Section \d+ -- ", text, re.M)
    assert len(sections) == 8, (
        f"the CC BY 4.0 legalcode has 8 sections, LICENSE-DOCS has"
        f" {len(sections)} — it was truncated somewhere in the paste"
    )

    # Both files have to be reachable from the front page, or the split is a
    # claim only someone already looking for it will find.
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    for target in ("LICENSE-DOCS", "CONTRIBUTORS.md"):
        assert f"({target})" in readme, f"README.md does not link {target}"


def test_the_footer_states_both_licenses(built_site: Path):
    """The site *is* `doc/`, so every page on it is CC BY 4.0 while the tools it
    documents are MIT. A reader quoting the specification needs both terms on
    the page they are quoting from.

    Terms alone are not attribution, so the footer also carries the notice: the
    same holder and year as the five license files, linking the same
    `CONTRIBUTORS.md`. That makes the footer a sixth place stating the claim,
    which is why the year is asserted here rather than left to a template.

    Asserted on the built markup, and on a deep page as well as the cover, for
    the standing reason: `custom_dir` is a setting. A typo in the directory
    name, or a Material upgrade that renames `partials/copyright.html`, leaves
    `--strict` green and the claim silently absent from every page.
    """
    for page in ("index.html", "wiki/hmd-lang-spec/index.html"):
        html = (built_site / page).read_text(encoding="utf-8")
        match = re.search(r'<footer class="md-footer".*?</footer>', html, re.S)
        assert match is not None, f"{page} has no footer"
        footer = match.group(0)

        for claim in (
            "© 2026",
            ">HyperMarkDown Contributors</a>",
            CONTRIBUTORS_URL,
            ">MIT</a>",
            "blob/main/LICENSE",
            ">CC BY 4.0</a>",
            "creativecommons.org/licenses/by/4.0/",
        ):
            assert claim in footer, (
                f"{page} footer is missing {claim!r} — check"
                " `overrides/partials/copyright.html` still shadows the theme's"
            )


# -- being found ---------------------------------------------------------
#
# Two files a search engine reads before it reads a page. Both are asserted
# against the *built* site for the reason issues 0003 and 0005 established: a
# setting that is merely present in `mkdocs.yml` is not evidence that anything
# reached the output.


def _site_url() -> str:
    config = yaml.safe_load((ROOT / "mkdocs.yml").read_text(encoding="utf-8"))
    return config["site_url"]


def test_the_sitemap_lists_the_site_by_absolute_url(built_site: Path):
    """MkDocs emits `sitemap.xml` itself, from `site_url`.

    Which is the whole reason this is a guard and not a plugin — but it fails
    quietly in a specific way. Drop `site_url` and the build stays green under
    `--strict`, every page still renders, and the sitemap degrades to bare paths
    that no crawler can resolve. Nothing on the site looks wrong; it just stops
    being indexable. So the assertion is on the scheme and host of every `<loc>`,
    not on the file existing.
    """
    sitemap = built_site / "sitemap.xml"
    assert sitemap.is_file(), "MkDocs published no sitemap"

    site_url = _site_url()
    locs = re.findall(r"<loc>(.*?)</loc>", sitemap.read_text(encoding="utf-8"))
    assert locs, "the sitemap is empty"
    offenders = [loc for loc in locs if not loc.startswith(site_url)]
    assert not offenders, (
        f"{len(offenders)} sitemap entries are not under {site_url}, starting with"
        f" {offenders[0]!r} — `site_url` is unset or has drifted"
    )

    # The two pages the site exists to be found by. A published card that stops
    # reaching the sitemap is invisible to search while looking perfectly fine.
    for page in ("wiki/hmd-tutorial/", "wiki/hmd-lang-spec/"):
        assert f"{site_url}{page}" in locs, f"{page} is missing from the sitemap"


def test_robots_txt_hands_a_crawler_the_sitemap(built_site: Path):
    """`doc/robots.txt` is copied to the site root as a static file.

    The `Sitemap:` directive has to carry an absolute URL, so it repeats
    `site_url` and can go stale on a domain move without anything failing —
    a crawler would fetch the old host, get nothing, and index whatever it could
    find by following links instead. Tying the two together here is what makes
    that a red test rather than a slow decline in coverage.
    """
    robots = built_site / "robots.txt"
    assert robots.is_file(), (
        "robots.txt did not reach the site root; MkDocs copies it from `doc/`,"
        " so check it has not been caught by `exclude_docs`"
    )

    text = robots.read_text(encoding="utf-8")
    assert f"Sitemap: {_site_url()}sitemap.xml" in text, (
        "robots.txt names a different sitemap URL than `site_url` in mkdocs.yml"
    )
    # A stray `Disallow: /` here would deindex the entire site, silently.
    assert not re.search(r"^\s*Disallow:\s*/\s*$", text, re.M), (
        "robots.txt disallows the whole site"
    )


# -- one name ------------------------------------------------------------

#: Files permitted to still contain the retired spelling, each for a stated
#: reason. Anything else is a leftover from the 2026-08-10 rename (HMD-0005).
RETIRED_NAME_ALLOWED = {
    # The compatibility alias itself, and the prose explaining why it exists.
    "tools/hmd/pyproject.toml",
    # The two wheel smoke tests, which assert that alias still resolves.
    ".github/workflows/ci.yml",
    ".github/workflows/release.yml",
    # Records of what happened, which re-spelling would make false: release
    # entries naming the install line a release actually shipped with, the
    # decision memos, and the rename proposal, which necessarily names both.
    "CHANGELOG.md",
    "tools/hmd/CHANGELOG.md",
    "tools/hmd-vsc-ext/CHANGELOG.md",
    ".github/workflows/release-vsc-ext.yml",
    "doc/memory/decisions.md",
    "doc/memory/2026-08-06-typescript-editor-line.md",
    "doc/memory/2026-08-10-hypermarkdown-identity.md",
    # The trackers for the Python line and the site, which carry the rows about
    # the retired domain and the PyPI project left abandoned under it: what is
    # broken and what is deliberately not being fixed are both named by the old
    # spelling, because that is the thing they are about.
    "doc/status/hmd.md",
    "doc/status/pages.md",
    # Names the retired VS Marketplace publisher, which is deliberately kept
    # registered and unused: a publisher name returned to the pool is one an
    # impostor can publish under. The setup table has to say which one that is.
    "tools/hmd-vsc-ext/DEVELOP.md",
    "doc/proposals/HMD-0005/README.md",
    # This guard names the thing it forbids.
    "tests/test_docs.py",
}

#: Both retired spellings: the hyphenated display name and the old import
#: package. Case-insensitive, so `Hyper-Markdown` is caught too.
RETIRED_NAME = re.compile(r"hyper[-_]markdown", re.I)

#: Where the name could hide. Prose is the bulk of it, but a badge URL lives in
#: JSON, an install line in TOML or YAML, and a provenance comment in
#: TypeScript — and those are the ones no reader re-reads.
NAMED_SUFFIXES = {".md", ".hmd", ".toml", ".json", ".yml", ".yaml", ".py", ".ts", ".txt"}


def _named_sources() -> list[Path]:
    """Every tracked text file the name could be written into.

    Built the same way `_prose_sources` is, and for the same reason: the index
    alone is blind to the file currently being written, and names paths whose
    bytes have already moved.
    """
    out = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()
    paths = {
        ROOT / p
        for p in out
        # .grem/ is dormant control data the project does not maintain, and the
        # npm lockfile is generated.
        if not p.startswith(".grem/") and p != "package-lock.json"
        and Path(p).suffix in NAMED_SUFFIXES
    }
    return sorted(p for p in paths if p.is_file())


def test_the_retired_name_is_gone():
    """The project is `hypermarkdown` / HyperMarkDown everywhere it is not a
    quotation.

    A rename leaves survivors in exactly the places nobody re-reads — a badge
    URL, a doc comment, a keyword list — and each one is a dead link or a wrong
    install line rather than a cosmetic blemish. The allowlist above is the
    complete set of places the old name is still *true*, so a new occurrence
    anywhere else fails here rather than being found by a reader.
    """
    offenders = []
    for path in _named_sources():
        rel = path.relative_to(ROOT).as_posix()
        if rel in RETIRED_NAME_ALLOWED:
            continue
        for number, line in enumerate(
            path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            if RETIRED_NAME.search(line):
                offenders.append(f"{rel}:{number}: {line.strip()}")

    assert not offenders, (
        f"{len(offenders)} occurrences of the retired name survive the rename"
        " (HMD-0005). Either fix them, or add the file to"
        " `RETIRED_NAME_ALLOWED` with a reason:\n  " + "\n  ".join(offenders[:20])
    )
