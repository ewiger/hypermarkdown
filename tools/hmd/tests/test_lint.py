"""Lint rules HMD001..HMD017 (HMD-0001 §8)."""

from __future__ import annotations

import json

from hypermarkdown.lint import check, format_json, format_text, summarize

BASE = {
    "index.hmd": "# Root\n",
    "target.hmd": "# Target\n\n## Section\n\nblock ^anchor-id\n",
}


def rules_for(ws) -> list[str]:
    return [d.rule for d in check(ws)]


def test_clean_tree_has_no_diagnostics(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": "# A\n\n[[target#Section]] [[target#^anchor-id]]\n"})
    assert check(ws) == []


def test_hmd001_unresolved_link_is_a_warning(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": "# A\n\n[[nope]]\n"})
    (diag,) = [d for d in check(ws) if d.rule == "HMD001"]
    assert diag.severity == "warning"


def test_hmd002_ambiguous_link_lists_sorted_candidates(build_workspace):
    ws = build_workspace(
        {**BASE, "index.hmd": "# Root\n\n[[dup]]\n", "b/dup.hmd": "# B\n", "a/dup.hmd": "# A\n"}
    )
    (diag,) = [d for d in check(ws) if d.rule == "HMD002"]
    assert diag.severity == "error" and diag.candidates == ("a/dup.hmd", "b/dup.hmd")


def test_hmd003_link_escaping_the_root(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": "# A\n\n[[../../../etc/passwd]]\n"})
    assert "HMD003" in rules_for(ws)


def test_hmd003_import_ref_escaping_the_root(build_workspace):
    """A wildcard import reads a directory listing, so an unchecked ref would
    disclose filenames outside the tree."""
    ws = build_workspace({**BASE, "a.hmd": "---\nimport:\n  - from ../../../etc import *\n---\n"})
    assert "HMD003" in rules_for(ws)


def test_hmd004_missing_heading_fragment(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": "# A\n\n[[target#Nope]]\n"})
    assert "HMD004" in rules_for(ws)


def test_hmd004_accepts_either_heading_text_or_slug(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": "# A\n\n[[target#Section]] [[target#section]]\n"})
    assert "HMD004" not in rules_for(ws)


def test_a_fragment_matches_by_key_not_by_slug(build_workspace):
    ws = build_workspace(
        {
            "a.hmd": "# A\n\n[[b#ошибка 404]] [[b#CAFÉ, menu]] [[b#数据]] [[b#the fast path]]\n",
            "b.hmd": "# B\n\n## Ошибка 404!\n\n## Café — Menu\n\n## 数据\n\n## The *fast* path\n",
        }
    )
    assert check(ws) == []


def test_accents_in_a_fragment_are_significant(build_workspace):
    ws = build_workspace({"a.hmd": "# A\n\n[[b#Cafe]]\n", "b.hmd": "# B\n\n## Café\n"})
    (diag,) = check(ws)
    assert (diag.rule, diag.message) == ("HMD004", "b.hmd has no heading '#Cafe'")


def test_the_renderer_suffix_is_not_a_heading_name(build_workspace):
    """`_1` was Python-Markdown's numbering of a repeat, never the language's."""
    ws = build_workspace({"a.hmd": "# A\n\n[[b#dup_1]]\n", "b.hmd": "# B\n\n## Dup\n\n## Dup\n"})
    assert "HMD004" in rules_for(ws)


def test_a_fragment_with_an_empty_key_matches_nothing(build_workspace):
    ws = build_workspace({"a.hmd": "# A\n\n[[b#***]]\n", "b.hmd": "# B\n\n## ***\n"})
    assert "HMD004" in rules_for(ws)


def test_a_setext_heading_is_a_fragment_target(build_workspace):
    ws = build_workspace(
        {"a.hmd": "# A\n\n[[b#Setup]] [[b#usage]]\n", "b.hmd": "Setup\n=====\n\nUsage\n-----\n"}
    )
    assert check(ws) == []


def test_hmd005_missing_block_id(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": "# A\n\n[[target#^nope]]\n"})
    assert "HMD005" in rules_for(ws)


def test_hmd006_duplicate_block_anchor(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": "# A\n\none ^dup\n\ntwo ^dup\n"})
    assert "HMD006" in rules_for(ws)


def test_hmd007_embed_cycle(build_workspace):
    ws = build_workspace({"a.hmd": "# A\n\n![[b]]\n", "b.hmd": "# B\n\n![[a]]\n"})
    assert "HMD007" in rules_for(ws)


def test_hmd007_self_embed(build_workspace):
    ws = build_workspace({"a.hmd": "# A\n\n![[a]]\n"})
    assert "HMD007" in rules_for(ws)


def test_hmd008_embed_depth_limit(build_workspace):
    tree = {f"p{i}.hmd": f"# P{i}\n\n![[p{i + 1}]]\n" for i in range(20)}
    tree["p20.hmd"] = "# End\n"
    ws = build_workspace(tree)
    assert "HMD008" in rules_for(ws)


def test_deep_but_bounded_embeds_are_fine(build_workspace):
    tree = {f"p{i}.hmd": f"# P{i}\n\n![[p{i + 1}]]\n" for i in range(5)}
    tree["p5.hmd"] = "# End\n"
    ws = build_workspace(tree)
    assert "HMD008" not in rules_for(ws)


def test_hmd009_invalid_frontmatter(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": "---\n- not\n- a mapping\n---\n"})
    assert "HMD009" in rules_for(ws)


def test_hmd010_malformed_link(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": "# A\n\n[[]]\n"})
    assert "HMD010" in rules_for(ws)


def test_hmd011_duplicate_heading_key(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": "# Dup\n\n# Dup\n"})
    (diag,) = [d for d in check(ws) if d.rule == "HMD011"]
    assert diag.severity == "warning"
    assert (diag.line, diag.column) == (3, 1)


def test_hmd011_compares_keys_not_spellings(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": "# Set-up!\n\nset up\n------\n\n# Other\n"})
    (diag,) = [d for d in check(ws) if d.rule == "HMD011"]
    assert diag.line == 3
    assert "line 1" in diag.message


def test_hmd011_skips_headings_with_an_empty_key(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": "# A\n\n## ***\n\n## ---\n"})
    assert "HMD011" not in rules_for(ws)


def test_a_fragment_reaches_the_first_of_two_equal_headings(build_workspace):
    from hypermarkdown.embed import expand

    ws = build_workspace(
        {
            "a.hmd": "# A\n\n![[b#Setup]]\n\n![[b#^setup-linux]]\n",
            "b.hmd": "# B\n\n## Setup\n\nmac\n\n## Setup ^setup-linux\n\nlinux\n",
        }
    )
    assert [d.rule for d in check(ws)] == []  # the repeat is anchored
    out = expand(ws, ws.root / "a.hmd").text
    assert "mac" in out and "linux" in out


def test_hmd011_is_silenced_by_an_anchor_on_the_repeat(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": "# Dup\n\n# Dup ^second\n\n# Dup\n"})
    (diag,) = [d for d in check(ws) if d.rule == "HMD011"]
    assert diag.line == 5


def test_hmd012_page_beside_folder_note(build_workspace):
    ws = build_workspace({**BASE, "dup.hmd": "# File\n", "dup/index.hmd": "# Note\n"})
    (diag,) = [d for d in check(ws) if d.rule == "HMD012"]
    assert diag.severity == "warning"  # a shadow, like HMD018, not a content bug


def test_hmd013_unknown_use_feature(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": "---\nuse: [no_discovery]\n---\n"})
    assert "HMD013" in rules_for(ws)


def test_hmd014_malformed_import(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": "---\nimport:\n  - from shared import x\n---\n"})
    assert "HMD014" in rules_for(ws)


def test_hmd015_import_ref_does_not_exist(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": "---\nimport:\n  - from /nowhere import *\n---\n"})
    assert "HMD015" in rules_for(ws)


def test_hmd015_import_name_does_not_exist(build_workspace):
    ws = build_workspace({**BASE, "sub/x.hmd": "# X\n", "a.hmd": "---\nimport:\n  - from /sub import nope\n---\n"})
    assert "HMD015" in rules_for(ws)


def test_hmd015_duplicate_local_binding(build_workspace):
    tree = {
        **BASE,
        "one/x.hmd": "# One\n",
        "two/x.hmd": "# Two\n",
        "a.hmd": "---\nimport:\n  - from /one import x\n  - from /two import x\n---\n",
    }
    ws = build_workspace(tree)
    assert "HMD015" in rules_for(ws)


def test_hmd016_shadowed_search_path(build_workspace):
    tree = {
        **BASE,
        "one/x.hmd": "# One\n",
        "two/x.hmd": "# Two\n",
        "a.hmd": "---\nimport:\n  - from /one import *\n  - from /two import *\n---\n\n[[x]]\n",
    }
    ws = build_workspace(tree)
    (diag,) = [d for d in check(ws) if d.rule == "HMD016"]
    assert diag.severity == "warning" and diag.candidates == ("two/x.hmd",)


# -- reporting -----------------------------------------------------------


def test_diagnostics_are_sorted(build_workspace):
    ws = build_workspace({**BASE, "z.hmd": "# Z\n\n[[nope]]\n", "a.hmd": "# A\n\n[[nope]]\n"})
    diagnostics = check(ws)
    assert [d.path for d in diagnostics] == sorted(d.path for d in diagnostics)


def test_strict_promotes_warnings_without_changing_diagnostics(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": "# A\n\n[[nope]]\n"})
    diagnostics = check(ws)
    assert summarize(diagnostics, strict=False) == (0, 1)
    assert summarize(diagnostics, strict=True) == (1, 0)


def test_json_output_matches_text_content(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": "# A\n\n[[nope]]\n"})
    diagnostics = check(ws)
    payload = json.loads(format_json(diagnostics))
    assert payload["warnings"] == 1 and payload["errors"] == 0
    assert payload["diagnostics"][0]["rule"] == "HMD001"
    assert "HMD001" in format_text(diagnostics)


def test_json_output_is_byte_identical_across_runs(build_workspace, tmp_path):
    from hypermarkdown import config
    from hypermarkdown.resolve import Workspace

    tree = {**BASE, "a.hmd": "# A\n\n[[nope]] [[dup]]\n", "x/dup.hmd": "# X\n", "y/dup.hmd": "# Y\n"}
    first = format_json(check(build_workspace(tree)))
    second = format_json(check(Workspace(config.load(root_override=tmp_path))))
    assert first == second


def test_linting_a_subset_of_paths(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": "# A\n\n[[nope]]\n", "b.hmd": "# B\n\n[[nope]]\n"})
    diagnostics = check(ws, [ws.root / "a.hmd"])
    assert {d.path for d in diagnostics} == {"a.hmd"}


def test_hmd013_malformed_nav_order(build_workspace):
    """`nav.order` orders a card in the site nav; a non-integer is a defect, not
    a default (HMD-0002 §2)."""
    ws = build_workspace({**BASE, "a.hmd": "---\nnav:\n  order: first\n---\n\n# A\n"})
    assert "HMD013" in rules_for(ws)


def test_hmd013_a_scalar_nav(build_workspace):
    """The pre-mapping spelling is reported rather than accepted: the card meant
    to be ordered and would otherwise sort last (HMD-0002 §2)."""
    ws = build_workspace({**BASE, "a.hmd": "---\nnav: 10\n---\n\n# A\n"})
    assert "HMD013" in rules_for(ws)


def test_hmd013_an_unknown_key_inside_nav(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": "---\nnav:\n  ordre: 10\n---\n\n# A\n"})
    assert "HMD013" in rules_for(ws)


def test_a_well_formed_nav_key_is_accepted(build_workspace):
    ws = build_workspace(
        {**BASE, "a.hmd": "---\nnav:\n  order: 10\n  visibility: public\n---\n\n# A\n"}
    )
    assert "HMD013" not in rules_for(ws)


def test_hmd013_an_unrecognized_visibility(build_workspace):
    """Coercing an unknown value would publish a card nobody meant to."""
    ws = build_workspace({**BASE, "a.hmd": "---\nnav:\n  visibility: draft\n---\n\n# A\n"})
    assert "HMD013" in rules_for(ws)


PUBLIC = "---\nnav:\n  visibility: public\n---\n\n"


def test_hmd017_a_published_card_links_to_an_unpublished_one(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": PUBLIC + "# A\n\n[[target]]\n"})
    (diag,) = [d for d in check(ws) if d.rule == "HMD017"]
    assert diag.severity == "warning"
    assert "not published" in diag.message


def test_hmd017_covers_embeds_too(build_workspace):
    ws = build_workspace({**BASE, "a.hmd": PUBLIC + "# A\n\n![[target]]\n"})
    (diag,) = [d for d in check(ws) if d.rule == "HMD017"]
    assert "embeds" in diag.message


def test_hmd017_is_silent_between_unpublished_cards(build_workspace):
    """The ordinary case for a knowledge base that publishes only part of
    itself; warning about it would bury the real finding."""
    ws = build_workspace({**BASE, "a.hmd": "# A\n\n[[target]]\n"})
    assert "HMD017" not in rules_for(ws)


def test_hmd017_is_silent_when_both_are_published(build_workspace):
    ws = build_workspace(
        {
            **BASE,
            "target.hmd": PUBLIC + "# Target\n",
            "a.hmd": PUBLIC + "# A\n\n[[target]]\n",
        }
    )
    assert "HMD017" not in rules_for(ws)


def _chain(embeds: int) -> dict[str, str]:
    """`p0` embeds `p1`, and so on: `embeds` nested embeds below `p0`."""
    tree = {f"p{i}.hmd": f"# P{i}\n\n![[p{i + 1}]]\n" for i in range(embeds)}
    tree[f"p{embeds}.hmd"] = "# End\n"
    return tree


def test_hmd008_allows_a_depth_of_exactly_sixteen(build_workspace):
    # The starting card is depth zero, so sixteen nested embeds reach depth 16.
    ws = build_workspace(_chain(16))
    assert "HMD008" not in rules_for(ws)


def test_hmd008_is_reported_once_at_the_embed_that_exceeds_the_limit(build_workspace):
    ws = build_workspace(_chain(17))
    found = [d for d in check(ws) if d.rule == "HMD008"]
    # p16's `![[p17]]` would put p17 at depth 17; `p1` starts a chain of only 16.
    assert [(d.path, d.line, d.column) for d in found] == [("p16.hmd", 3, 1)]
