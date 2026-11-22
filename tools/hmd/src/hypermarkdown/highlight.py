"""A Pygments lexer for HyperMarkDown source, registered as `hmd`.

A code sample marked ```` ```hmd ```` is coloured as a card: wikilinks, embeds,
block anchors, and frontmatter stand out from the prose around them. Pygments
finds the lexer through the `pygments.lexers` entry point this distribution
declares, so MkDocs, `hmd render --to html`, and anything else built on
Pygments pick it up with no configuration.

The lexer marks what the format adds and leaves the rest of Markdown almost
plain. It is a highlighter, not a parser: it does not resolve a link or check
that an anchor exists, and it accepts text the linter would reject.
"""

from __future__ import annotations

import re

from pygments.lexer import RegexLexer, bygroups, using
from pygments.lexers import get_lexer_by_name
from pygments.lexers.data import YamlLexer
from pygments.token import (
    Comment,
    Generic,
    Keyword,
    Name,
    Number,
    Punctuation,
    String,
    Text,
)
from pygments.util import ClassNotFound

__all__ = ["HmdLexer"]

# `[[target#fragment|display]]`, the same shape the editor grammar matches.
_LINK_BODY = (
    r"([^\[\]\n|#]*)"  # target
    r"(?:(#\^?)([^\[\]\n|]*))?"  # fragment
    r"(?:(\|)([^\[\]\n]*))?"  # display text
    r"(\]\])"
)

# Fence info words that name a language Pygments would lex badly or not at all.
# An HQL cell is `hql#eval` or `hql#query`; the body is shown as plain code.
_PLAIN_BODIES = ("hql", "d2")


def _fence(lexer, match):
    """Yield a fenced block: the fences, the info string, and the body.

    The body is lexed as its own language when Pygments knows the info word,
    and left plain otherwise, so a `d2` or `hql#eval` body reads as code
    rather than as one long string.
    """
    opener, info, body, closer = match.group(1, 2, 3, 4)
    start = match.start()
    yield start, String.Backtick, opener
    start += len(opener)
    if info:
        yield start, Name.Label, info
        start += len(info)
    yield start, Text, "\n"
    start += 1

    word = info.strip().split(None, 1)[0] if info.strip() else ""
    base = re.split(r"[#{\s]", word, maxsplit=1)[0].lower()
    sub = None
    if base in ("hmd", "hypermarkdown"):
        sub = HmdLexer()
    elif base and base not in _PLAIN_BODIES:
        try:
            sub = get_lexer_by_name(base)
        except ClassNotFound:
            sub = None
    if sub is None:
        if body:
            yield start, Text, body
    else:
        for index, token, value in sub.get_tokens_unprocessed(body):
            yield start + index, token, value
    start += len(body)
    yield start, String.Backtick, closer


class HmdLexer(RegexLexer):
    """HyperMarkDown: Markdown with wikilinks, embeds, anchors, frontmatter."""

    name = "HyperMarkDown"
    aliases = ["hmd", "hypermarkdown"]
    filenames = ["*.hmd"]
    mimetypes = ["text/x-hypermarkdown"]
    url = "https://hypermarkdown.org/"
    version_added = ""

    flags = re.MULTILINE

    tokens = {
        "root": [
            # Frontmatter: a `---` block at the very start of the card.
            (
                r"\A(---[ \t]*\n)((?:.*\n)*?)(---[ \t]*)$",
                bygroups(Punctuation, using(YamlLexer), Punctuation),
            ),
            # A fenced block, closed by a fence at least as long as its opener.
            (
                r"^([ \t]*(`{3,}|~{3,}))([^\n]*)\n((?:.*\n)*?)([ \t]*\2[`~]*[ \t]*)$",
                lambda lexer, m: _fence(
                    lexer,
                    _Groups(m, (1, 3, 4, 5)),
                ),
            ),
            (r"<!--(?:.|\n)*?-->", Comment.Multiline),
            (r"^#{1,6}[ \t]+[^\n]*$", Generic.Heading),
            # Callouts and collapsible blocks.
            (r"^([ \t]*)(!!!|\?\?\?\+?)([^\n]*)$", bygroups(Text, Keyword, Generic.Strong)),
            # An embed, then a link. The `!` is what makes it an embed.
            (
                r"(!\[\[)" + _LINK_BODY,
                bygroups(
                    Name.Decorator,
                    Name.Decorator,
                    Punctuation,
                    Name.Attribute,
                    Punctuation,
                    String,
                    Name.Decorator,
                ),
            ),
            (
                r"(\[\[)" + _LINK_BODY,
                bygroups(
                    Name.Tag,
                    Name.Tag,
                    Punctuation,
                    Name.Attribute,
                    Punctuation,
                    String,
                    Name.Tag,
                ),
            ),
            # A trailing `^block-id` names the block it ends.
            (r"([ \t]+)(\^[A-Za-z0-9][A-Za-z0-9_-]{0,63})([ \t]*)$", bygroups(Text, Name.Label, Text)),
            (r"\$\$(?:.|\n)*?\$\$", Number),
            (r"(?<![\w$])\$[^$\n]+\$(?![\w$])", Number),
            (r"`[^`\n]+`", String.Backtick),
            (r"^([ \t]*)([-*+]|\d+\.)([ \t]+)(\[[ xX]\])?", bygroups(Text, Keyword, Text, Keyword)),
            (r"\*\*[^*\n]+\*\*", Generic.Strong),
            (r"[^\n`!\[$*<^ \t]+", Text),
            (r"[ \t]+", Text),
            (r"\n", Text),
            (r".", Text),
        ],
    }


class _Groups:
    """A view of a match that renumbers its groups.

    The fence pattern needs one extra group for the backreference to the
    opening run, which `_fence` has no use for.
    """

    def __init__(self, match, order):
        self._match = match
        self._order = order

    def group(self, *indexes):
        return tuple(self._match.group(self._order[i - 1]) for i in indexes)

    def start(self):
        return self._match.start()
