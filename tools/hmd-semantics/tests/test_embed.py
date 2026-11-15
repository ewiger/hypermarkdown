"""The embedder: the arithmetic a score rests on, and what it refuses.

Unit tests. No network and no model: a fake transport answers the `http`
provider, so what is under test is this producer's own arithmetic and refusals
rather than a provider's availability. `torch` is never imported.
"""

import dataclasses
import math
from pathlib import Path

import pytest

from hypermarkdown_semantics import config
from hypermarkdown_semantics import embed
from hypermarkdown_semantics import store

REMOTE = config.Embedder(
    provider="http",
    model="text-embedding-3-small",
    revision="2024-01-25",
    endpoint="https://example.invalid/v1/embeddings",
)


class Transport:
    """A fake `POST /v1/embeddings`, recording what it was asked."""

    def __init__(self, vectors=None, answer=None):
        self.vectors = vectors
        self.answer = answer
        self.calls = []

    def __call__(self, url, payload, headers):
        self.calls.append({"url": url, "payload": payload, "headers": headers})
        if self.answer is not None:
            return self.answer
        batch = payload["input"]
        vectors = self.vectors or [[float(len(text)), 1.0, 0.0] for text in batch]
        return {
            "data": [
                {"index": index, "embedding": list(vectors[index % len(vectors)])}
                for index in range(len(batch))
            ]
        }


def remote(transport, **fields):
    return embed.load(dataclasses.replace(REMOTE, **fields), post=transport)


# --- the arithmetic -------------------------------------------------------


def test_a_normalised_pair_scores_by_dot_product_exactly_as_cosine():
    # The equality the whole reader rests on: it computes a dot product and
    # reports the metric as cosine, which holds only at unit length.
    left, right = [3.0, 4.0, 0.0], [1.0, 2.0, 2.0]
    cosine = sum(a * b for a, b in zip(left, right)) / (store.norm(left) * store.norm(right))
    unit_left = embed.normalise(left)
    unit_right = embed.normalise(right)
    dot = sum(a * b for a, b in zip(unit_left, unit_right))
    assert dot == pytest.approx(cosine, abs=1e-12)
    assert store.unit(unit_left) and store.unit(unit_right)


def test_normalising_preserves_direction_and_so_preserves_every_ranking():
    # Scaling a vector must not reorder anything, or an index would rank by
    # magnitude — by how long a card is — rather than by direction.
    query = embed.normalise([1.0, 1.0, 0.0])
    near, far = [0.9, 1.0, 0.1], [0.1, 0.0, 1.0]
    for scale in (0.01, 1.0, 100.0):
        scaled_near = embed.normalise([value * scale for value in near])
        scaled_far = embed.normalise([value * scale for value in far])
        assert sum(a * b for a, b in zip(query, scaled_near)) > sum(
            a * b for a, b in zip(query, scaled_far)
        )


def test_a_vector_identical_to_the_query_scores_one():
    vector = embed.normalise([2.0, -1.0, 0.5])
    assert sum(value * value for value in vector) == pytest.approx(1.0, abs=1e-12)


def test_an_already_unit_vector_is_left_where_it_is():
    vector = [0.6, 0.8]
    assert embed.normalise(vector) == pytest.approx(vector, abs=1e-12)


def test_a_truncated_embedding_is_renormalised_rather_than_stored_short_of_unit():
    # Asking a provider for fewer dimensions than its model computes returns a
    # prefix of a unit vector, which is not itself a unit vector. Storing it as
    # one would make every score involving it quietly wrong.
    full = embed.normalise([1.0, 1.0, 1.0, 1.0])
    truncated = full[:2]
    assert not store.unit(truncated), "a prefix of a unit vector is not unit"
    assert store.norm(truncated) == pytest.approx(math.sqrt(0.5), abs=1e-9)
    assert store.unit(embed.normalise(truncated))


def test_the_http_provider_normalises_whatever_it_is_handed():
    transport = Transport(vectors=[[3.0, 4.0, 0.0]])
    model = remote(transport)
    vector = model.embed(["anything"])[0]
    assert store.unit(vector)
    assert vector == pytest.approx([0.6, 0.8, 0.0], abs=1e-9)


def test_a_zero_vector_is_refused_rather_than_divided_by():
    with pytest.raises(embed.EmbedError, match="no direction"):
        embed.normalise([0.0, 0.0, 0.0])
    with pytest.raises(embed.EmbedError):
        remote(Transport(vectors=[[0.0, 0.0, 0.0]])).embed(["a card"])


# --- the request ----------------------------------------------------------


def test_the_request_names_the_endpoint_the_model_and_the_batch():
    transport = Transport()
    model = remote(transport)
    model.embed(["first", "second"])
    assert len(transport.calls) == 1
    call = transport.calls[0]
    assert call["url"] == REMOTE.endpoint
    assert call["payload"] == {"input": ["first", "second"], "model": REMOTE.model}
    assert call["headers"]["Content-Type"] == "application/json"


def test_no_bearer_header_is_sent_when_no_key_is_configured():
    # A model server on localhost needs no credential, and inventing an empty
    # one would be a header a provider may reject.
    transport = Transport()
    remote(transport).embed(["a card"])
    assert "Authorization" not in transport.calls[0]["headers"]


def test_the_key_comes_from_the_environment_and_is_sent_as_a_bearer(monkeypatch):
    monkeypatch.setenv("HQL_TEST_KEY", "sk-from-the-environment")
    transport = Transport()
    model = remote(transport, api_key_env="HQL_TEST_KEY")
    model.embed(["a card"])
    assert transport.calls[0]["headers"]["Authorization"] == "Bearer sk-from-the-environment"


def test_an_unset_key_variable_is_refused_by_name_before_any_request(monkeypatch):
    monkeypatch.delenv("HQL_TEST_KEY", raising=False)
    transport = Transport()
    with pytest.raises(embed.EmbedError, match="HQL_TEST_KEY"):
        remote(transport, api_key_env="HQL_TEST_KEY")
    assert transport.calls == [], "nothing is asked before the key is known"


def test_an_empty_key_variable_is_refused_like_an_unset_one(monkeypatch):
    monkeypatch.setenv("HQL_TEST_KEY", "")
    with pytest.raises(embed.EmbedError, match="HQL_TEST_KEY"):
        remote(Transport(), api_key_env="HQL_TEST_KEY")


def test_a_long_corpus_is_sent_in_batches_that_cover_it_once():
    transport = Transport(vectors=[[1.0, 0.0]])
    model = remote(transport)
    texts = [f"card {index}" for index in range(embed.BATCH * 2 + 3)]
    assert len(model.embed(texts)) == len(texts)
    sent = [text for call in transport.calls for text in call["payload"]["input"]]
    assert sent == texts, "every card exactly once, in order"
    assert len(transport.calls) == 3


def test_offline_refuses_the_http_provider_by_name():
    # `--offline` is what CI uses, and the network is this provider's whole
    # mechanism, so the combination is refused rather than attempted.
    with pytest.raises(embed.EmbedError, match="offline"):
        embed.load(REMOTE, offline=True, post=Transport())


# --- the response ---------------------------------------------------------


def test_a_response_out_of_order_is_reordered_by_its_index():
    # Arrival order is not promised, and pairing a card with another card's
    # vector has no symptom at all.
    answer = {
        "data": [
            {"index": 1, "embedding": [0.0, 1.0]},
            {"index": 0, "embedding": [1.0, 0.0]},
        ]
    }
    vectors = remote(Transport(answer=answer)).embed(["first", "second"])
    assert vectors[0] == pytest.approx([1.0, 0.0])
    assert vectors[1] == pytest.approx([0.0, 1.0])


def test_a_response_with_a_missing_vector_is_refused():
    answer = {"data": [{"index": 0, "embedding": [1.0, 0.0]}]}
    with pytest.raises(embed.EmbedError, match="1 vectors for 2 inputs"):
        remote(Transport(answer=answer)).embed(["first", "second"])


def test_a_width_that_changes_between_batches_is_refused():
    class Widening:
        def __init__(self):
            self.seen = 0

        def __call__(self, url, payload, headers):
            self.seen += 1
            width = 2 if self.seen == 1 else 3
            return {
                "data": [
                    {"index": index, "embedding": [1.0] + [0.0] * (width - 1)}
                    for index in range(len(payload["input"]))
                ]
            }

    texts = [f"card {index}" for index in range(embed.BATCH + 1)]
    with pytest.raises(embed.EmbedError, match="dimensions"):
        remote(Widening()).embed(texts)


def test_a_width_disagreeing_with_declared_dimensions_is_refused():
    transport = Transport(vectors=[[1.0, 0.0, 0.0]])
    with pytest.raises(embed.EmbedError, match="1536"):
        remote(transport, dimensions=1536).embed(["a card"])


def test_declared_dimensions_are_reported_before_any_card_is_embedded():
    # `store.write` reads `model.dimensions`, and a declared width is known
    # without asking anyone.
    assert remote(Transport(), dimensions=1536).dimensions == 1536


def test_an_undeclared_width_is_learned_from_the_first_response():
    model = remote(Transport(vectors=[[1.0, 0.0, 0.0]]))
    assert model.dimensions is None
    model.embed(["a card"])
    assert model.dimensions == 3


def test_a_width_beyond_what_the_reader_accepts_is_refused():
    wide = [1.0] + [0.0] * embed.MAX_DIMENSIONS
    with pytest.raises(embed.EmbedError, match="at most"):
        remote(Transport(vectors=[wide])).embed(["a card"])


@pytest.mark.parametrize(
    "answer",
    [
        {},
        {"data": "not a list"},
        {"data": [{"index": 0}]},
        {"data": [{"index": 0, "embedding": []}]},
        {"data": [{"index": 0, "embedding": ["not a number"]}]},
        {"data": [{"index": 0, "embedding": [True]}]},
        {"error": {"message": "model not found"}},
        "not an object",
    ],
)
def test_a_response_that_is_not_a_set_of_vectors_is_refused(answer):
    with pytest.raises(embed.EmbedError):
        remote(Transport(answer=answer)).embed(["a card"])


def test_a_provider_error_is_reported_with_its_own_message():
    answer = {"error": {"message": "you exceeded your quota"}}
    with pytest.raises(embed.EmbedError, match="exceeded your quota"):
        remote(Transport(answer=answer)).embed(["a card"])


# --- what reaches the index ------------------------------------------------


def test_an_index_built_from_a_fake_model_holds_only_unit_vectors(tmp_path):
    # The whole producer path, without a model or a network: what `verify`
    # checks, checked at the point the file is written.
    model = remote(Transport(vectors=[[3.0, 4.0, 0.0], [0.0, 0.0, 5.0]]))
    texts = ["the first card", "the second card"]
    vectors = model.embed(texts)
    rows = [
        (f"card-{index}", f"card-{index}.hmd", f"{index:064x}", vector)
        for index, vector in enumerate(vectors)
    ]
    queries = list(zip(["a question"], model.embed(["a question"])))
    out = tmp_path / ".hmd" / "index.sqlite"
    store.write(out, "a/vault", model, rows, queries)

    index = store.read(out)
    assert index["model"][0] == REMOTE.model
    assert index["model"][1] == REMOTE.revision
    assert index["model"][2] == 3
    assert index["model"][3] == store.METRIC
    assert index["model"][4] == 1, "the reader refuses an index declaring 0"
    for name, _, _, blob in index["cards"]:
        assert store.unit(store.unpack(blob)), name


def test_a_vector_that_is_not_unit_length_is_refused_at_the_boundary(tmp_path):
    # `normalized = 1` is a claim the reader trusts, so writing a vector that
    # does not support it is refused rather than written.
    model = remote(Transport(), dimensions=2)
    rows = [("a-card", "a-card.hmd", "0" * 64, [3.0, 4.0])]
    with pytest.raises(store.StoreError, match="length"):
        store.write(tmp_path / "index.sqlite", "a/vault", model, rows)


def test_a_vector_of_the_wrong_width_is_refused_at_the_boundary(tmp_path):
    model = remote(Transport(), dimensions=3)
    rows = [("a-card", "a-card.hmd", "0" * 64, [1.0, 0.0])]
    with pytest.raises(store.StoreError, match="dimensions"):
        store.write(tmp_path / "index.sqlite", "a/vault", model, rows)
