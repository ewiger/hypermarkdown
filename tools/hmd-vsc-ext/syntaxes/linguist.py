"""Extract the fence table's source from GitHub Linguist's language list.

    uv run python tools/hmd-vsc-ext/syntaxes/linguist.py path/to/languages.yml v9.7.0

The input is `lib/linguist/languages.yml` of github-linguist/linguist at a
release tag. The output, `syntaxes/languages.json`, holds what a fence rule
needs and nothing else: for each language with a TextMate scope, its name, its
aliases, its file extensions, and the scope. `syntaxes/fences.mjs` reads it.
"""

import json
import sys
from pathlib import Path

import yaml


def main() -> None:
    source, version = Path(sys.argv[1]), sys.argv[2]
    languages = yaml.safe_load(source.read_text(encoding="utf-8"))
    rows = []
    for name, entry in languages.items():
        scope = entry.get("tm_scope", "none")
        if scope == "none":
            continue
        rows.append(
            {
                "name": name,
                "scope": scope,
                "aliases": entry.get("aliases") or [],
                "extensions": entry.get("extensions") or [],
            }
        )
    out = Path(__file__).with_name("languages.json")
    lines = ",\n".join("    " + json.dumps(row, ensure_ascii=False) for row in rows)
    out.write_text(
        "{\n"
        f'  "source": "github-linguist/linguist {version}, lib/linguist/languages.yml",\n'
        '  "languages": [\n'
        f"{lines}\n"
        "  ]\n"
        "}\n",
        encoding="utf-8",
    )
    print(f"wrote {out}: {len(rows)} languages")


main()
