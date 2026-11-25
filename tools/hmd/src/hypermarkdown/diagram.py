"""Diagrams for the Python implementation (HMD-0022, HMD-0030, HMD-0034).

HMD-0022 is a proposal of the TypeScript implementation and does not change this one: a
site build has a build step and no webview, so its rule against starting a
process does not apply here and a binary stays the engine: `d2` for D2, and
`merman-cli` for Mermaid. What this module takes from it is the part that *is*
shared — the semantics.

- A fence whose info string opens `d2#show` or `mermaid#show` is a diagram
  cell, and is drawn. A plain `mermaid` fence is a listing. A plain `d2` fence
  still draws, as it did before diagram cells: it becomes a listing in the
  release that turns the listing rule on.
- A diagram's body is opaque to the resolver, and produces no links and no
  graph edges. The scanner already guarantees this by masking fences.
- A missing engine degrades to a labelled placeholder showing the source, never
  to a blank and never to a build failure (§5). A diagram that is merely not
  drawn is not a defect in the card and must not look like one.
- Rendered SVG reaches the page as a `data:` URI `<img>`, never as inline markup
  (§6). Diagram source comes from a cloned repository, SVG is a scripting
  context, and an `<img>` cannot execute its payload. The cost is that diagrams
  are not interactive, which is the right trade for a documentation diagram.
- The bounds of §4 are shared verbatim, so both lines refuse the same input.
"""

from __future__ import annotations

import base64
import hashlib
import shutil
import subprocess
from collections import OrderedDict
from dataclasses import dataclass

#: Fence kinds that are diagram cells, and the engine each one is drawn by.
#: Matched exactly, as an HQL cell is: `D2#show` is a listing.
CELL_KINDS = {"d2#show": "d2", "mermaid#show": "mermaid"}

#: Plain fence languages that still draw, matched without regard to case. Only
#: `d2`, which drew before diagram cells existed.
PLAIN_LANGUAGES = frozenset({"d2"})

#: Every fence kind this module claims, as `engine_name` reads them.
LANGUAGES = frozenset(CELL_KINDS) | PLAIN_LANGUAGES

#: Bounds on a single render (HMD-0022 §4). Shared with the TypeScript implementation so
#: that a diagram refused there is refused here.
TIMEOUT_SECONDS = 2
MAX_SOURCE_BYTES = 64 * 1024
CACHE_ENTRIES = 64

#: Default for `Engine(executable=…)`, distinguishing "find one" from "none".
DISCOVER = "\0discover"


def engine_name(info: str) -> str | None:
    """The engine that draws a fence with this info string, or None for a listing."""
    words = info.split()
    if not words:
        return None
    kind = words[0]
    if kind in CELL_KINDS:
        return CELL_KINDS[kind]
    return kind.lower() if kind.lower() in PLAIN_LANGUAGES else None


@dataclass(frozen=True)
class Result:
    """Either an SVG, or the reason there isn't one. Never both, never neither."""

    svg: str | None = None
    failure: str | None = None


class Engine:
    """Renders through one binary, if it is on PATH.

    The engine is content-addressed and bounded rather than clever: the same
    source and version produce the same bytes (P1), and a hostile diagram fails
    instead of hanging.
    """

    #: What a diagram of this engine is called on the page.
    name = ""
    #: Identifies the engine in the cache key.
    id = ""
    #: The program looked up on PATH.
    program = ""
    #: Arguments that make it read source on stdin and write SVG on stdout.
    args: tuple[str, ...] = ()

    def __init__(self, executable: str | None = DISCOVER):
        # `None` means "no engine" and must stay expressible; discovery is what
        # the default argument asks for, not what an explicit None asks for.
        self.executable = shutil.which(self.program) if executable is DISCOVER else executable
        self._cache: OrderedDict[str, Result] = OrderedDict()
        self._version: str | None = None

    @property
    def available(self) -> bool:
        return self.executable is not None

    @property
    def version(self) -> str:
        if not self.available:
            return "none"
        try:
            done = subprocess.run(
                [self.executable, "--version"],
                capture_output=True,
                text=True,
                timeout=TIMEOUT_SECONDS,
            )
        except (OSError, subprocess.SubprocessError):
            return "unknown"
        return done.stdout.strip() or "unknown"

    def render(self, source: str) -> Result:
        if not self.available:
            return Result(failure=f"no {self.name} engine is installed")

        encoded = source.encode("utf-8")
        if len(encoded) > MAX_SOURCE_BYTES:
            return Result(failure=f"diagram source exceeds {MAX_SOURCE_BYTES // 1024} KiB")

        key = self._key(source)
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]

        return self._store(key, self._run(encoded))

    def _run(self, encoded: bytes) -> Result:
        try:
            done = subprocess.run(
                [self.executable, *self.args],
                input=encoded,
                capture_output=True,
                timeout=TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            return Result(failure=f"diagram render exceeded {TIMEOUT_SECONDS}s")
        except OSError as exc:
            return Result(failure=f"cannot run {self.program}: {exc}")

        if done.returncode != 0:
            detail = done.stderr.decode("utf-8", "replace").strip().splitlines()
            return Result(failure=detail[-1] if detail else f"{self.program} exited non-zero")
        return Result(svg=done.stdout.decode("utf-8", "replace"))

    def _key(self, source: str) -> str:
        """Every input that can change the output is in the key (§4)."""
        if self._version is None:
            self._version = self.version
        digest = hashlib.sha256(source.encode("utf-8")).hexdigest()
        return f"{digest}|{self.id}|{self._version}"

    def _store(self, key: str, result: Result) -> Result:
        self._cache[key] = result
        # Bounded LRU: an unbounded cache in a long-lived process is a leak with
        # a slow fuse, and 64 live diagrams in one build is not the case worth
        # optimising for.
        while len(self._cache) > CACHE_ENTRIES:
            self._cache.popitem(last=False)
        return result


class D2Engine(Engine):
    """Draws D2 through the `d2` binary."""

    name = "d2"
    id = "d2-binary"
    program = "d2"
    args = ("-", "-")


class MermaidEngine(Engine):
    """Draws Mermaid through `merman-cli`, which needs no browser.

    Three flags say what `d2` needs no flag for. `resvg-safe` draws labels as
    SVG text: Mermaid's default is HTML inside `foreignObject`, which an
    `<img>` does not show. `constrained` is the renderer's resource policy for
    input nobody vetted. The operation timeout is its own deadline, set to the
    bound the process is killed at anyway.
    """

    name = "mermaid"
    id = "merman-cli"
    program = "merman-cli"
    args = (
        "render",
        "-",
        "--format",
        "svg",
        "--svg-pipeline",
        "resvg-safe",
        "--resource-profile",
        "constrained",
        "--operation-timeout-ms",
        str(TIMEOUT_SECONDS * 1000),
        "--quiet",
    )


def engines() -> dict[str, Engine]:
    """One engine for each diagram language, each finding its binary on PATH."""
    return {"d2": D2Engine(), "mermaid": MermaidEngine()}


def to_html(language: str, source: str, engine: Engine) -> str:
    """Render one diagram fence to HTML, degrading rather than failing.

    `language` is the name the page gives the diagram: `d2` or `mermaid`.
    """
    result = engine.render(source)
    if result.svg:
        return _image(result.svg, language)
    return _placeholder(language, source, result.failure or "not rendered")


def _image(svg: str, language: str) -> str:
    """An `<img>` with a `data:` payload — SVG that cannot execute (§6)."""
    payload = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return (
        f'<p class="hmd-diagram"><img alt="{language} diagram" '
        f'src="data:image/svg+xml;base64,{payload}"></p>'
    )


def _placeholder(language: str, source: str, reason: str) -> str:
    """The source, labelled, with the reason it was not drawn (§5).

    Shown *with* the source rather than instead of it: an author needs to see
    what failed in order to fix it.
    """
    return (
        f'<div class="hmd-diagram hmd-diagram--placeholder">\n'
        f'<p class="hmd-diagram__note">{language} diagram — {_escape(reason)}</p>\n'
        f"<pre><code>{_escape(source)}</code></pre>\n"
        f"</div>"
    )


def _escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
