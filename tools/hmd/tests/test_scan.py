"""Masking and construct extraction (HMD-0001 §1)."""

from __future__ import annotations

import pytest

from hypermarkdown import scan


def links(text: str) -> list[str]:
    return [inner for _, inner, _, _ in scan.find_links(scan.mask(text))]


def test_mask_preserves_length_and_newlines():
    text = "a `code` b\n```\nfence\n```\n"
    masked = scan.mask(text)
    assert len(masked) == len(text)
    assert masked.count("\n") == text.count("\n")


@pytest.mark.parametrize(
    "text",
    [
        "```\n[[x]]\n```\n",
        "~~~\n[[x]]\n~~~\n",
        "before `[[x]]` after\n",
        "<!-- [[x]] -->\n",
        "<!--\nmultiline [[x]]\n-->\n",
        "```d2\na -> b: [[x]]\n```\n",
    ],
    ids=["fence", "tilde-fence", "code-span", "comment", "multiline-comment", "info-fence"],
)
def test_masked_regions_yield_no_links(text):
    assert links(text) == []


def test_links_outside_masked_regions_survive():
    text = "```\n[[hidden]]\n```\n\nvisible [[shown]] here\n"
    assert links(text) == ["shown"]


def test_offsets_after_a_masked_region_stay_exact():
    text = "```\nfence\n```\n\n[[target]]\n"
    masked = scan.mask(text)
    start = next(s for _, _, s, _ in scan.find_links(masked))
    assert text[start : start + len("[[target]]")] == "[[target]]"
    line, column = scan.line_col(text, start)
    assert (line, column) == (5, 1)


def test_indented_blocks_are_not_masked():
    """A four-space indent marks callout bodies and footnote continuations,
    not code, because this tree ships the `admonition` extension."""
    text = '!!! note "Title"\n\n    see [[target]]\n'
    assert links(text) == ["target"]


def test_unterminated_fence_masks_to_end_of_file():
    assert links("```\n[[x]]\n") == []


def test_code_span_may_not_span_a_blank_line():
    assert links("` \n\n [[x]] \n\n `\n") == ["x"]


def test_anchors_require_leading_whitespace():
    assert [a for a, _, _ in scan.find_anchors(scan.mask("text ^ok\n"))] == ["ok"]
    assert [a for a, _, _ in scan.find_anchors(scan.mask("^notanchor\n"))] == []


def test_headings_ignore_hashes_inside_fences():
    text = "# Real\n\n```bash\n# not a heading\n```\n"
    assert [t for _, t, _, _ in scan.find_headings(scan.mask(text))] == ["Real"]
