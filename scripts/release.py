#!/usr/bin/env python3
"""How a GitHub release of one of this repository's tools reads.

The repository releases three tools, each on its own tag prefix. A release page
lists all of them together, so every title has to say which tool it is and where
it is installed from. That cannot be left to three workflows that each spell
their own title. This script is the one place the rules live, and every release
workflow calls it:

    python3 scripts/release.py title  <tag>   # the release title
    python3 scripts/release.py latest <tag>   # true or false, for --latest
    python3 scripts/release.py notes  <tag>   # the release body, to stdout

The rules:

- A title is `<platform> · <package> <version>`. The platform is where a reader
  installs it from, which is what tells three tools apart. The package is the
  name a registry knows it by, as it was called at that version.
- Only the VS Code extension is marked Latest. GitHub keeps one Latest badge per
  repository, and the extension is what most visitors come to install.
- A body opens with one header line: the registry link, the install command,
  and the changelog the notes come from. The tool's changelog section for that
  version follows.

Stdlib only, since it runs on a bare CI runner.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

REPO = "ewiger/hypermarkdown"
ROOT = Path(__file__).resolve().parents[1]

#: Marks a body that already carries the header, so rewriting it is idempotent.
HEADER_MARK = "<!-- release-header -->"


@dataclass(frozen=True)
class Tool:
    prefix: str
    platform: str
    changelog: str
    latest: bool

    def package(self, version: str) -> str:
        raise NotImplementedError

    def links(self, version: str) -> list[str]:
        raise NotImplementedError


class PythonTool(Tool):
    def package(self, version: str) -> str:
        # Published as `hyper-markdown` until the rename in 0.2.0; a release
        # keeps the name it actually shipped under.
        return "hyper-markdown" if _key(version) < (0, 2, 0) else "hypermarkdown"

    def links(self, version: str) -> list[str]:
        name = self.package(version)
        return [
            f"[{name} {version}](https://pypi.org/project/{name}/{version}/)",
            f"`pip install {name}=={version}`",
        ]


class NpmTool(Tool):
    def package(self, version: str) -> str:
        return "@hypermarkdown/core"

    def links(self, version: str) -> list[str]:
        return [
            f"[@hypermarkdown/core {version}]"
            f"(https://www.npmjs.com/package/@hypermarkdown/core/v/{version})",
            f"`npm install @hypermarkdown/core@{version}`",
        ]


class ExtensionTool(Tool):
    def package(self, version: str) -> str:
        return "HyperMarkDown"

    def links(self, version: str) -> list[str]:
        return [
            "[Visual Studio Marketplace]"
            "(https://marketplace.visualstudio.com/items?itemName=hypermarkdown.hmd)",
            "[Open VSX](https://open-vsx.org/extension/hypermarkdown/hmd)",
            f"`code --install-extension hypermarkdown.hmd@{version}`",
        ]


# Longest prefix first: `v` would otherwise claim every tag.
TOOLS: tuple[Tool, ...] = (
    ExtensionTool("vsc-ext-v", "VS Code", "tools/hmd-vsc-ext/CHANGELOG.md", latest=True),
    NpmTool("ts-core-v", "npm", "tools/hmd-ts-core/CHANGELOG.md", latest=False),
    PythonTool("v", "PyPI", "tools/hmd/CHANGELOG.md", latest=False),
)


def _key(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in re.findall(r"\d+", version)[:3])


def tool_for(tag: str) -> tuple[Tool, str]:
    for tool in TOOLS:
        rest = tag[len(tool.prefix):]
        if tag.startswith(tool.prefix) and re.fullmatch(r"\d+\.\d+\.\d+\S*", rest):
            return tool, rest
    raise SystemExit(f"release.py: {tag!r} is not a release tag of any tool")


def title(tag: str) -> str:
    tool, version = tool_for(tag)
    return f"{tool.platform} · {tool.package(version)} {version}"


def header(tag: str) -> str:
    tool, version = tool_for(tag)
    # On `main`, not at the tag: the oldest tags predate the `tools/` layout,
    # so the path would not exist in their tree.
    changelog = f"[changelog](https://github.com/{REPO}/blob/main/{tool.changelog})"
    return f"{HEADER_MARK}\n**{tool.platform}** · " + " · ".join([*tool.links(version), changelog])


def section(tag: str) -> str:
    """The tool's changelog section for this version, without its heading."""
    tool, version = tool_for(tag)
    text = (ROOT / tool.changelog).read_text(encoding="utf-8")
    match = re.search(
        rf"^## \[{re.escape(version)}\][^\n]*\n(.*?)(?=^## |^\[[^\]]+\]: |\Z)", text, re.S | re.M
    )
    body = match.group(1).strip() if match else ""
    return body or f"See {tool.changelog} for what changed."


def with_header(tag: str, body: str) -> str:
    """`body` under this tag's header, replacing any header already there."""
    if body.startswith(HEADER_MARK):
        body = body.split("\n\n", 1)[1] if "\n\n" in body else ""
    return f"{header(tag)}\n\n{body.strip()}\n"


def main(argv: list[str]) -> None:
    if len(argv) != 3 or argv[1] not in ("title", "latest", "notes"):
        raise SystemExit(__doc__)
    command, tag = argv[1], argv[2]
    if command == "title":
        print(title(tag))
    elif command == "latest":
        print("true" if tool_for(tag)[0].latest else "false")
    else:
        sys.stdout.write(with_header(tag, section(tag)))


if __name__ == "__main__":
    main(sys.argv)
