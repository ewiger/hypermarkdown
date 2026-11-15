"""Turn text into vectors, with a model in this process or one over HTTP.

The model is named and its revision pinned, because a `Retrieval` claims both
and a claim that is not pinned is not a claim.

Both embedders return unit-length vectors, because the reader scores with a dot
product and that is cosine only for unit-length vectors. Normalising happens here
regardless of what a provider returned or claims to return — a provider asked for
fewer dimensions than its model computes returns a prefix of a unit vector, which
is not itself one.

`local` pools the mean over the tokens the attention mask keeps, followed by L2
normalisation, which is what the sentence-transformers wrapper around this
checkpoint does; reproducing it here keeps the dependency to `transformers` and
`torch`. `http` speaks one OpenAI-shaped wire format over the standard library,
so a hosted embedder costs this producer no dependency and indexing through one
needs no `torch` installed at all.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable

from . import config as config_module
from . import store

DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
DEFAULT_REVISION = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"
MAX_TOKENS = 256
METRIC = "cosine"
BATCH = 16
TIMEOUT = 60
MAX_DIMENSIONS = 8192
"""The widest vector HQL's reader accepts, so the producer refuses one it
would have to be told about later rather than writing an unreadable index."""


class EmbedError(Exception):
    """A vector could not be computed, or could not be trusted once it was."""


def normalise(vector: list[float], what: str = "a vector") -> list[float]:
    """A vector scaled to unit length, which is what a dot product needs.

    A zero vector has no direction to preserve, so it is a provider failure
    rather than a value to divide by.
    """
    norm = store.norm(vector)
    if not norm > 0.0:
        raise EmbedError(f"{what}: every component is zero, so it has no direction")
    return [value / norm for value in vector]


@dataclass(frozen=True)
class Local:
    """A checkpoint loaded into this process, and what it reports about itself."""

    id: str
    revision: str
    dimensions: int
    _tokenizer: object
    _model: object

    def embed(self, texts: list[str]) -> list[list[float]]:
        import torch

        vectors: list[list[float]] = []
        for start in range(0, len(texts), BATCH):
            batch = texts[start : start + BATCH]
            encoded = self._tokenizer(
                batch,
                padding=True,
                truncation=True,
                max_length=MAX_TOKENS,
                return_tensors="pt",
            )
            with torch.no_grad():
                output = self._model(**encoded)
            mask = encoded["attention_mask"].unsqueeze(-1).float()
            pooled = (output.last_hidden_state * mask).sum(1) / mask.sum(1).clamp(min=1e-9)
            pooled = torch.nn.functional.normalize(pooled, p=2, dim=1)
            vectors.extend(row.tolist() for row in pooled)
        return vectors


class Remote:
    """A model reached over HTTP, speaking `POST /v1/embeddings`.

    `dimensions` is unknown until the first response unless configuration
    declared it, and every later vector is checked against it: a provider that
    quietly changes a model's width would otherwise be a rebuilt index scoring
    against a different geometry.
    """

    def __init__(self, id, revision, endpoint, key=None, dimensions=None, post=None):
        self.id = id
        self.revision = revision
        self.endpoint = endpoint
        self.dimensions = dimensions
        self._key = key
        self._post = post or _post

    def embed(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for start in range(0, len(texts), BATCH):
            batch = texts[start : start + BATCH]
            vectors.extend(self._batch(batch))
        return vectors

    def _batch(self, batch: list[str]) -> list[list[float]]:
        headers = {"Content-Type": "application/json"}
        if self._key:
            headers["Authorization"] = f"Bearer {self._key}"
        answer = self._post(self.endpoint, {"input": batch, "model": self.id}, headers)
        rows = _rows(answer, len(batch), self.endpoint)
        return [self._vector(row, index) for index, row in enumerate(rows)]

    def _vector(self, row, index: int) -> list[float]:
        where = f"{self.endpoint}: vector {index}"
        values = row.get("embedding") if isinstance(row, dict) else None
        if not isinstance(values, list) or not values:
            raise EmbedError(f"{where}: no `embedding` list in the response")
        for value in values:
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise EmbedError(f"{where}: `embedding` holds {value!r}, which is not a number")
        values = [float(value) for value in values]
        if self.dimensions is None:
            if len(values) > MAX_DIMENSIONS:
                raise EmbedError(
                    f"{where}: {len(values)} dimensions, and the reader accepts "
                    f"at most {MAX_DIMENSIONS}"
                )
            self.dimensions = len(values)
        elif len(values) != self.dimensions:
            raise EmbedError(
                f"{where}: {len(values)} dimensions where {self.dimensions} were "
                "expected; the model or its `dimensions` has changed"
            )
        # Unconditional, whatever the provider returned: a truncated embedding is
        # a prefix of a unit vector and is not one.
        return normalise(values, where)


def _rows(answer, expected: int, endpoint: str) -> list:
    """The `data` rows of a response, in the order the provider numbered them."""
    if not isinstance(answer, dict):
        raise EmbedError(f"{endpoint}: the response is not a JSON object")
    if "error" in answer:
        raise EmbedError(f"{endpoint}: {_message(answer['error'])}")
    rows = answer.get("data")
    if not isinstance(rows, list):
        raise EmbedError(f"{endpoint}: the response has no `data` list")
    if len(rows) != expected:
        raise EmbedError(
            f"{endpoint}: {len(rows)} vectors for {expected} inputs; a missing "
            "vector would silently shift every card onto another card's text"
        )
    # Arrival order is not promised, and pairing a card with another card's
    # vector has no symptom, so order by what the provider numbered them.
    if all(isinstance(row, dict) and isinstance(row.get("index"), int) for row in rows):
        rows = sorted(rows, key=lambda row: row["index"])
    return rows


def _message(error) -> str:
    if isinstance(error, dict):
        return str(error.get("message") or error)
    return str(error)


def _post(url: str, payload: dict, headers: dict) -> dict:
    """One request, with the standard library and no new dependency."""
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        # The body carries the provider's reason; the status alone rarely does.
        detail = error.read().decode("utf-8", "replace").strip()[:500]
        raise EmbedError(f"{url}: HTTP {error.code} {error.reason}: {detail}") from error
    except urllib.error.URLError as error:
        raise EmbedError(f"{url}: unreachable: {error.reason}") from error
    except json.JSONDecodeError as error:
        raise EmbedError(f"{url}: the response is not JSON: {error}") from error


def load(embedder=None, offline: bool = False, post=None):
    """The embedder a vault declared, ready to embed.

    Refuses before reading a card rather than after: an unset key or an
    unreachable combination of flags is cheaper to learn immediately.
    """
    embedder = config_module.check(embedder or config_module.Embedder())
    if embedder.remote:
        return _load_remote(embedder, offline, post)
    return _load_local(embedder, offline)


def _load_remote(embedder, offline: bool, post):
    if offline:
        raise EmbedError(
            "--offline refuses the network, and the `http` provider is the "
            "network. Build with the `local` provider, or drop --offline"
        )
    key = None
    if embedder.api_key_env:
        key = os.environ.get(embedder.api_key_env)
        if not key:
            raise EmbedError(
                f"${embedder.api_key_env} is unset or empty, and "
                f"`{embedder.endpoint}` is configured to be called with it"
            )
    return Remote(
        id=embedder.model,
        revision=embedder.revision,
        endpoint=embedder.endpoint,
        key=key,
        dimensions=embedder.dimensions,
        post=post,
    )


def _load_local(embedder, offline: bool) -> Local:
    model_id = embedder.model or DEFAULT_MODEL
    revision = embedder.revision or DEFAULT_REVISION
    if offline:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
    try:
        from transformers import AutoModel, AutoTokenizer
    except ImportError as error:  # pragma: no cover - depends on the environment
        raise EmbedError(
            "the `local` provider needs `transformers` and `torch`: "
            "pip install 'hypermarkdown-semantics[local]', or configure the `http` "
            "provider, "
            "which needs neither"
        ) from error

    tokenizer = AutoTokenizer.from_pretrained(model_id, revision=revision)
    model = AutoModel.from_pretrained(model_id, revision=revision)
    model.eval()
    dimensions = int(model.config.hidden_size)
    if embedder.dimensions is not None and embedder.dimensions != dimensions:
        raise EmbedError(
            f"{model_id} computes {dimensions} dimensions where "
            f"`dimensions = {embedder.dimensions}` was declared"
        )
    return Local(
        id=model_id,
        revision=revision,
        dimensions=dimensions,
        _tokenizer=tokenizer,
        _model=model,
    )
