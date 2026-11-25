"""The rules for how a GitHub release reads, held to the workflows that cut them.

Six tools release from this repository, and their releases share one page. The
rules (a platform-first title, one tool holding the Latest badge, a body opening
with an install line) live in `scripts/release.py`. These tests check that every
workflow that cuts a release goes through that script, and that the script
gives each tool its own title.
"""

import importlib.util
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
WORKFLOWS = ROOT / ".github" / "workflows"

spec = importlib.util.spec_from_file_location("release", ROOT / "scripts" / "release.py")
release = importlib.util.module_from_spec(spec)
# `@dataclass` looks its module up by name while the class is being built.
sys.modules["release"] = release
spec.loader.exec_module(release)


def _cutting_workflows() -> list[Path]:
    return [p for p in sorted(WORKFLOWS.glob("*.yml")) if "gh release create" in p.read_text()]


def test_every_tool_has_a_workflow_that_cuts_its_release():
    assert len(_cutting_workflows()) == len(release.TOOLS)


@pytest.mark.parametrize("workflow", _cutting_workflows(), ids=lambda p: p.name)
def test_the_workflow_takes_title_latest_and_notes_from_the_script(workflow):
    text = workflow.read_text()
    for command in ("title", "latest", "notes"):
        assert f"scripts/release.py {command}" in text, f"{workflow.name} does not use release.py {command}"
    # A literal title in the workflow is the drift this guard exists to stop.
    assert not re.search(r'--title\s+"(?!\$\(python3 scripts/release\.py title)', text)


@pytest.mark.parametrize(
    ("tag", "title", "latest"),
    [
        ("v0.1.1", "PyPI · hyper-markdown 0.1.1", False),
        ("v0.3.1", "PyPI · hypermarkdown 0.3.1", False),
        ("ts-core-v0.2.0", "npm · @hypermarkdown/core 0.2.0", False),
        ("rs-core-v0.2.0", "crates.io · hypermarkdown 0.2.0", False),
        ("lsp-v0.1.0", "Binary · hmd-lsp 0.1.0", False),
        ("vsc-ext-v0.4.4", "VS Code · HyperMarkDown 0.4.4", True),
    ],
)
def test_a_tag_names_its_tool(tag, title, latest):
    assert release.title(tag) == title
    assert release.tool_for(tag)[0].latest is latest


def test_exactly_one_tool_holds_the_latest_badge():
    assert [t.platform for t in release.TOOLS if t.latest] == ["VS Code"]


def test_a_foreign_tag_is_refused():
    with pytest.raises(SystemExit):
        release.title("nightly")


def test_notes_open_with_the_header_and_carry_the_changelog_section():
    notes = release.with_header("v0.3.1", release.section("v0.3.1"))
    assert notes.startswith(release.HEADER_MARK)
    assert "`pip install hypermarkdown==0.3.1`" in notes
    assert "### Fixed" in notes
    # Rewriting is idempotent: an existing header is replaced, not stacked.
    assert release.with_header("v0.3.1", notes) == notes


def test_the_language_server_is_built_for_every_platform_the_toolchain_serves():
    """The toolchain carries the server beside `d2`, so the two lists agree.

    A platform the toolchain serves and this workflow does not build is a
    VSIX with no language server in it, found only when a user opens one.
    """
    import json

    workflow = (WORKFLOWS / "release-lsp.yml").read_text()
    built = re.findall(r"^\s+- platform: (\S+)$", workflow, re.M)
    served = json.loads((ROOT / "toolchain.json").read_text())["archives"]
    assert sorted(built) == sorted(served)
    # The release job refuses to cut a release with an archive missing, and
    # the number it counts to is the number of platforms.
    assert f'"$count" -ne {len(built)}' in workflow


def test_the_language_server_workflow_fires_on_its_own_tags_only():
    workflow = (WORKFLOWS / "release-lsp.yml").read_text()
    assert 'tags: ["lsp-v[0-9]*"]' in workflow
    # No other workflow's pattern matches an `lsp-v` tag.
    import fnmatch

    for other in sorted(WORKFLOWS.glob("release*.yml")):
        if other.name == "release-lsp.yml":
            continue
        for pattern in re.findall(r'tags: \["([^"]+)"\]', other.read_text()):
            assert not fnmatch.fnmatchcase("lsp-v0.1.0", pattern), other.name


def test_the_language_server_is_published_through_a_trusted_publisher():
    """crates.io accepts the publish only from this workflow and environment.

    The trusted publisher on the crate names the workflow file and the
    environment. A job that publishes from another environment, or with a
    stored token, is refused or is a secret nobody rotates.
    """
    workflow = (WORKFLOWS / "release-lsp.yml").read_text()
    job = workflow[workflow.index("  crates-io:") : workflow.index("  github-release:")]
    assert "name: crates-io" in job
    assert "id-token: write" in job
    assert "rust-lang/crates-io-auth-action" in job
    # No stored token anywhere in the workflow, in an expression that reads one.
    assert "${{ secrets." not in workflow
    # Nothing is published from a manual run, or before every platform built.
    assert "startsWith(github.ref, 'refs/tags/lsp-v')" in job
    assert "needs: build" in job
