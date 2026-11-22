"""In-card addresses: grammar, segmentation, resolution, and the rules (HMD-0006)."""

from __future__ import annotations

import json

import pytest
from typer.testing import CliRunner

from hypermarkdown import address as A
from hypermarkdown import blocks as B
from hypermarkdown.cli import app
from hypermarkdown.embed import expand
from hypermarkdown.lint import check

TOKENS = """\
---
tags: [demo]
---

# Tokens

## The limit

A token has a limit. It expires after one hour! Refresh it before then. ^limit

Second paragraph here.

| a | b |
| - | - |
| 1 | 2 |
| 3 | 4 |

```python
x = 1
y = 2
```

- one item
- two item

> quoted words. more.

### Setup

Nested section text.

## Other

### Setup

Other setup.
"""


def select(text: str, fragment: str) -> str:
    from hypermarkdown.parse import parse

    document = parse(None, text, "card.hmd")
    result = A.resolve(document, A.parse(fragment))
    assert result.ok, result.failure
    return text[result.start : result.end]


def failure(text: str, fragment: str) -> tuple[str, str]:
    from hypermarkdown.parse import parse

    document = parse(None, text, "card.hmd")
    result = A.resolve(document, A.parse(fragment))
    assert result.failure is not None
    return result.failure


# -- grammar ---------------------------------------------------------------


def test_steps_and_their_kinds():
    address = A.parse("the-limit/^limit/Sentence2/Word5-Word9@sha256-0123456789abcdef")
    assert [s.kind for s in address.steps] == [A.HEADING, A.ANCHOR, A.COUNTED, A.COUNTED]
    assert address.steps[3].first == 5 and address.steps[3].last == 9 and address.steps[3].is_range
    assert address.digest == "0123456789abcdef"


def test_short_and_long_spellings_are_one_step():
    assert A.parse("p3").steps[0] == A.Step(A.COUNTED, "p3", "Para", 3, 3)
    assert A.parse("Para3").steps[0].value == "Para"


def test_an_unassigned_letter_or_word_is_heading_text():
    assert A.parse("x1").steps[0].kind == A.HEADING
    assert A.parse("Chapter2").steps[0].kind == A.HEADING
    assert A.parse("Rotation policy").steps[0].kind == A.HEADING


@pytest.mark.parametrize(
    "fragment",
    [
        "Para3-Para5/Word1",  # a range is the last step
        "w1-Word2",  # one spelling on both ends
        "Para1-Table2",  # one unit on both ends
        "Para0",  # ordinals count from 1
        "Para01",  # no leading zeros
        "Para9-Para3",  # ends before it starts
        "Para9999999",  # above the bound
        "a//b",  # empty step
        "a/",  # empty step
        "a/Line3",  # a section has no lines of its own
        "Line3/Word1",  # a line step is last
        "Sentence1",  # sentences need a block
        "a/Sentence1",
        "Para1/Para2",  # no nesting in this version
        "Para1/heading",  # named steps follow headings only
        "Para1/^x",
        "Sentence1/Sentence2",
        "x@sha256-zz",  # malformed digest
        "x@sha256-0123",
    ],
)
def test_malformed_addresses(fragment):
    with pytest.raises(A.AddressSyntaxError):
        A.parse(fragment)


def test_one_step_fragments_are_not_addresses():
    assert not A.is_multi_step("Rotation policy")
    assert not A.is_multi_step("Chapter2")
    assert A.is_multi_step("p3") and A.is_multi_step("a/b") and A.is_multi_step("a@sha256-0123456789abcdef")


# -- segmentation ----------------------------------------------------------


def kinds(text: str) -> list[str]:
    return [b.kind for b in B.segment(text, 0, len(text))]


def test_block_kinds():
    text = (
        "para one\nstill one\n\n"
        "| a | b |\n|---|---|\n| 1 | 2 |\n\n"
        "```py\ncode\n```\n\n"
        "```d2#show\na -> b\n```\n\n"
        "```d2\na -> b\n```\n\n"
        "$$\nx^2\n$$\n\n"
        "> quote\n\n"
        "> [!note] Title\n> body\n\n"
        '!!! note "Title"\n    body\n\n    more body\n\n'
        "- a\n- b\n\n"
        "![[other]]\n\n"
        "<div>\nhtml\n</div>\n\n"
        "# heading\n\n---\n\nlast\n"
    )
    assert kinds(text) == [
        "Para", "Table", "Code", "Diagram", "Code", "Math", "Blockquote", "Callout",
        "Callout", "List", "Embed", "Html", "Para",
    ]


def test_a_list_spans_blank_lines_and_indented_continuations():
    text = "- a\n\n  more of a\n- b\n\n1. new list\n\nafter\n"
    assert kinds(text) == ["List", "List", "Para"]


def test_a_list_marker_and_heading_interrupt_a_paragraph():
    assert kinds("text\n- item\n") == ["Para", "List"]
    assert kinds("text\n# H\nmore\n") == ["Para", "Para"]
    assert kinds("text\n2. not a list\n") == ["Para"]


def test_words_skip_structure():
    text = "> - quoted *item* here\n"
    block = B.segment(text, 0, len(text))[0]
    assert [text[w.start : w.end] for w in B.words(text, block)] == ["quoted", "*item*", "here"]
    text = "- one *two*\n"
    block = B.segment(text, 0, len(text))[0]
    assert [text[w.start : w.end] for w in B.words(text, block)] == ["one", "*two*"]


def test_sentences_end_at_a_terminated_word():
    text = "One. Two! e.g. three? four"
    words = B.words(text, B.Block("Para", 0, len(text), 0, len(text)))
    groups = B.sentences(text, words)
    assert [text[g[0].start : g[-1].end] for g in groups] == ["One.", "Two!", "e.g.", "three?", "four"]


def test_unicode_whitespace_is_pinned():
    text = "a\u00a0b\u3000c\u200bd"  # U+200B is a format character, not whitespace
    words = B.words(text, B.Block("Para", 0, len(text), 0, len(text)))
    assert [text[w.start : w.end] for w in words] == ["a", "b", "c\u200bd"]


# -- resolution ------------------------------------------------------------


@pytest.mark.parametrize(
    ("fragment", "expected"),
    [
        ("the-limit/Para2", "Second paragraph here."),
        ("the-limit/p2", "Second paragraph here."),
        ("^limit/Sentence2", "It expires after one hour!"),
        ("^limit/Sentence2/Word3-Word5", "after one hour!"),
        ("the-limit/Para1/Word2", "token"),
        ("the-limit/Table1/Line3-Line4", "| 1 | 2 |\n| 3 | 4 |"),
        ("the-limit/Code1/Line2", "y = 2"),
        ("the-limit/List1/Word2", "item"),
        ("the-limit/Blockquote1/Sentence2", "more."),
        ("Line5", "# Tokens"),
        ("Line9-Line10", "A token has a limit. It expires after one hour! Refresh it before then. ^limit\n"),
        ("the-limit/Para1", "A token has a limit. It expires after one hour! Refresh it before then."),
        ("Block4", "```python\nx = 1\ny = 2\n```"),
        ("the-limit/Para1-Para2", "A token has a limit. It expires after one hour! Refresh it before then. ^limit\n\nSecond paragraph here."),
        ("the-limit/Para3", "Nested section text."),
    ],
)
def test_resolves(fragment, expected):
    assert select(TOKENS, fragment) == expected


def test_a_heading_path_tells_same_named_headings_apart():
    assert select(TOKENS, "other/setup").startswith("### Setup\n\nOther setup.")
    assert select(TOKENS, "the-limit/setup").startswith("### Setup\n\nNested section text.")


def test_past_the_end_is_hmd020_and_never_clamps():
    rule, message = failure(TOKENS, "the-limit/Para9")
    assert rule == "HMD020" and "has 3 paragraphs; Para9 is past the end" in message
    assert failure(TOKENS, "the-limit/Diagram1") == (
        "HMD020", "'#the-limit' has no diagrams; Diagram1 is past the end"
    )
    assert failure(TOKENS, "the-limit/Table2")[1] == "'#the-limit' has 1 table; Table2 is past the end"


def test_a_non_prose_block_has_no_words():
    rule, message = failure(TOKENS, "the-limit/Table1/Word1")
    assert rule == "HMD020" and "is a table, which has no words" in message


def test_unknown_heading_and_block():
    assert failure(TOKENS, "nope/Para1")[0] == "HMD004"
    assert failure(TOKENS, "other/nope")[0] == "HMD004"
    assert failure(TOKENS, "^nope/Sentence1")[0] == "HMD005"


def test_a_block_outside_the_named_section_still_resolves_and_warns():
    from hypermarkdown.parse import parse

    document = parse(None, TOKENS, "card.hmd")
    result = A.resolve(document, A.parse("other/^limit/Word1"))
    assert result.ok and TOKENS[result.start : result.end] == "A"
    assert [rule for rule, _ in result.warnings] == ["HMD021"]


def test_a_digest_is_checked_and_never_blocks():
    from hypermarkdown.parse import parse

    document = parse(None, TOKENS, "card.hmd")
    good = A.digest_of("It expires after one hour!")
    assert A.resolve(document, A.parse(f"^limit/Sentence2@sha256-{good}")).warnings == []
    stale = A.resolve(document, A.parse("^limit/Sentence2@sha256-0000000000000000"))
    assert stale.ok and [rule for rule, _ in stale.warnings] == ["HMD023"]


def test_a_huge_ordinal_is_refused_before_counting():
    with pytest.raises(A.AddressSyntaxError):
        A.parse(f"Para{A.MAX_ORDINAL + 1}")


# -- the linter and the embed ----------------------------------------------


def test_lint_reports_the_address_rules(build_workspace):
    ws = build_workspace(
        {
            "tokens.hmd": TOKENS + "\n## P3\n\nshadowed\n",
            "a.hmd": (
                "# A\n\n[[tokens#the-limit/Para2]] [[tokens#the-limit/Para9]] "
                "[[tokens#Para1/Para2]] [[tokens#other/^limit]] "
                "[[tokens#^limit@sha256-0000000000000000]]\n"
            ),
        }
    )
    rules = sorted(d.rule for d in check(ws) if d.rule >= "HMD019")
    assert rules == ["HMD019", "HMD020", "HMD021", "HMD022", "HMD023"]
    by_rule = {d.rule: d for d in check(ws)}
    assert by_rule["HMD019"].severity == "error" and by_rule["HMD022"].path == "tokens.hmd"
    assert "counts paragraphs" in by_rule["HMD022"].message


def test_one_step_fragments_keep_their_messages(build_workspace):
    ws = build_workspace({"t.hmd": "# T\n\n## S\n\nblock ^b\n", "a.hmd": "# A\n\n[[t#Nope]] [[t#^nope]]\n"})
    messages = [d.message for d in check(ws)]
    assert messages == ["t.hmd has no heading '#nope'", "t.hmd has no block '^nope'"]


def test_an_embed_of_an_address_quotes_its_span(build_workspace):
    ws = build_workspace({"tokens.hmd": TOKENS, "a.hmd": "# A\n\n![[tokens#^limit/Sentence2]]\n"})
    path = ws.config.root / "a.hmd"
    assert expand(ws, path).text == "# A\n\nIt expires after one hour!\n"


def test_an_unresolvable_address_embed_stays_as_written(build_workspace):
    ws = build_workspace({"tokens.hmd": TOKENS, "a.hmd": "# A\n\n![[tokens#the-limit/Para9]]\n"})
    assert "![[tokens#the-limit/Para9]]" in expand(ws, ws.config.root / "a.hmd").text


def test_a_site_link_lands_on_the_deepest_heading(build_workspace):
    from hypermarkdown.render import flat

    ws = build_workspace({"tokens.hmd": TOKENS, "a.hmd": "# A\n\n[[tokens#other/setup/Para1]]\n"})
    assert "(tokens.md#setup_1)" in flat.render(ws, ws.config.root / "a.hmd").text


def test_the_address_command(build_workspace):
    ws = build_workspace({"tokens.hmd": TOKENS})
    card = ws.config.root / "tokens.hmd"
    result = CliRunner().invoke(
        app, ["address", str(card), "^limit/Sentence2", "--root", str(ws.config.root), "--format", "json"]
    )
    assert result.exit_code == 0, result.output
    out = json.loads(result.stdout)
    assert out["text"] == "It expires after one hour!" and out["line"] == 9
    assert out["digest"] == f"sha256-{A.digest_of(out['text'])}"
    missing = CliRunner().invoke(app, ["address", str(card), "the-limit/Para9", "--root", str(ws.config.root)])
    assert missing.exit_code == 1
