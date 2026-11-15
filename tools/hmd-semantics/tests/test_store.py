"""The index a reader is handed."""

from pathlib import Path

import hypermarkdown_semantics
from hypermarkdown_semantics import store

BIRDS = Path(__file__).resolve().parent / "fixtures" / "birds"


def test_vectors_round_trip_as_little_endian_f32():
    vector = [0.0, 1.0, -0.5]
    blob = store.pack(vector)
    assert len(blob) == len(vector) * 4
    assert store.unpack(blob) == vector


def test_the_committed_index_pins_its_schema_and_its_model():
    index = store.read(BIRDS / ".hmd" / "index.sqlite")
    model_id, revision, dimensions, metric, normalized = index["model"]
    version, vault_name, _, _ = index["meta"]
    assert version == store.SCHEMA_VERSION
    assert vault_name == "tests/fixtures/birds"
    assert model_id == "sentence-transformers/all-MiniLM-L6-v2"
    assert len(revision) == 40, "the model revision is pinned, not just its name"
    assert (dimensions, metric, normalized) == (384, "cosine", 1)


def test_every_vector_is_the_declared_length_and_unit_long():
    index = store.read(BIRDS / ".hmd" / "index.sqlite")
    dimensions = index["model"][2]
    for name, _, _, blob in index["cards"]:
        assert len(blob) == dimensions * 4, name
        norm = sum(value * value for value in store.unpack(blob)) ** 0.5
        assert abs(norm - 1.0) < 1e-5, name


class _Model:
    id = "fake"
    revision = "r1"
    dimensions = 2


def test_a_written_index_names_this_tool_and_its_version(tmp_path):
    out = tmp_path / "index.sqlite"
    store.write(out, "vault", _Model(), [("a", "a.hmd", "0" * 64, [1.0, 0.0])])
    tool = store.read(out)["meta"][3]
    assert tool == f"hmd-semantics {hypermarkdown_semantics.__version__}"


def test_the_committed_index_was_built_under_the_tool_s_former_name():
    # The fixture was built before the builder moved here, and rebuilding it
    # needs a model. The tool string is a record of what built a file, and
    # readers do not compare it.
    tool = store.read(BIRDS / ".hmd" / "index.sqlite")["meta"][3]
    assert tool in ("hql-semantics 0.1.0", store.TOOL_VERSION)
