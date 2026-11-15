//! String primitives with the canonical implementation's semantics.
//!
//! The canonical implementation is Python, and three of its string operations
//! differ from the nearest thing in `std`: what counts as whitespace, where a
//! line ends, and how a file's newlines are read. Each is restated here so the
//! scanner and the frontmatter reader divide a card exactly as the canonical
//! ones do.

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

/// The whitespace-separated words of `text`, as Python's `str.split()`.
pub(crate) fn words(text: &str) -> Vec<&str> {
    text.split(is_space).filter(|w| !w.is_empty()).collect()
}

/// Whether `c` ends a line for Python's `str.splitlines`.
fn is_line_break(c: char) -> bool {
    matches!(
        c,
        '\n' | '\r'
            | '\u{0b}'
            | '\u{0c}'
            | '\u{1c}'
            | '\u{1d}'
            | '\u{1e}'
            | '\u{85}'
            | '\u{2028}'
            | '\u{2029}'
    )
}

/// The lines of `text` with their terminators kept, as Python's
/// `str.splitlines(keepends=True)`: `\r\n` is one terminator, and the Unicode
/// line boundaries end a line as `\n` does.
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
/// The canonical implementation reads a card in text mode, which makes this
/// translation before anything else sees the text, so every line and column it
/// reports counts in the translated text.
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_information_separators_are_whitespace() {
        assert_eq!(strip(" \u{1f}a\u{1c}"), "a");
        assert_eq!(words("a\u{1c}b  c"), ["a", "b", "c"]);
    }

    #[test]
    fn a_line_ends_at_every_boundary_python_recognises() {
        assert_eq!(
            lines_with_ends("a\r\nb\rc\u{0b}d\u{2028}e"),
            ["a\r\n", "b\r", "c\u{0b}", "d\u{2028}", "e"]
        );
        assert!(lines_with_ends("").is_empty());
        assert_eq!(lines_with_ends("a\n"), ["a\n"]);
    }

    #[test]
    fn carriage_returns_become_newlines() {
        assert_eq!(universal_newlines("a\r\nb\rc\n"), "a\nb\nc\n");
    }
}
