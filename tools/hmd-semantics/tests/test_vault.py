"""The builder must see a vault exactly as HQL's loader sees it."""

from pathlib import Path

from hypermarkdown_semantics import store
from hypermarkdown_semantics import vault

BIRDS = Path(__file__).resolve().parent / "fixtures" / "birds"


def test_header_splits_at_the_closing_fence():
    authored, body = vault.split_header("---\ntitle: A\n---\n# A\n\nbody\n")
    assert authored == "title: A\n"
    assert body == "# A\n\nbody\n"


def test_a_document_without_a_header_is_all_body():
    authored, body = vault.split_header("# A\n\nbody\n")
    assert authored == ""
    assert body == "# A\n\nbody\n"


def test_nested_maps_and_scalars_parse_as_the_loader_parses_them():
    header = vault.parse_header(
        "title: A\n"
        "metadata:\n"
        "  status: todo\n"
        "  knowledge:\n"
        "    type: Relation\n"
        "tags: [one, two]\n"
        "count: 3\n"
        "open: true\n"
    )
    assert header == {
        "title": "A",
        "metadata": {"status": "todo", "knowledge": {"type": "Relation"}},
        "tags": ["one", "two"],
        "count": 3,
        "open": True,
    }


def test_the_indexed_text_writes_the_title_once():
    # The title leads the text and is not repeated in key order. Where a card
    # is — `name`, `path`, `format` — is a field rather than a header entry, so
    # nothing has to be filtered out to keep a move between directories from
    # changing a score.
    document = vault.Document(
        name="a",
        path=Path("somewhere/a.hmd"),
        title="A title",
        header={"title": "A title", "status": "todo"},
        body="the body",
    )
    assert document.text() == "A title todo the body"


def test_an_authored_key_named_after_a_field_is_ordinary_authored_text():
    # `Document::parse` no longer writes `name`, `path` or `format` into the
    # header, so a key of that name is something a person wrote and is indexed
    # like any other authored entry.
    document = vault.Document(
        name="a",
        path=Path("somewhere/a.hmd"),
        title="A title",
        header={"title": "A title", "path": "elsewhere"},
        body="the body",
    )
    assert document.text() == "A title elsewhere the body"


def test_the_title_falls_back_to_the_first_heading():
    documents = {document.name: document for document in vault.load(BIRDS)}
    assert documents["barn-owl"].title == "Barn owl"
    assert len(documents) >= 40


def test_the_committed_index_describes_the_committed_corpus():
    # The golden test from the Python side: every card's text hashes to what
    # the index says it hashed to when the vectors were computed.
    index = store.read(BIRDS / ".hmd" / "index.sqlite")
    indexed = {name: digest for name, _, digest, _ in index["cards"]}
    documents = vault.load(BIRDS)
    assert set(indexed) == {document.name for document in documents}
    for document in documents:
        assert indexed[document.name] == document.content_hash(), document.name
