"""Read a vault exactly as HQL's document loader does.

The text embedded here and the text HQL hashes must be byte-identical. HQL
(https://github.com/ewiger/hql) is the index's reader, and its loader is
`src/document.rs` in that repository. A mismatch has no symptom: the index
scores text nobody wrote and every score is quietly wrong. So this module
reimplements that loader's header parser rather than reaching for a YAML
library, whose idea of the same document would differ in ways nothing would
report. A change to either loader must change both.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

DERIVED = ("title",)
"""Header keys the loader owns, and so leaves out of the indexed text. `title`
is written once at the front instead. Where a document sits — `name`, `path`,
`format` — is a field of the document and never a header entry, so an authored
key of that name is an ordinary authored entry and is indexed like any other."""


@dataclass(frozen=True)
class Document:
    name: str
    path: Path
    title: str
    header: dict
    body: str

    def text(self) -> str:
        """The words an index sees, as HQL's `Document::text()` assembles them."""
        parts = [self.title]
        for key in sorted(self.header):
            if key in DERIVED:
                continue
            _words(self.header[key], parts)
        parts.append(self.body)
        return " ".join(parts)

    def content_hash(self) -> str:
        return hashlib.sha256(self.text().encode("utf-8")).hexdigest()


def _words(value, out: list[str]) -> None:
    if isinstance(value, str):
        out.append(value)
    elif isinstance(value, list):
        for item in value:
            _words(item, out)
    elif isinstance(value, dict):
        for key in sorted(value):
            _words(value[key], out)


def split_header(source: str) -> tuple[str, str]:
    """The authored header and the body, as HQL's `split_header` divides them."""
    for opener in ("---\n", "---\r\n"):
        if source.startswith(opener):
            rest = source[len(opener) :]
            break
    else:
        return "", source
    offset = 0
    for line in rest.splitlines(keepends=True):
        if line.rstrip() == "---":
            return rest[:offset], rest[offset + len(line) :]
        offset += len(line)
    return "", source


def parse_header(source: str) -> dict:
    lines = [
        line
        for line in source.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    cursor = [0]
    return _parse_block(lines, cursor, 0)


def _indent_of(line: str) -> int:
    return len(line) - len(line.lstrip())


def _parse_block(lines: list[str], cursor: list[int], indent: int):
    if cursor[0] < len(lines) and lines[cursor[0]].lstrip().startswith("- "):
        items = []
        while cursor[0] < len(lines):
            line = lines[cursor[0]]
            if _indent_of(line) < indent or not line.lstrip().startswith("- "):
                break
            items.append(_parse_scalar(line.lstrip()[2:].strip()))
            cursor[0] += 1
        return items

    entries: dict = {}
    while cursor[0] < len(lines):
        line = lines[cursor[0]]
        own = _indent_of(line)
        if own < indent:
            break
        trimmed = line.strip()
        if ":" not in trimmed:
            # Not a mapping line at this level; stop rather than guess.
            break
        key, rest = trimmed.split(":", 1)
        key = key.strip().strip('"')
        rest = rest.strip()
        cursor[0] += 1
        if rest:
            entries[key] = _parse_scalar(rest)
            continue
        following = lines[cursor[0]] if cursor[0] < len(lines) else None
        deeper = max(own + 1, _indent_of(following) if following else own + 1)
        if following is not None and _indent_of(following) > own:
            entries[key] = _parse_block(lines, cursor, deeper)
        else:
            entries[key] = None
    return entries


def _parse_scalar(text: str):
    if text.startswith("[") and text.endswith("]"):
        inner = text[1:-1]
        return [_parse_scalar(item.strip()) for item in inner.split(",") if item.strip()]
    if len(text) >= 2 and (
        (text.startswith('"') and text.endswith('"'))
        or (text.startswith("'") and text.endswith("'"))
    ):
        return text[1:-1]
    if text == "true":
        return True
    if text == "false":
        return False
    if text in ("null", "~", ""):
        return None
    try:
        return int(text)
    except ValueError:
        pass
    try:
        value = float(text)
    except ValueError:
        return text
    return value if value == value and abs(value) != float("inf") else text


def _heading(body: str) -> str | None:
    for line in body.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped[2:].strip()
    return None


def _stem(path: Path) -> str:
    return path.stem


def _relative_name(root: Path, path: Path) -> str:
    return path.relative_to(root).with_suffix("").as_posix()


FORMATS = {".hmd": "Hmd", ".md": "Markdown", ".markdown": "Markdown"}


def load(root: Path) -> list[Document]:
    """Every document under a root, named as HQL's loader names them."""
    files = sorted(
        path
        for path in root.rglob("*")
        if path.is_file()
        and path.suffix in FORMATS
        and not any(part.startswith(".") for part in path.relative_to(root).parts)
    )
    seen: dict[str, int] = {}
    for path in files:
        seen[_stem(path)] = seen.get(_stem(path), 0) + 1

    documents = []
    for path in files:
        source = path.read_text(encoding="utf-8")
        authored, body = split_header(source)
        header = parse_header(authored)
        title = header.get("title")
        if not isinstance(title, str):
            title = _heading(body)
        stem = _stem(path)
        name = _relative_name(root, path) if seen[stem] > 1 else stem
        documents.append(
            Document(
                name=name,
                path=path,
                title=title if isinstance(title, str) else name,
                header=header,
                body=body,
            )
        )
    return documents
