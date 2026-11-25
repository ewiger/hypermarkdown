"""The HMD-0001 example fixture is executable spec.

Every resolution asserted in `doc/proposals/HMD-0001/examples.hmd` is reproduced
here, so documentation drifting from behavior fails the suite rather than
misleading a reader.
"""

from __future__ import annotations

import pytest

from hypermarkdown.lint import check, summarize
from hypermarkdown.resolve import Outcome


def resolve(ws, source: str, ref: str):
    return ws.resolve(ws.root / source, ref)


def rel(ws, result):
    return ws.rel(result.path) if result.path else None


def test_fixture_lints_with_zero_errors(example_workspace):
    diagnostics = check(example_workspace)
    errors, warnings = summarize(diagnostics)
    assert errors == 0, [d.message for d in diagnostics if d.severity == "error"]
    assert warnings == 1


def test_the_only_warning_is_the_deliberate_red_link(example_workspace):
    (diag,) = check(example_workspace)
    assert diag.rule == "HMD001"
    assert diag.path == "glossary/index.hmd"
    assert "idempotency" in diag.message


@pytest.mark.parametrize(
    "source, ref, target, phase",
    [
        # examples.hmd — "Spine and sweep"
        ("specs/auth/login.hmd", "logging", "specs/auth/logging.hmd", 1),
        ("specs/billing/invoices.hmd", "logging", "logging.hmd", 1),
        ("specs/auth/logging.hmd", "/logging", "logging.hmd", None),
        ("index.hmd", "invoices", "specs/billing/invoices.hmd", 3),
        ("index.hmd", "shared/tokens", "shared/tokens.hmd", 1),
        ("specs/billing/invoices.hmd", "../auth/login", "specs/auth/login.hmd", None),
        ("index.hmd", "specs/auth", "specs/auth/index.hmd", 1),
        # examples.hmd — "Named imports"
        ("specs/auth/login.hmd", "shared-tokens", "shared/tokens.hmd", 0),
        ("specs/auth/login.hmd", "tokens", "specs/auth/tokens.hmd", 1),
        ("specs/auth/login.hmd", "token", "glossary/token.hmd", 2),
        ("specs/auth/login.hmd", "retry-policy", "shared/retry-policy.hmd", 3),
        # examples.hmd — "Wildcard imports"
        ("specs/billing/invoices.hmd", "retry-policy", "shared/retry-policy.hmd", 2),
        ("specs/billing/invoices.hmd", "login-spec", "specs/auth/login.hmd", 0),
        ("specs/billing/invoices.hmd", "index", "specs/billing/index.hmd", 1),
    ],
)
def test_documented_resolutions(example_workspace, source, ref, target, phase):
    result = resolve(example_workspace, source, ref)
    assert rel(example_workspace, result) == target
    if phase is not None:
        assert result.phase == phase


def test_documented_ambiguity(example_workspace):
    """`index.hmd` never writes `[[tokens]]` precisely because of this."""
    result = resolve(example_workspace, "index.hmd", "tokens")
    assert result.outcome is Outcome.AMBIGUOUS
    assert [example_workspace.rel(p) for p in result.candidates] == [
        "shared/tokens.hmd",
        "specs/auth/tokens.hmd",
    ]


def test_documented_red_link(example_workspace):
    assert resolve(example_workspace, "glossary/index.hmd", "idempotency").outcome is Outcome.UNRESOLVED


def test_use_inheritance_across_the_billing_namespace(example_workspace):
    root = example_workspace.root
    assert example_workspace.autodiscovery_enabled(root / "specs/billing/index.hmd") is False
    assert example_workspace.autodiscovery_enabled(root / "specs/billing/invoices.hmd") is False
    assert example_workspace.autodiscovery_enabled(root / "specs/auth/login.hmd") is True


def test_masked_comment_produces_no_edge(example_workspace):
    """login.hmd holds a `[[link]]` inside an HTML comment."""
    document = example_workspace.documents[example_workspace.root / "specs/auth/login.hmd"]
    assert not any(link.page_ref == "link" for link in document.links)


def test_lint_is_deterministic_across_runs(example_workspace):
    from hypermarkdown import config
    from hypermarkdown.lint import format_json
    from hypermarkdown.resolve import Workspace

    other = Workspace(config.load(root_override=example_workspace.root))
    assert format_json(check(example_workspace)) == format_json(check(other))
