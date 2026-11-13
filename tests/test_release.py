"""The rules for how a GitHub release reads, held to the workflows that cut them.

Three tools release from this repository, and their releases share one page. The
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
