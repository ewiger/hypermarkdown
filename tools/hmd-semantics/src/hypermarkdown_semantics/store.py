"""The SQLite index: schema version 1, and nothing the reader cannot check.

A reader only ever reads this file, and treats it as untrusted input, so
everything it must verify is written explicitly: the schema version, the
dimension count, the vault the index was built for, and a hash of the text each
vector was computed from.
"""

from __future__ import annotations

import sqlite3
import struct
from datetime import datetime, timezone
from pathlib import Path

from . import __version__

SCHEMA_VERSION = 1
TOOL_VERSION = f"hmd-semantics {__version__}"
METRIC = "cosine"
TOLERANCE = 1e-5
"""How far from unit length a stored vector may be. The reader scores with a dot
product, which is cosine only for unit-length vectors, so this is the tolerance
of that equality rather than a formatting preference."""


class StoreError(Exception):
    """An index cannot be written as the reader requires it."""


def norm(vector) -> float:
    """The Euclidean length of a vector."""
    return sum(value * value for value in vector) ** 0.5


def unit(vector) -> bool:
    """Whether a vector is unit-length within `TOLERANCE`."""
    return abs(norm(vector) - 1.0) <= TOLERANCE

SCHEMA = """
CREATE TABLE model (
    id          TEXT    PRIMARY KEY,
    revision    TEXT    NOT NULL,
    dimensions  INTEGER NOT NULL,
    metric      TEXT    NOT NULL,
    normalized  INTEGER NOT NULL
);

CREATE TABLE index_meta (
    schema_version INTEGER NOT NULL,
    vault          TEXT    NOT NULL,
    built_at       TEXT    NOT NULL,
    tool_version   TEXT    NOT NULL
);

CREATE TABLE card (
    name         TEXT PRIMARY KEY,
    path         TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    embedding    BLOB NOT NULL
);

CREATE TABLE query (
    text      TEXT PRIMARY KEY,
    embedding BLOB NOT NULL
);
"""


def pack(vector) -> bytes:
    """A vector as little-endian f32, which is what the reader expects."""
    return struct.pack("<%df" % len(vector), *vector)


def unpack(blob: bytes) -> list[float]:
    return list(struct.unpack("<%df" % (len(blob) // 4), blob))


def write(out: Path, vault_name: str, model, rows, queries=(), built_at=None) -> None:
    """Write a whole index.

    `rows` is (name, path, content_hash, vector); `queries` is (text, vector).
    Queries are embedded here because the model lives here: a reader
    reads vectors and never computes one.

    Every vector is checked against what `model.normalized` is about to claim.
    The reader trusts that column and scores with a dot product, so writing a
    vector that is not unit-length would make every score wrong with no symptom.
    """
    for name, _, _, vector in rows:
        _unit_or_refuse(vector, f"card `{name}`", model.dimensions)
    for text, vector in queries:
        _unit_or_refuse(vector, f"query {text!r}", model.dimensions)
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        out.unlink()
    connection = sqlite3.connect(out)
    try:
        connection.executescript(SCHEMA)
        connection.execute(
            "INSERT INTO model VALUES (?, ?, ?, ?, ?)",
            (model.id, model.revision, model.dimensions, METRIC, 1),
        )
        stamp = built_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        connection.execute(
            "INSERT INTO index_meta VALUES (?, ?, ?, ?)",
            (SCHEMA_VERSION, vault_name, stamp, TOOL_VERSION),
        )
        connection.executemany(
            "INSERT INTO card VALUES (?, ?, ?, ?)",
            [(name, path, digest, pack(vector)) for name, path, digest, vector in rows],
        )
        connection.executemany(
            "INSERT INTO query VALUES (?, ?)",
            [(text, pack(vector)) for text, vector in queries],
        )
        connection.commit()
    finally:
        connection.close()


def _unit_or_refuse(vector, what: str, dimensions: int) -> None:
    if len(vector) != dimensions:
        raise StoreError(
            f"{what}: {len(vector)} dimensions where the model declares {dimensions}"
        )
    if not unit(vector):
        raise StoreError(
            f"{what}: its length is {norm(vector):.6f} and the reader scores with "
            "a dot product, which is cosine only at length 1. Normalise before "
            "storing"
        )


def read(path: Path) -> dict:
    """Everything an index holds, for `verify` and `inspect`."""
    connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        model = connection.execute(
            "SELECT id, revision, dimensions, metric, normalized FROM model"
        ).fetchone()
        meta = connection.execute(
            "SELECT schema_version, vault, built_at, tool_version FROM index_meta"
        ).fetchone()
        cards = connection.execute(
            "SELECT name, path, content_hash, embedding FROM card ORDER BY name"
        ).fetchall()
        queries = connection.execute(
            "SELECT text, embedding FROM query ORDER BY text"
        ).fetchall()
    finally:
        connection.close()
    return {"model": model, "meta": meta, "cards": cards, "queries": queries}
