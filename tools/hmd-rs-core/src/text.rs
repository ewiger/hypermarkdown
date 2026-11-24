//! String primitives with the canonical implementation's semantics.
//!
//! The canonical implementation is Python, and its string operations differ
//! from the nearest thing in `std` in what counts as whitespace. The language
//! fixes the rest: where a line ends, how a card's line endings are read, the
//! byte-order mark a card may open with, and the normal form names are
//! compared in. Each is restated here so the scanner, the frontmatter reader
//! and the resolver divide and compare a card exactly as the canonical ones
//! do.

use std::borrow::Cow;

use unicode_normalization::{IsNormalized, UnicodeNormalization, is_nfc_quick};

/// Whether `c` is whitespace to Python's `str.strip`, `str.split` and `\s`.
///
/// Python counts the four information separators U+001C to U+001F, which
/// `char::is_whitespace` does not.
pub(crate) fn is_space(c: char) -> bool {
    c.is_whitespace() || ('\u{1c}'..='\u{1f}').contains(&c)
}

/// `text` without leading and trailing whitespace, as Python's `str.strip`.
pub(crate) fn strip(text: &str) -> &str {
    text.trim_matches(is_space)
}

/// Whether `c` ends a line: `\n`, or `\r` alone or before `\n`, as in
/// CommonMark.
///
/// A form feed, U+2028 and the other boundaries Python's `str.splitlines`
/// recognises do not end a line.
fn is_line_break(c: char) -> bool {
    matches!(c, '\n' | '\r')
}

/// The lines of `text` with their terminators kept: `\r\n` is one
/// terminator, and a lone `\r` ends a line as `\n` does.
pub(crate) fn lines_with_ends(text: &str) -> Vec<&str> {
    let mut lines = Vec::new();
    let mut start = 0;
    let mut chars = text.char_indices().peekable();
    while let Some((at, c)) = chars.next() {
        if !is_line_break(c) {
            continue;
        }
        let mut end = at + c.len_utf8();
        if c == '\r' && matches!(chars.peek(), Some((_, '\n'))) {
            chars.next();
            end += 1;
        }
        lines.push(&text[start..end]);
        start = end;
    }
    if start < text.len() {
        lines.push(&text[start..]);
    }
    lines
}

/// `line` without its trailing `\r` and `\n` characters, as Python's
/// `str.rstrip("\r\n")`.
pub(crate) fn strip_eol(line: &str) -> &str {
    line.trim_end_matches(['\r', '\n'])
}

/// `text` with `\r\n` and a lone `\r` each replaced by `\n`.
///
/// Those are the three line endings, and a `\r` before a `\n` sits at the
/// end of its line, so a line number and a column counted in the translated
/// text are the ones counted in the card as written.
pub(crate) fn universal_newlines(text: &str) -> String {
    if !text.contains('\r') {
        return text.to_owned();
    }
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\r' {
            if chars.peek() == Some(&'\n') {
                chars.next();
            }
            out.push('\n');
        } else {
            out.push(c);
        }
    }
    out
}

/// The byte-order mark a card may open with.
const BOM: char = '\u{feff}';

/// `text` without one leading byte-order mark.
///
/// A single mark at the start of a card is not part of it, so frontmatter
/// after one is frontmatter. A second mark is text.
pub(crate) fn strip_bom(text: &str) -> &str {
    text.strip_prefix(BOM).unwrap_or(text)
}

/// `name` in Unicode NFC, the form every name is compared in.
///
/// One name can be stored composed or decomposed, on disk and in a reference
/// alike, and must resolve the same way in either.
pub(crate) fn nfc(name: &str) -> Cow<'_, str> {
    if is_nfc_quick(name.chars()) == IsNormalized::Yes {
        Cow::Borrowed(name)
    } else {
        Cow::Owned(name.nfc().collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_information_separators_are_whitespace() {
        assert_eq!(strip(" \u{1f}a\u{1c}"), "a");
    }

    #[test]
    fn a_line_ends_at_a_newline_a_carriage_return_or_both() {
        assert_eq!(
            lines_with_ends("a\r\nb\rc\nd\r\re"),
            ["a\r\n", "b\r", "c\n", "d\r", "\r", "e"]
        );
        assert!(lines_with_ends("").is_empty());
        assert_eq!(lines_with_ends("a\n"), ["a\n"]);
    }

    #[test]
    fn carriage_returns_become_newlines() {
        assert_eq!(universal_newlines("a\r\nb\rc\n"), "a\nb\nc\n");
    }

    #[test]
    fn no_other_boundary_ends_a_line() {
        assert_eq!(
            lines_with_ends("a\u{0b}b\u{0c}c\u{1c}d\u{85}e\u{2028}f\u{2029}g\n"),
            ["a\u{0b}b\u{0c}c\u{1c}d\u{85}e\u{2028}f\u{2029}g\n"]
        );
    }

    #[test]
    fn one_leading_byte_order_mark_is_dropped() {
        assert_eq!(strip_bom("\u{feff}---\n"), "---\n");
        assert_eq!(strip_bom("\u{feff}\u{feff}a"), "\u{feff}a");
        assert_eq!(strip_bom("a\u{feff}"), "a\u{feff}");
    }

    #[test]
    fn names_compare_in_nfc() {
        assert_eq!(nfc("cafe\u{301}"), "caf\u{e9}");
        assert_eq!(nfc("caf\u{e9}"), "caf\u{e9}");
        assert!(matches!(nfc("plain/ascii"), Cow::Borrowed(_)));
    }
}
