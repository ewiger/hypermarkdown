"""The conformance corpus, run against the canonical implementation.

Every case under `examples/conformance/cases/` was generated from this
implementation, so this runner checks that it still produces what it once
wrote: a change in canonical behaviour shows up here as a diff to review and
regenerate, rather than first as a TypeScript failure. The TypeScript runner
is `tools/hmd-ts-core/test/corpus.test.ts`, and both build the same
`{diagnostics, resolutions}` shape.

A case's `config.toml` sits beside its `tree/`, not inside it, so the tree is
copied under a fresh project root with that file as its `.hmd/config.toml`.
A tree may carry markers of its own further down; those are part of the case.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from hypermarkdown import config
from hypermarkdown.config import CONFIG_NAME, MARKER_DIR
from hypermarkdown.lint.rules import check
from hypermarkdown.resolve import Workspace

# `tools/hmd/tests` → `tools/hmd` → `tools` → the repository.
CASES = Path(__file__).resolve().parents[3] / "examples" / "conformance" / "cases"
NAMES = sorted(p.name for p in CASES.iterdir() if p.is_dir())


def run_case(case: Path, scratch: Path) -> dict:
    root = scratch / "project"
    shutil.copytree(case / "tree", root)
    case_config = case / CONFIG_NAME
    if case_config.is_file():
        (root / MARKER_DIR).mkdir()
        shutil.copy(case_config, root / MARKER_DIR / CONFIG_NAME)

    workspace = Workspace(config.load(root_override=root))
    diagnostics = [d.to_dict() for d in check(workspace)]

    resolutions = []
    for path in workspace.pages():
        for link in workspace.documents[path].links:
            target = workspace.resolve(path, link.page_ref).path
            resolutions.append(
                {
                    "raw": link.raw,
                    "source": workspace.rel(path),
                    "target": workspace.rel(target) if target else None,
                }
            )
    resolutions.sort(key=lambda r: (r["source"], r["raw"], r["target"] or ""))
    return {"diagnostics": diagnostics, "resolutions": resolutions}


def test_the_corpus_has_cases():
    assert NAMES


@pytest.mark.parametrize("name", NAMES)
def test_case(name, tmp_path):
    expected = json.loads((CASES / name / "expected.json").read_text(encoding="utf-8"))
    assert run_case(CASES / name, tmp_path) == expected
