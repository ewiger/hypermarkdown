"""The conformance corpus, run against the canonical implementation.

Every case under `examples/conformance/cases/` was generated from this
implementation, so this runner checks that it still produces what it once
wrote: a change in canonical behaviour shows up here as a diff to review and
regenerate, rather than first as a TypeScript failure. The TypeScript runner
is `tools/hmd-ts-core/test/corpus.test.ts`, and both build the same
`{diagnostics, resolutions}` shape. A case that holds addresses of more than
one step (HMD-0006) also carries `addresses`: where each one landed in its
target, as a byte span with its text and digest, or the rule it failed on.

A case's `config.toml` sits beside its `tree/`, not inside it, so the tree is
copied under a fresh project root with that file as its `.hmd/config.toml`.
A tree may carry markers of its own further down; those are part of the case.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from hypermarkdown import address as address_mod
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
    addresses = []
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
            if link.fragment_kind == "address":
                addresses.append(_address(workspace, path, link, target))
    resolutions.sort(key=lambda r: (r["source"], r["raw"], r["target"] or ""))
    out = {"diagnostics": diagnostics, "resolutions": resolutions}
    if addresses:
        addresses.sort(key=lambda a: (a["source"], a["raw"]))
        out["addresses"] = addresses
    return out


def _address(workspace, path, link, target) -> dict:
    """Where one address landed: a span of its target, or the rule it failed."""
    entry = {"raw": link.raw, "source": workspace.rel(path)}
    if link.address is None:
        return {**entry, "rule": "HMD019"}
    document = workspace.documents.get(target) if target else None
    if document is None:
        return {**entry, "rule": "HMD001"}
    result = address_mod.resolve(document, link.address, workspace.rel(target))
    if result.failure is not None:
        return {**entry, "rule": result.failure[0]}
    text = document.text[result.start : result.end]
    return {
        **entry,
        # UTF-8 byte offsets: the one unit every implementation shares.
        "start": len(document.text[: result.start].encode("utf-8")),
        "end": len(document.text[: result.end].encode("utf-8")),
        "text": text,
        "digest": address_mod.digest_of(text),
    }


def test_the_corpus_has_cases():
    assert NAMES


@pytest.mark.parametrize("name", NAMES)
def test_case(name, tmp_path):
    expected = json.loads((CASES / name / "expected.json").read_text(encoding="utf-8"))
    assert run_case(CASES / name, tmp_path) == expected
