"""D2 diagrams (HMD-0022 §4-§7, as they apply to the Python implementation)."""

from __future__ import annotations

import base64

import pytest

from hypermarkdown import diagram, scan


class FakeEngine(diagram.D2Engine):
    """A D2 engine that renders without a binary, counting its invocations."""

    def __init__(self, svg: str = "<svg><text>ok</text></svg>", fail: str | None = None):
        super().__init__(executable="/nonexistent/d2")
        self._version = "test-1"
        self.svg, self.fail, self.calls = svg, fail, 0

    def _run(self, encoded: bytes) -> diagram.Result:
        self.calls += 1
        return diagram.Result(failure=self.fail) if self.fail else diagram.Result(svg=self.svg)


# -- fence detection -----------------------------------------------------


def test_find_fences_reports_info_and_body():
    text = "before\n\n```d2\na -> b\n```\n\nafter\n"
    (info, body, start, end), = scan.find_fences(text)
    assert info == "d2"
    assert body == "a -> b\n"
    assert text[start:end].startswith("```d2")


def test_find_fences_skips_an_inner_fence():
    """`_fenced_regions` pairs an opener with its closer, so a nested fence is
    part of the outer body rather than a second block."""
    text = "````md\n```d2\na -> b\n```\n````\n"
    fences = list(scan.find_fences(text))
    assert len(fences) == 1 and fences[0][0] == "md"


# -- §6 the SVG never reaches the page as markup -------------------------


def test_a_rendered_diagram_is_a_data_uri_image():
    html = diagram.to_html("d2", "a -> b", FakeEngine())
    assert "data:image/svg+xml;base64," in html
    assert "<svg" not in html, "SVG must not be inserted as markup"


def test_hostile_svg_cannot_execute():
    """Diagram source comes from a cloned repository. An `<img>` does not run
    script in its payload, which is the whole point of the data: URI."""
    hostile = '<svg onload="alert(1)"><script>alert(2)</script></svg>'
    html = diagram.to_html("d2", "a -> b", FakeEngine(svg=hostile))
    assert "onload" not in html and "<script" not in html
    payload = html.split("base64,")[1].split('"')[0]
    assert base64.b64decode(payload).decode() == hostile  # carried, not executed


# -- §5 the placeholder --------------------------------------------------


def test_a_missing_engine_degrades_to_the_labelled_source():
    engine = diagram.D2Engine(executable=None)
    html = diagram.to_html("d2", "a -> b", engine)
    assert "hmd-diagram--placeholder" in html
    assert "a -&gt; b" in html
    assert "no d2 engine is installed" in html


def test_a_failure_is_shown_with_the_source_not_instead_of_it():
    """The author needs to see what failed in order to fix it."""
    html = diagram.to_html("d2", "a -> ", FakeEngine(fail="unexpected end of input"))
    assert "a -&gt; " in html
    assert "unexpected end of input" in html


def test_placeholder_escapes_its_source():
    html = diagram.to_html("d2", "<script>alert(1)</script>", diagram.D2Engine(executable=None))
    assert "<script>" not in html and "&lt;script&gt;" in html


# -- §4 bounds and caching ------------------------------------------------


def test_source_over_the_size_bound_fails_rather_than_rendering():
    engine = FakeEngine()
    oversized = "a" * (diagram.MAX_SOURCE_BYTES + 1)
    result = engine.render(oversized)
    assert result.svg is None and "64 KiB" in result.failure
    assert engine.calls == 0, "the engine must not be handed oversized input"


def test_an_identical_source_renders_once():
    engine = FakeEngine()
    engine.render("a -> b")
    engine.render("a -> b")
    assert engine.calls == 1


def test_a_different_source_is_a_different_key():
    engine = FakeEngine()
    engine.render("a -> b")
    engine.render("a -> c")
    assert engine.calls == 2


def test_the_cache_is_bounded():
    engine = FakeEngine()
    for index in range(diagram.CACHE_ENTRIES + 1):
        engine.render(f"n{index}")
    assert len(engine._cache) == diagram.CACHE_ENTRIES
    # The oldest entry was evicted, so rendering it again costs another call.
    before = engine.calls
    engine.render("n0")
    assert engine.calls == before + 1


def test_the_engine_version_is_part_of_the_key():
    engine = FakeEngine()
    engine.render("a -> b")
    engine._version = "test-2"
    engine.render("a -> b")
    assert engine.calls == 2


# -- the real binary, when there is one ----------------------------------


@pytest.mark.skipif(not diagram.D2Engine().available, reason="no d2 binary on PATH")
def test_the_real_engine_renders_deterministically():
    engine = diagram.D2Engine()
    first = engine.render("a -> b")
    assert first.svg and "<svg" in first.svg
    # A second, uncached engine must produce the same bytes (P1).
    assert diagram.D2Engine().render("a -> b").svg == first.svg
