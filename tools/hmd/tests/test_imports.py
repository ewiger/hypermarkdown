"""The from-import mini-grammar (HMD-0001 §5.3)."""

from __future__ import annotations

import pytest

from hypermarkdown.imports import ImportError_, parse_statement


def test_named_import():
    stmt = parse_statement("from /shared import tokens")
    assert (stmt.ref, stmt.wildcard, stmt.bindings) == ("/shared", False, (("tokens", "tokens"),))


def test_aliased_import_binds_the_alias():
    stmt = parse_statement("from /shared import tokens as shared-tokens")
    assert stmt.bindings == (("tokens", "shared-tokens"),)


def test_multiple_bindings():
    stmt = parse_statement("from /a import x, y as z")
    assert stmt.bindings == (("x", "x"), ("y", "z"))


def test_wildcard_import():
    stmt = parse_statement("from /glossary import *")
    assert stmt.wildcard and stmt.bindings == ()


def test_relative_ref():
    assert parse_statement("from ../auth import login as l").ref == "../auth"


@pytest.mark.parametrize(
    "raw",
    [
        "from shared import tokens",
        "from specs/auth import login",
        "import tokens",
        "from /shared",
        "from /shared import",
        "from /shared import a,",
        "from /shared import *, x",
        "from /shared import a as",
        "",
    ],
    ids=["bare", "bare-multi", "no-from", "no-import", "no-names", "trailing-comma",
         "star-plus-name", "dangling-as", "empty"],
)
def test_malformed_statements_raise(raw):
    with pytest.raises(ImportError_):
        parse_statement(raw)


def test_bare_ref_is_rejected_because_it_would_be_circular():
    with pytest.raises(ImportError_, match="never bare"):
        parse_statement("from shared import tokens")


def test_non_string_entry_is_rejected():
    with pytest.raises(ImportError_):
        parse_statement({"from": "/shared"})


def test_ws_is_spaces_and_tabs_only():
    stmt = parse_statement("from\t./a\timport\ta,b , c\t,\td\tas\te")
    assert stmt.bindings == (("a", "a"), ("b", "b"), ("c", "c"), ("d", "e"))


@pytest.mark.parametrize(
    "raw",
    [
        "from\u00a0./a import a",
        "from ./a import\u00a0a",
        "from ./a import a,\u00a0b",
        "from ./a import a\u00a0as b",
        "from ./a import x:y",
        "from ./a import a as x#y",
        "From ./a import a",
        "from ./a Import a",
        "from ./a import a AS b",
    ],
)
def test_other_whitespace_reserved_characters_and_other_case_are_malformed(raw):
    with pytest.raises(ImportError_):
        parse_statement(raw)
