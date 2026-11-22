"""In-card addresses: the path of steps after a link's `#` (HMD-0006).

An address is parsed without the card it points into — every rule about which
step may follow which is static, so a malformed address is reported where it is
written (HMD019) whether or not its target exists. Resolution then walks the
steps against the resolved card, each one inside the scope the one before it
selected, and ends on a byte span of the card's source.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

from . import blocks as B
from .model import Document

HEADING = "heading"
ANCHOR = "anchor"
COUNTED = "counted"

#: Long unit -> short letter, or None for a unit spelled out only.
LONG_UNITS: dict[str, str | None] = {
    B.PARA: "p",
    B.TABLE: "t",
    B.LIST: None,
    B.CODE: "c",
    B.BLOCKQUOTE: None,
    B.CALLOUT: None,
    B.MATH: "m",
    B.DIAGRAM: "d",
    B.EMBED: "e",
    B.HTML: None,
    "Block": "b",
    "Sentence": "s",
    "Word": "w",
    "Line": "l",
}
SHORT_UNITS = {short: long for long, short in LONG_UNITS.items() if short}

BLOCK_UNITS = frozenset(LONG_UNITS) - {"Sentence", "Word", "Line"}
TEXT_UNITS = frozenset({"Sentence", "Word"})

#: Ordinals above this are refused before anything is counted: the digits in
#: an address are the author's, and the scope they index is not.
MAX_ORDINAL = 1_000_000
#: Steps above this are refused; no real citation is this deep.
MAX_STEPS = 32

_INTEGRITY_RE = re.compile(r"@sha256-(?P<digest>[^/]*)$")
_DIGEST_RE = re.compile(r"^[0-9a-f]{16}$")
_BLOCK_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
_COUNTED_RE = re.compile(r"^(?P<u1>[A-Za-z]+)(?P<n1>\d+)(?:-(?P<u2>[A-Za-z]+)(?P<n2>\d+))?$")
#: A heading whose slug has this shape is shadowed by a short-form step.
SHADOW_RE = re.compile(r"^[" + "".join(sorted(SHORT_UNITS)) + r"]\d+(?:-[a-z]+\d+)?$")


@dataclass(frozen=True)
class Step:
    kind: str  # HEADING | ANCHOR | COUNTED
    text: str  # as written
    #: HEADING: the heading text. ANCHOR: the block id. COUNTED: the long unit.
    value: str = ""
    first: int = 0
    last: int = 0  # equal to `first` unless the step is a range

    is_range: bool = False


@dataclass(frozen=True)
class Address:
    raw: str
    steps: tuple[Step, ...]
    digest: str | None = None

    @property
    def is_single_heading(self) -> bool:
        return len(self.steps) == 1 and self.steps[0].kind == HEADING and self.digest is None

    @property
    def is_single_anchor(self) -> bool:
        return len(self.steps) == 1 and self.steps[0].kind == ANCHOR and self.digest is None


def is_multi_step(fragment: str) -> bool:
    """Whether a fragment is more than the one-step heading or block form.

    One-step fragments keep the kinds and the HMD010 checks they always had.
    Anything with a `/`, an integrity digest, or a counted first step is an
    address in the new sense.
    """
    if "/" in fragment or _INTEGRITY_RE.search(fragment):
        return True
    try:
        return _counted(fragment) is not None
    except AddressSyntaxError:
        return True


class AddressSyntaxError(ValueError):
    """A malformed address (HMD019)."""


def _unit(word: str) -> tuple[str, str] | None:
    """(long unit, spelling) for a unit word, or None if it names none."""
    if word in LONG_UNITS:
        return word, "long"
    if word in SHORT_UNITS:
        return SHORT_UNITS[word], "short"
    return None


def _counted(text: str) -> Step | None:
    m = _COUNTED_RE.match(text)
    if not m:
        return None
    first_unit = _unit(m.group("u1"))
    second_unit = _unit(m.group("u2")) if m.group("u2") else None
    if first_unit is None and second_unit is None:
        return None  # a heading such as `Chapter2`, or `x1`
    if m.group("u2") is not None:
        if first_unit is None or second_unit is None or first_unit[0] != second_unit[0]:
            raise AddressSyntaxError(f"a range must use one unit on both ends, not {text!r}")
        if first_unit[1] != second_unit[1]:
            raise AddressSyntaxError(
                f"a range must spell both ends the same way, not {text!r}"
            )
    numbers = [m.group("n1")] + ([m.group("n2")] if m.group("n2") else [])
    for number in numbers:
        if int(number) == 0:
            raise AddressSyntaxError(f"ordinals count from 1, so {text!r} names nothing")
        if number.startswith("0"):
            raise AddressSyntaxError(f"an ordinal has no leading zeros: {text!r}")
        if int(number) > MAX_ORDINAL:
            raise AddressSyntaxError(f"ordinal {number} is above the limit of {MAX_ORDINAL}")
    first = int(numbers[0])
    last = int(numbers[-1])
    if last < first:
        raise AddressSyntaxError(f"range {text!r} ends before it starts")
    return Step(COUNTED, text, first_unit[0], first, last, m.group("u2") is not None)


def parse(fragment: str) -> Address:
    """Parse the text after `#`. Raises AddressSyntaxError (HMD019)."""
    body = fragment
    digest = None
    m = _INTEGRITY_RE.search(body)
    if m:
        digest = m.group("digest")
        if not _DIGEST_RE.match(digest):
            raise AddressSyntaxError(
                "an integrity digest is '@sha256-' and sixteen lowercase hex digits"
            )
        body = body[: m.start()]

    parts = body.split("/")
    if len(parts) > MAX_STEPS:
        raise AddressSyntaxError(f"an address has at most {MAX_STEPS} steps")

    steps: list[Step] = []
    for part in parts:
        if not part.strip():
            raise AddressSyntaxError("an address has an empty step" if len(parts) > 1 else "empty fragment")
        if part.startswith("^"):
            block_id = part[1:]
            if not _BLOCK_ID_RE.match(block_id):
                raise AddressSyntaxError(f"invalid block id {block_id!r}")
            steps.append(Step(ANCHOR, part, block_id))
            continue
        counted = _counted(part.strip()) if part == part.strip() else None
        if counted is not None:
            steps.append(counted)
            continue
        steps.append(Step(HEADING, part, part))

    _check_placement(steps)
    return Address(fragment, tuple(steps), digest)


def _check_placement(steps: list[Step]) -> None:
    """The static rules on which step may follow which."""
    previous: Step | None = None
    for index, step in enumerate(steps):
        last = index == len(steps) - 1
        if step.is_range and not last:
            raise AddressSyntaxError(f"a range selects content, so {step.text!r} must be the last step")

        if step.kind in (HEADING, ANCHOR):
            if previous is not None and previous.kind != HEADING:
                raise AddressSyntaxError(
                    f"{step.text!r} cannot follow {previous.text!r}: a named step follows only a heading"
                )
        elif step.value in BLOCK_UNITS:
            if previous is not None and previous.kind != HEADING:
                raise AddressSyntaxError(
                    f"{step.text!r} cannot follow {previous.text!r}: blocks are counted in a card or a section"
                )
        elif step.value == "Line":
            if previous is not None and not _selects_block(previous):
                raise AddressSyntaxError(
                    f"{step.text!r} cannot follow {previous.text!r}: lines are counted in the card or in one block"
                )
            if not last:
                raise AddressSyntaxError(f"a line step must be the last step, not {step.text!r}")
        elif step.value == "Sentence":
            if previous is None or not _selects_block(previous):
                raise AddressSyntaxError(f"{step.text!r} must follow a block: sentences are counted in one block")
        elif step.value == "Word":
            if previous is None or not (_selects_block(previous) or previous.value == "Sentence"):
                raise AddressSyntaxError(
                    f"{step.text!r} must follow a block or a sentence: words are counted in one of those"
                )
        previous = step


def _selects_block(step: Step) -> bool:
    return step.kind == ANCHOR or (step.kind == COUNTED and step.value in BLOCK_UNITS)


# -- resolution ------------------------------------------------------------


@dataclass
class Resolution:
    """Where an address landed, or why it did not."""

    start: int = 0
    end: int = 0
    #: (rule, message) when the address selects nothing — HMD004, HMD005, HMD020.
    failure: tuple[str, str] | None = None
    #: (rule, message) that do not stop resolution — HMD021, HMD023.
    warnings: list[tuple[str, str]] = field(default_factory=list)
    #: The assigned slug of the deepest heading the address passed through.
    heading_slug: str | None = None

    @property
    def ok(self) -> bool:
        return self.failure is None


def digest_of(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


@dataclass
class _Scope:
    kind: str  # "card" | "section" | "block" | "sentence"
    start: int
    end: int
    label: str
    heading_index: int | None = None
    block: B.Block | None = None
    words: list[B.Word] | None = None


def body_offset(document: Document) -> int:
    from .frontmatter import split_frontmatter

    raw, _body, offset = split_frontmatter(document.text)
    if document.is_markdown and raw is not None and not document.frontmatter:
        return 0
    return offset


def resolve(document: Document, address: Address, card_name: str = "the card") -> Resolution:
    from .parse import slug_for

    text = document.text
    offset = body_offset(document)
    scope = _Scope("card", offset, len(text), card_name)
    result = Resolution()

    def fail(rule: str, message: str) -> Resolution:
        result.failure = (rule, message)
        return result

    for index, step in enumerate(address.steps):
        if step.kind == HEADING:
            found = _heading(document, step.value, scope, first=index == 0, slug_for=slug_for)
            if found is None:
                where = f" in {scope.label}" if index else ""
                wanted = slug_for(step.value, set())
                return fail("HMD004", f"{card_name} has no heading '#{wanted}'{where}")
            heading_index, start, end = found
            result.heading_slug = document.headings[heading_index].slug
            scope = _Scope("section", start, end, f"'#{document.headings[heading_index].slug}'", heading_index)
            continue

        if step.kind == ANCHOR:
            region = _anchor_region(document, step.value, offset)
            if region is None:
                return fail("HMD005", f"{card_name} has no block '^{step.value}'")
            if scope.kind == "section" and not (scope.start <= region[0] < scope.end):
                result.warnings.append(
                    (
                        "HMD021",
                        f"block '^{step.value}' is not in {scope.label}; the address was written "
                        f"against an earlier version of {card_name}",
                    )
                )
            segmented = B.segment(text, region[0], region[1], offset)
            kind = segmented[0].kind if len(segmented) == 1 else B.PARA
            block = B.Block(kind, region[0], region[1], region[0], region[1])
            if len(segmented) == 1:
                one = segmented[0]
                block = B.Block(one.kind, one.start, min(one.end, region[1]), one.body_start, min(one.body_end, region[1]))
            scope = _Scope("block", region[0], region[1], f"'^{step.value}'", block=block)
            continue

        unit = step.value
        if unit in BLOCK_UNITS:
            candidates = [
                b for b in B.segment(text, scope.start, scope.end, offset) if unit == "Block" or b.kind == unit
            ]
            picked = _pick(candidates, step, scope.label, plural(unit))
            if isinstance(picked, str):
                return fail("HMD020", picked)
            first, last = picked
            if step.is_range:
                result.start, result.end = first.start, last.end
                break
            block = _strip_anchor(document, first)
            scope = _Scope("block", block.start, block.end, f"{step.text} of {scope.label}", block=block)
            continue

        if unit == "Line":
            if scope.kind == "card":
                units = B.lines(text, 0, len(text))
                label = card_name
            else:
                block = scope.block
                units = B.lines(text, block.body_start, block.body_end) if block.body_end > block.body_start else []
                label = scope.label
            picked = _pick(units, step, label, "lines")
            if isinstance(picked, str):
                return fail("HMD020", picked)
            result.start, result.end = picked[0].start, picked[1].end
            break

        # Sentence or Word.
        if scope.kind == "block":
            block = scope.block
            if block.kind not in B.PROSE:
                return fail(
                    "HMD020",
                    f"{scope.label} is {_article(block.kind)}, which has no {plural(unit)}; address its lines",
                )
            skip = [(a.span.start, a.span.end) for a in document.anchors]
            words = B.words(text, block, skip)
        else:
            words = scope.words or []

        if unit == "Sentence":
            groups = B.sentences(text, words)
            picked = _pick(groups, step, scope.label, "sentences")
            if isinstance(picked, str):
                return fail("HMD020", picked)
            first, last = picked
            if step.is_range:
                result.start, result.end = first[0].start, last[-1].end
                break
            scope = _Scope("sentence", first[0].start, first[-1].end, f"{step.text} of {scope.label}", words=first)
            continue

        picked = _pick(words, step, scope.label, "words")
        if isinstance(picked, str):
            return fail("HMD020", picked)
        result.start, result.end = picked[0].start, picked[1].end
        break
    else:
        result.start, result.end = scope.start, scope.end

    if address.digest is not None:
        actual = digest_of(text[result.start : result.end])
        if actual != address.digest:
            result.warnings.append(
                (
                    "HMD023",
                    f"the quoted text has changed: it now hashes to sha256-{actual}, "
                    f"not sha256-{address.digest}",
                )
            )
    return result


def _pick(units: list, step: Step, label: str, noun: str):
    """(first, last) of `units` for the step's ordinals, or a failure message."""
    count = len(units)
    if step.last > count:
        have = f"no {noun}" if count == 0 else f"1 {noun[:-1]}" if count == 1 else f"{count} {noun}"
        return f"{label} has {have}; {step.text} is past the end"
    return units[step.first - 1], units[step.last - 1]


def plural(unit: str) -> str:
    return {
        "Para": "paragraphs",
        "Table": "tables",
        "List": "lists",
        "Code": "code blocks",
        "Blockquote": "blockquotes",
        "Callout": "callouts",
        "Math": "math blocks",
        "Diagram": "diagrams",
        "Embed": "embeds",
        "Html": "HTML blocks",
        "Block": "blocks",
        "Sentence": "sentences",
        "Word": "words",
        "Line": "lines",
    }[unit]


def _article(kind: str) -> str:
    return {
        "Table": "a table",
        "Code": "a code block",
        "Math": "a math block",
        "Diagram": "a diagram",
        "Embed": "an embed",
        "Html": "an HTML block",
    }.get(kind, f"a {kind.lower()}")


def _heading(document: Document, text: str, scope: _Scope, first: bool, slug_for):
    """(index, start, end) of the heading a heading step names, inside `scope`.

    The first step matches a heading's assigned slug, as a one-step fragment
    always has. A later step matches the unsuffixed slug of the first heading
    inside the enclosing section — the point of a heading path is that it
    tells two headings of one name apart by where they sit.
    """
    wanted = slug_for(text, set())
    headings = document.headings
    for index, heading in enumerate(headings):
        if first:
            if heading.slug != wanted:
                continue
        else:
            if scope.heading_index is not None and index <= scope.heading_index:
                continue
            if not (scope.start <= heading.span.start < scope.end):
                continue
            if slug_for(heading.text, set()) != wanted:
                continue
        end = len(document.text)
        for following in headings[index + 1 :]:
            if following.level <= heading.level:
                end = following.span.start
                break
        if not first:
            end = min(end, scope.end)
        return index, heading.span.start, end
    return None


def _anchor_region(document: Document, block_id: str, floor: int) -> tuple[int, int] | None:
    """The anchored block: back from the anchored line to the nearest blank line."""
    text = document.text
    for anchor in document.anchors:
        if anchor.block_id != block_id:
            continue
        start = text.rfind("\n", 0, anchor.span.start) + 1
        while start > floor:
            previous_end = start - 1
            previous_start = text.rfind("\n", 0, previous_end) + 1
            if previous_start < floor or not text[previous_start:previous_end].strip():
                break
            start = previous_start
        return start, anchor.span.start
    return None


def _strip_anchor(document: Document, block: B.Block) -> B.Block:
    """A block whose last line carries an anchor ends before it."""
    for anchor in document.anchors:
        if block.start <= anchor.span.start < block.end and anchor.span.end >= block.end:
            end = anchor.span.start
            return B.Block(block.kind, block.start, end, block.body_start, min(block.body_end, end))
    return block


def shadowed(document: Document):
    """Headings whose slug a short-form step would read as a unit (HMD022)."""
    for heading in document.headings:
        if SHADOW_RE.match(heading.slug):
            yield heading


def page_anchor(link, document: Document | None) -> str | None:
    """The HTML anchor a link to `document` lands on, or None for the page top.

    A heading fragment lands on its heading. An address lands on the deepest
    heading it passes through, which is the nearest place a built page has an
    anchor for; a block or a count below it has none. Resolved against the
    target so a heading path lands on the heading it means, a later one of the
    same name included.
    """
    from .parse import slug_for

    if link.fragment is None:
        return None
    if link.fragment_kind == "heading":
        return slug_for(link.fragment, set())
    if link.fragment_kind == "address" and link.address is not None and document is not None:
        return resolve(document, link.address).heading_slug
    return None
