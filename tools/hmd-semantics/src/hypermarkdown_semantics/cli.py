"""hmd-semantics: build, verify and inspect a HyperMarkdown vault's semantic index.

The index is the vault's, in its `.hmd/`. This tool is its producer and the only
program that runs a model; a reader, such as HQL's `hmd` package, opens the file
and never invokes this tool.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import config, embed, store
from . import vault as vault_reader


def build(args) -> int:
    root = Path(args.vault)
    documents = vault_reader.load(root)
    if not documents:
        print(f"{root}: no documents", file=sys.stderr)
        return 1
    # The vault declares its embedder; flags override it field by field.
    embedder = config.resolve(
        config.read(root),
        provider=args.provider,
        model=args.model,
        revision=args.revision,
        endpoint=args.endpoint,
        api_key_env=args.api_key_env,
        dimensions=args.dimensions,
    )
    model = embed.load(embedder, offline=args.offline)
    vectors = model.embed([document.text() for document in documents])
    queries = sorted(set(args.query or []))
    query_rows = list(zip(queries, model.embed(queries))) if queries else []
    rows = [
        (
            document.name,
            document.path.relative_to(root).as_posix(),
            document.content_hash(),
            vector,
        )
        for document, vector in zip(documents, vectors)
    ]
    out = Path(args.out) if args.out else config.index(root)
    store.write(out, root.as_posix(), model, rows, query_rows, built_at=args.built_at)
    print(
        f"{out}: {len(rows)} cards, {len(query_rows)} queries, "
        f"{model.dimensions} dimensions, {model.id} via {embedder.provider}"
    )
    return 0


def verify(args) -> int:
    """Exit 1 when the index no longer describes the vault."""
    root = Path(args.vault)
    path = Path(args.index) if args.index else config.index(root)
    index = store.read(path)
    if index["meta"][0] != store.SCHEMA_VERSION:
        print(f"unknown index schema: {index['meta'][0]}", file=sys.stderr)
        return 1
    documents = {document.name: document for document in vault_reader.load(root)}
    indexed = {row[0]: row for row in index["cards"]}
    problems = []
    for name, document in sorted(documents.items()):
        row = indexed.get(name)
        if row is None:
            problems.append(f"{name}: absent from the index")
            continue
        if row[2] != document.content_hash():
            problems.append(f"{name}: stale, the text has changed since the build")
    for name in sorted(set(indexed) - set(documents)):
        problems.append(f"{name}: in the index and not in the vault")
    dimensions = index["model"][2]
    metric, normalized = index["model"][3], index["model"][4]
    if metric != store.METRIC:
        problems.append(f"the index declares metric {metric!r}, and the reader computes cosine")
    if not normalized:
        problems.append(
            "the index declares normalized = 0, and the reader scores with a dot "
            "product, which is cosine only for unit-length vectors"
        )
    for name, _, _, blob in index["cards"]:
        if len(blob) != dimensions * 4:
            problems.append(f"{name}: embedding is {len(blob)} bytes, not {dimensions * 4}")
        elif not store.unit(store.unpack(blob)):
            # The claim `normalized = 1` makes, checked against the vectors.
            length = store.norm(store.unpack(blob))
            problems.append(f"{name}: embedding has length {length:.6f}, not 1")
    for text, blob in index["queries"]:
        if len(blob) != dimensions * 4:
            problems.append(f"query {text!r}: embedding is the wrong length")
        elif not store.unit(store.unpack(blob)):
            length = store.norm(store.unpack(blob))
            problems.append(f"query {text!r}: embedding has length {length:.6f}, not 1")
    for problem in problems:
        print(problem, file=sys.stderr)
    if problems:
        return 1
    print(f"{path}: clean, {len(indexed)} cards")
    return 0


def inspect(args) -> int:
    index = store.read(Path(args.index))
    model_id, revision, dimensions, metric, normalized = index["model"]
    version, vault_name, built_at, tool = index["meta"]
    print(f"schema        {version}")
    print(f"vault         {vault_name}")
    print(f"built at      {built_at}")
    print(f"tool          {tool}")
    print(f"model         {model_id}")
    print(f"revision      {revision}")
    print(f"dimensions    {dimensions}")
    print(f"metric        {metric}")
    print(f"normalized    {bool(normalized)}")
    print(f"cards         {len(index['cards'])}")
    print(f"queries       {len(index['queries'])}")
    for text, _ in index["queries"]:
        print(f"              {text}")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="hmd-semantics", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    builder = commands.add_parser("build", help="embed a vault into an index")
    builder.add_argument("--vault", required=True)
    builder.add_argument("--out", default=None,
                         help="the index to write; the vault's `[semantics] index` "
                              f"otherwise, else {config.DEFAULT_INDEX}")
    # Every embedder flag defaults to None so that "not given" stays
    # distinguishable from "given the default", which is what lets the vault's
    # `[semantics.embedder]` be overridden field by field.
    builder.add_argument("--provider", choices=config.PROVIDERS, default=None,
                         help="where the model runs; the vault's setting otherwise")
    builder.add_argument("--model", default=None,
                         help=f"default {embed.DEFAULT_MODEL} under `local`")
    builder.add_argument("--revision", default=None,
                         help="the pinned revision a score claims; required for `http`")
    builder.add_argument("--endpoint", default=None,
                         help="an OpenAI-shaped POST /v1/embeddings URL, for `http`")
    builder.add_argument("--api-key-env", default=None, metavar="VAR",
                         help="the environment variable holding the key, never the key")
    builder.add_argument("--dimensions", type=int, default=None,
                         help="the width to expect, checked against what arrives")
    builder.add_argument("--offline", action="store_true",
                         help="refuse the network; what CI uses")
    builder.add_argument("--query", action="append", default=[],
                         help="a query to embed into the index; repeatable, "
                              "because the reader cannot embed one itself")
    builder.add_argument("--built-at", default=None,
                         help="pin the build stamp, so a rebuild is byte-identical")
    builder.set_defaults(run=build)

    verifier = commands.add_parser("verify", help="check an index against a vault")
    verifier.add_argument("--vault", required=True)
    verifier.add_argument("--index", default=None,
                          help="the index to check; the vault's own otherwise")
    verifier.set_defaults(run=verify)

    inspector = commands.add_parser("inspect", help="what an index says about itself")
    inspector.add_argument("--index", required=True)
    inspector.set_defaults(run=inspect)

    args = parser.parse_args(argv)
    try:
        return args.run(args)
    except (config.ConfigError, embed.EmbedError, store.StoreError) as error:
        # A refusal the operator can act on, not a traceback.
        print(f"{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
