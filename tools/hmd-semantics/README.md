# hmd-semantics

[![Python](https://img.shields.io/badge/python-3.11%2B-3776ab)](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd-semantics/DEVELOP.md)
[![Documentation](https://img.shields.io/badge/docs-hypermarkdown.org-ffb300)](https://hypermarkdown.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd-semantics/LICENSE)

The builder of a [HyperMarkdown](https://hypermarkdown.org/) vault's semantic
index. It reads a vault, embeds the text of each card with an embedding model,
and writes an SQLite file into the vault's `.hmd/` directory. A reader ranks
cards against a query by opening that file; it runs no model.

The index, its configuration and its schema are specified by
[HMD-0028](https://github.com/ewiger/hypermarkdown/blob/main/doc/proposals/HMD-0028/index.hmd).
The first reader is the `hmd` package of [HQL](https://github.com/ewiger/hql),
whose `semantic` ranks a vault's cards from this file.

One of the tools in the
[HyperMarkdown monorepo](https://github.com/ewiger/hypermarkdown).

## Install

```sh
uv tool install hypermarkdown-semantics      # or: pip install hypermarkdown-semantics
uv tool install "hypermarkdown-semantics[local]"   # with the in-process model
```

`--vault` names the vault root, the directory holding `.hmd/`. The cards are
read from the namespace root its `location_path` setting names (default `.`,
the vault itself), a card's path is relative to it, and a `.md` or `.markdown`
file there is a card as much as a `.hmd` file.

That installs the `hmd-semantics` command and no dependency: reading a vault,
writing the index and calling an embedder over HTTP use the standard library.
Python 3.11 or newer.

The `local` provider runs a checkpoint in the tool's own process and needs
`torch` and `transformers`. They are the extra `local`:

```sh
pip install "hypermarkdown-semantics[local] @ git+https://github.com/ewiger/hypermarkdown#subdirectory=tools/hmd-semantics"
```

## Use

`--vault` names a vault's root: the directory that holds `.hmd/`.

```sh
hmd-semantics build   --vault path/to/vault \
                      --query "night hunting birds" \
                      --query "birds weaving hanging nests"
hmd-semantics verify  --vault path/to/vault
hmd-semantics inspect --index path/to/vault/.hmd/index.sqlite
```

`build` writes, and `verify` reads, the index the vault names with
`[semantics] index` in its `.hmd/config.toml`: a path inside the vault, read
against the vault's root. A vault that names none gets `.hmd/index.sqlite`.
`--out` on `build` and `--index` on `verify` name another file for one run.

`--query` is repeatable and embeds a question into the index. A reader has no
model, so it cannot embed a question: it looks a query up in the index, and a
query the index does not hold is a failure. An index answers the questions it
was built for.

`--offline` refuses the network; the model must already be in the local cache.
`--built-at` pins the build stamp, so rebuilding an unchanged vault produces a
byte-identical file.

`verify` exits 1 when the index no longer describes the vault: a card whose
text has changed since the build, a card missing from either side, a vector
that is not the declared length, or a vector that is not unit length.

`inspect` prints what an index says about itself: its schema version, the vault
it was built for, the build stamp, the tool that built it, the model and its
revision, the dimensions, the metric, and the queries it holds.

## Embedders

Two providers, for the two ways a model is reached.

| Provider | The model runs | Needs |
| --- | --- | --- |
| `local` (default) | in this process | the `local` extra, and the checkpoint in the local cache |
| `http` | anywhere else | `endpoint`, `model`, `revision` |

The default `local` model is `sentence-transformers/all-MiniLM-L6-v2` at
revision `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`, 384 dimensions.

`http` speaks one OpenAI-shaped wire format: it sends a `POST` with the body
`{"input": [...], "model": "..."}` and reads
`{"data": [{"index": N, "embedding": [...]}]}`. A hosted provider and a model
server on `localhost` both implement it.

A vault declares its embedder in its `.hmd/config.toml`, beside the index the
embedder fills. `[semantics.embedder]` is optional and its absence means
`local`.

```toml
[semantics]
index = ".hmd/index.sqlite"

[semantics.embedder]
provider    = "http"
model       = "text-embedding-3-small"
revision    = "2024-01-25"
endpoint    = "https://api.openai.com/v1/embeddings"
api_key_env = "OPENAI_API_KEY"
dimensions  = 1536
```

| Key | Meaning |
| --- | --- |
| `provider` | `local` or `http`; `local` when absent. Any other value is refused |
| `model` | The model's name. Required for `http`; the default checkpoint for `local` when absent |
| `revision` | The pinned revision of the model. Required for `http`; the default checkpoint's revision for `local` when absent |
| `endpoint` | The URL an `http` embedder is called at. Required for `http` |
| `api_key_env` | The name of the environment variable that holds the key. Optional |
| `dimensions` | The width to expect, a positive integer. Optional; a vector of another width is refused |

An unknown key in `[semantics.embedder]` is refused by name. A typo that
selected a default would index a vault with a model nobody chose.

Every `build` flag overrides the matching key for one run:

```sh
hmd-semantics build --vault path/to/vault \
                    --out /tmp/index.sqlite \
                    --provider http \
                    --model nomic-embed-text \
                    --revision v1.5 \
                    --endpoint http://localhost:11434/v1/embeddings \
                    --query "night hunting birds"
```

`revision` is required for `http` and the tool refuses without it. An endpoint
offers nothing to derive a revision from, and the index records the revision
that produced its vectors, so whoever configures the vault states it.

`--offline` with the `http` provider is refused: the network is the whole of
that provider.

### Keys

`api_key_env` names the environment variable holding the key. It never holds
the key, because `.hmd/config.toml` is a committed file. A literal `api_key` in
the table is refused, and the refusal says where the key goes. A variable that
is unset or empty is refused before a card is read.

An `http` embedder sends the text of every card to the endpoint it names.

### Vectors are unit length

A reader scores with a dot product, which is cosine similarity only for
unit-length vectors. The tool L2-normalises every vector whatever a provider
returned, refuses to write a vector that is not unit length, and records
`normalized = 1` in the index. A provider asked for fewer dimensions than its
model computes returns a prefix of a unit vector, which is not unit length
until it is normalised again.

## The text contract is shared with HQL

The text of a card that is embedded and hashed is the card's title, then the
strings of its authored frontmatter in key order, then its body, joined by one
space. `title` is written once at the front and left out of the key order.

HQL's document loader computes the same text and hashes it to decide whether a
vector is stale, so the two must agree byte for byte. This tool therefore
reimplements HQL's loader, `src/document.rs` in
[HQL's repository](https://github.com/ewiger/hql), including its frontmatter
parser, and does not use a YAML library. A change to either loader must change
both. A difference between them has no error: every card would report as stale
in HQL, or a score would describe text nobody wrote.

The same coupling fixes which files are cards and what they are named, and
here the tool does not yet follow the format. A vault's cards start at its
namespace root, the `location_path` setting of `.hmd/config.toml`, and are `.hmd`
files. This tool, as HQL's loader does, reads every
`.hmd`, `.md` and `.markdown` file under the vault's root, outside entries
whose name starts with a dot, named by its file name without the extension, or
by its path without the extension when two files share a name.

## License

MIT. See [`LICENSE`](https://github.com/ewiger/hypermarkdown/blob/main/tools/hmd-semantics/LICENSE).
