"""The four-phase resolver (HMD-0001 §5.2)."""

from __future__ import annotations

from hypermarkdown.resolve import Outcome

# A tree mirroring the HMD-0001 worked example.
TREE = {
    "index.hmd": "# Root\n",
    "logging.hmd": "# Logging\n\n## Redaction\n\nrule ^redact\n",
    "glossary/index.hmd": "# Glossary\n",
    "glossary/token.hmd": "# Token\n\ndef ^definition\n",
    "shared/index.hmd": "# Shared\n",
    "shared/tokens.hmd": "# Tokens\n\n## Rotation\n\nwindow ^rotation-window\n",
    "shared/retry-policy.hmd": "# Retry\n\n## Backoff\n",
    "specs/index.hmd": "# Specs\n",
    "specs/auth/index.hmd": "# Auth\n",
    "specs/auth/login.hmd": "# Login\n\n## Flow\n",
    "specs/auth/logging.hmd": "# Auth logging\n",
    "specs/auth/tokens.hmd": "# Auth tokens\n",
    "specs/billing/index.hmd": "# Billing\n",
    "specs/billing/invoices.hmd": "# Invoices\n",
}


def resolve(ws, source: str, ref: str):
    return ws.resolve(ws.root / source, ref)


def rel(ws, result) -> str | None:
    return ws.rel(result.path) if result.path else None


# -- phase 1, the spine --------------------------------------------------


def test_own_folder_wins(build_workspace):
    ws = build_workspace(TREE)
    result = resolve(ws, "specs/auth/login.hmd", "logging")
    assert rel(ws, result) == "specs/auth/logging.hmd" and result.phase == 1


def test_spine_walks_up_and_never_sideways(build_workspace):
    """The property that makes billing's `[[logging]]` the general card."""
    ws = build_workspace(TREE)
    result = resolve(ws, "specs/billing/invoices.hmd", "logging")
    assert rel(ws, result) == "logging.hmd" and result.phase == 1


def test_multi_segment_bare_name(build_workspace):
    ws = build_workspace(TREE)
    assert rel(ws, resolve(ws, "index.hmd", "shared/tokens")) == "shared/tokens.hmd"


def test_absolute_link(build_workspace):
    ws = build_workspace(TREE)
    assert rel(ws, resolve(ws, "specs/auth/logging.hmd", "/logging")) == "logging.hmd"


def test_relative_link(build_workspace):
    ws = build_workspace(TREE)
    assert rel(ws, resolve(ws, "specs/billing/invoices.hmd", "../auth/login")) == "specs/auth/login.hmd"


def test_relative_link_escaping_the_root(build_workspace):
    ws = build_workspace(TREE)
    assert resolve(ws, "specs/auth/login.hmd", "../../../../etc/passwd").outcome is Outcome.ESCAPES


def test_folder_note_binding(build_workspace):
    ws = build_workspace(TREE)
    assert rel(ws, resolve(ws, "index.hmd", "specs/auth")) == "specs/auth/index.hmd"
    assert rel(ws, resolve(ws, "index.hmd", "specs/auth/index")) == "specs/auth/index.hmd"


def test_page_beats_folder_note_on_collision(build_workspace):
    ws = build_workspace({**TREE, "dup.hmd": "# File\n", "dup/index.hmd": "# Note\n"})
    assert rel(ws, resolve(ws, "index.hmd", "dup")) == "dup.hmd"


# -- phase 3, autodiscovery ----------------------------------------------


def test_sweep_finds_a_unique_off_spine_page(build_workspace):
    ws = build_workspace(TREE)
    result = resolve(ws, "index.hmd", "invoices")
    assert rel(ws, result) == "specs/billing/invoices.hmd" and result.phase == 3


def test_sweep_reports_ambiguity_with_sorted_candidates(build_workspace):
    ws = build_workspace(TREE)
    result = resolve(ws, "index.hmd", "tokens")
    assert result.outcome is Outcome.AMBIGUOUS
    assert [ws.rel(p) for p in result.candidates] == ["shared/tokens.hmd", "specs/auth/tokens.hmd"]


def test_sweep_finds_folder_notes_by_directory_name(build_workspace):
    """A bare name means the same thing in phase 1 and phase 3."""
    ws = build_workspace(TREE)
    assert rel(ws, resolve(ws, "glossary/token.hmd", "billing")) == "specs/billing/index.hmd"


def test_unresolved_link_is_a_red_link(build_workspace):
    ws = build_workspace(TREE)
    assert resolve(ws, "index.hmd", "nonexistent").outcome is Outcome.UNRESOLVED


# -- phase 0 and 2, imports ----------------------------------------------


def test_named_import_binds_an_alias(build_workspace):
    tree = dict(TREE)
    tree["specs/auth/login.hmd"] = (
        "---\nimport:\n  - from /shared import tokens as shared-tokens\n---\n\n# Login\n"
    )
    ws = build_workspace(tree)
    result = resolve(ws, "specs/auth/login.hmd", "shared-tokens")
    assert rel(ws, result) == "shared/tokens.hmd" and result.phase == 0


def test_aliasing_leaves_the_bare_name_alone(build_workspace):
    tree = dict(TREE)
    tree["specs/auth/login.hmd"] = (
        "---\nimport:\n  - from /shared import tokens as shared-tokens\n---\n\n# Login\n"
    )
    ws = build_workspace(tree)
    assert rel(ws, resolve(ws, "specs/auth/login.hmd", "tokens")) == "specs/auth/tokens.hmd"


def test_named_import_may_shadow_the_spine(build_workspace):
    tree = dict(TREE)
    tree["specs/auth/login.hmd"] = "---\nimport:\n  - from / import logging\n---\n\n# Login\n"
    ws = build_workspace(tree)
    result = resolve(ws, "specs/auth/login.hmd", "logging")
    assert rel(ws, result) == "logging.hmd" and result.phase == 0


def test_wildcard_import_adds_a_search_origin(build_workspace):
    tree = dict(TREE)
    tree["specs/billing/invoices.hmd"] = "---\nimport:\n  - from /shared import *\n---\n\n# Invoices\n"
    ws = build_workspace(tree)
    result = resolve(ws, "specs/billing/invoices.hmd", "retry-policy")
    assert rel(ws, result) == "shared/retry-policy.hmd" and result.phase == 2


def test_wildcard_import_cannot_redirect_a_working_local_link(build_workspace):
    """Monotonicity: `import *` only ever resolves previously-red links."""
    tree = dict(TREE)
    tree["specs/auth/login.hmd"] = "---\nimport:\n  - from /shared import *\n---\n\n# Login\n"
    ws = build_workspace(tree)
    result = resolve(ws, "specs/auth/login.hmd", "tokens")
    assert rel(ws, result) == "specs/auth/tokens.hmd" and result.phase == 1


def test_wildcard_import_does_not_recurse(build_workspace):
    tree = dict(TREE)
    tree["specs/billing/invoices.hmd"] = "---\nimport:\n  - from /specs import *\n---\n\n# Invoices\n"
    ws = build_workspace(tree)
    # `login` lives in /specs/auth, not directly in /specs, so phase 2 misses it
    # and phase 3 has to find it.
    assert resolve(ws, "specs/billing/invoices.hmd", "login").phase == 3


def test_wildcard_import_is_not_eagerly_bound(build_workspace, tmp_path):
    tree = dict(TREE)
    tree["specs/billing/invoices.hmd"] = "---\nimport:\n  - from /shared import *\n---\n\n# Invoices\n"
    build_workspace(tree)
    (tmp_path / "shared" / "late.hmd").write_text("# Late\n", encoding="utf-8")

    from hypermarkdown import config
    from hypermarkdown.resolve import Workspace

    ws = Workspace(config.load(root_override=tmp_path))
    assert rel(ws, resolve(ws, "specs/billing/invoices.hmd", "late")) == "shared/late.hmd"


def test_earlier_import_wins_and_records_the_shadowed_origin(build_workspace):
    tree = dict(TREE)
    tree["specs/billing/invoices.hmd"] = (
        "---\nimport:\n  - from /shared import *\n  - from /specs/auth import *\n---\n\n# Invoices\n"
    )
    ws = build_workspace(tree)
    result = resolve(ws, "specs/billing/invoices.hmd", "tokens")
    assert rel(ws, result) == "shared/tokens.hmd"
    assert [ws.rel(p) for p in result.shadowed] == ["specs/auth/tokens.hmd"]


def test_named_bindings_apply_to_single_segment_targets_only(build_workspace):
    tree = dict(TREE)
    tree["index.hmd"] = "---\nimport:\n  - from /specs import auth\n---\n\n# Root\n"
    ws = build_workspace(tree)
    assert rel(ws, resolve(ws, "index.hmd", "auth")) == "specs/auth/index.hmd"
    # A binding names a page, not a namespace.
    assert resolve(ws, "index.hmd", "auth/login").phase != 0


# -- §5.3 discovery toggles ----------------------------------------------


def test_no_autodiscovery_suppresses_phase_3(build_workspace):
    tree = dict(TREE)
    tree["specs/billing/invoices.hmd"] = "---\nuse: [no_autodiscovery]\n---\n\n# Invoices\n"
    ws = build_workspace(tree)
    assert resolve(ws, "specs/billing/invoices.hmd", "retry-policy").outcome is Outcome.UNRESOLVED


def test_use_inherits_from_the_folder_note(build_workspace):
    tree = dict(TREE)
    tree["specs/billing/index.hmd"] = "---\nuse: [no_autodiscovery]\n---\n\n# Billing\n"
    ws = build_workspace(tree)
    assert ws.autodiscovery_enabled(ws.root / "specs/billing/invoices.hmd") is False
    assert ws.autodiscovery_enabled(ws.root / "specs/auth/login.hmd") is True


def test_card_overrides_its_folder(build_workspace):
    tree = dict(TREE)
    tree["specs/billing/index.hmd"] = "---\nuse: [no_autodiscovery]\n---\n\n# Billing\n"
    tree["specs/billing/invoices.hmd"] = "---\nuse: [autodiscovery]\n---\n\n# Invoices\n"
    ws = build_workspace(tree)
    assert ws.autodiscovery_enabled(ws.root / "specs/billing/invoices.hmd") is True


def test_frontmatter_beats_config(build_workspace):
    tree = dict(TREE)
    tree["specs/auth/login.hmd"] = "---\nuse: [autodiscovery]\n---\n\n# Login\n"
    ws = build_workspace(tree, config_toml="[discovery]\nautodiscovery = false\n")
    assert ws.config.autodiscovery is False
    assert ws.autodiscovery_enabled(ws.root / "specs/auth/login.hmd") is True
    assert ws.autodiscovery_enabled(ws.root / "index.hmd") is False


def test_recursive_mode_confines_the_sweep_to_the_subtree(build_workspace):
    ws = build_workspace(TREE, config_toml='[discovery]\nmode = "recursive"\n')
    # `retry-policy` is outside specs/, so a subtree sweep cannot reach it.
    assert resolve(ws, "specs/billing/invoices.hmd", "retry-policy").outcome is Outcome.UNRESOLVED
    assert rel(ws, resolve(ws, "index.hmd", "retry-policy")) == "shared/retry-policy.hmd"


# -- determinism ---------------------------------------------------------


def test_resolution_is_stable_across_workspaces(build_workspace, tmp_path):
    from hypermarkdown import config
    from hypermarkdown.resolve import Workspace

    ws1 = build_workspace(TREE)
    ws2 = Workspace(config.load(root_override=tmp_path))
    for source in ws1.pages():
        for ref in ("logging", "tokens", "invoices", "specs/auth"):
            a, b = ws1.resolve(source, ref), ws2.resolve(source, ref)
            assert (a.outcome, a.path, a.candidates) == (b.outcome, b.path, b.candidates)


# -- HMD-0029: Markdown cards ---------------------------------------------


def test_a_markdown_card_exposes_frontmatter_and_is_not_scanned(build_workspace):
    ws = build_workspace({"a.md": "---\ntitle: A\nnav:\n  visibility: private\n---\n# A\n\n[[b]] ^id\n"})
    document = ws.documents[ws.root / "a.md"]
    assert document.is_markdown
    assert document.frontmatter["title"] == "A"
    assert document.links == ()
    assert document.anchors == ()
    assert [h.key for h in document.headings] == ["a"]
    # The reserved keys are not interpreted, and HyperMarkdown does not gate it.
    assert ws.visibility(ws.root / "a.md") == "public"


def test_a_markdown_fence_that_does_not_parse_is_body_text(build_workspace):
    ws = build_workspace({"a.md": "---\n: [unclosed\n---\n# A\n"})
    document = ws.documents[ws.root / "a.md"]
    assert document.frontmatter == {}
    assert document.diagnostics == []


def test_a_written_extension_binds_only_that_extension(build_workspace):
    ws = build_workspace({"a.hmd": "[[n.markdown]] [[n.md]]\n", "n.markdown": "# N\n"})
    source = ws.root / "a.hmd"
    assert ws.resolve(source, "n.markdown").path == ws.root / "n.markdown"
    assert ws.resolve(source, "n.md").outcome.value == "unresolved"
    assert ws.resolve(source, "n").path == ws.root / "n.markdown"


def test_a_name_with_a_dot_binds_whole(build_workspace):
    ws = build_workspace({"a.hmd": "[[v1.2]]\n", "v1.2.md": "# v1.2\n"})
    assert ws.resolve(ws.root / "a.hmd", "v1.2").path == ws.root / "v1.2.md"
