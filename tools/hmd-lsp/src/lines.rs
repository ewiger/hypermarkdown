//! Positions in a document, converted between the resolver's and the
//! protocol's.
//!
//! The resolver counts a column in Unicode code points. The protocol counts a
//! character offset in UTF-16 code units unless the client and the server
//! agree on another encoding, and this server does not negotiate one. The two
//! numbers differ on a line that holds a character outside the Basic
//! Multilingual Plane, such as an emoji.
//!
//! Both sides end a line at `\n`, at `\r\n`, and at a lone `\r`, so a line
//! number is the same on both sides.

/// The lines of one document, without their terminators.
#[derive(Debug)]
pub struct Lines<'a> {
    lines: Vec<&'a str>,
    /// Whether the text opens with a byte-order mark. The resolver drops one
    /// before it counts columns, and the protocol counts it.
    bom: bool,
}

impl<'a> Lines<'a> {
    /// Splits `text` into its lines.
    pub fn new(text: &'a str) -> Self {
        let (text, bom) = match text.strip_prefix('\u{feff}') {
            Some(rest) => (rest, true),
            None => (text, false),
        };
        let mut lines = Vec::new();
        let mut start = 0;
        let bytes = text.as_bytes();
        let mut at = 0;
        while at < bytes.len() {
            match bytes[at] {
                b'\n' => {
                    lines.push(&text[start..at]);
                    at += 1;
                    start = at;
                }
                b'\r' => {
                    lines.push(&text[start..at]);
                    at += 1;
                    if bytes.get(at) == Some(&b'\n') {
                        at += 1;
                    }
                    start = at;
                }
                _ => at += 1,
            }
        }
        lines.push(&text[start..]);
        Lines { lines, bom }
    }

    /// The protocol's character offset for the code point offset `column` on
    /// the line `line`. Both are counted from 0.
    ///
    /// A column past the end of the line gives the offset of the line's end.
    pub fn utf16(&self, line: usize, column: usize) -> u32 {
        let units: usize = self
            .lines
            .get(line)
            .map(|text| text.chars().take(column).map(char::len_utf16).sum())
            .unwrap_or(0);
        (units + self.shift(line)) as u32
    }

    /// The code point offset for the protocol's character offset `character`
    /// on the line `line`. Both are counted from 0.
    ///
    /// An offset inside a surrogate pair gives the code point that holds it.
    pub fn code_points(&self, line: usize, character: u32) -> usize {
        let Some(text) = self.lines.get(line) else {
            return 0;
        };
        let target = (character as usize).saturating_sub(self.shift(line));
        let mut units = 0;
        for (column, c) in text.chars().enumerate() {
            units += c.len_utf16();
            if units > target {
                return column;
            }
        }
        text.chars().count()
    }

    /// How many UTF-16 units the protocol counts on `line` before the first
    /// character the resolver counts.
    fn shift(&self, line: usize) -> usize {
        usize::from(self.bom && line == 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_line_ends_at_each_of_the_three_terminators() {
        let lines = Lines::new("a\nb\r\nc\rd");
        assert_eq!(lines.lines, ["a", "b", "c", "d"]);
    }

    #[test]
    fn a_text_that_ends_with_a_terminator_has_an_empty_last_line() {
        assert_eq!(Lines::new("a\n").lines, ["a", ""]);
    }

    #[test]
    fn an_ascii_column_is_the_same_number_in_both_counts() {
        let lines = Lines::new("see [[tokens]]");
        assert_eq!(lines.utf16(0, 4), 4);
        assert_eq!(lines.code_points(0, 4), 4);
    }

    #[test]
    fn a_character_outside_the_basic_plane_counts_as_two_units() {
        let lines = Lines::new("😀 [[tokens]]");
        assert_eq!(lines.utf16(0, 2), 3);
        assert_eq!(lines.code_points(0, 3), 2);
    }

    #[test]
    fn an_offset_inside_a_surrogate_pair_is_the_character_that_holds_it() {
        let lines = Lines::new("😀x");
        assert_eq!(lines.code_points(0, 1), 0);
        assert_eq!(lines.code_points(0, 2), 1);
    }

    #[test]
    fn a_column_past_the_end_is_the_end_of_the_line() {
        let lines = Lines::new("ab");
        assert_eq!(lines.utf16(0, 9), 2);
        assert_eq!(lines.code_points(0, 9), 2);
        assert_eq!(lines.utf16(7, 0), 0);
    }

    #[test]
    fn a_byte_order_mark_shifts_the_first_line_only() {
        let lines = Lines::new("\u{feff}[[a]]\n[[b]]");
        assert_eq!(lines.utf16(0, 0), 1);
        assert_eq!(lines.code_points(0, 1), 0);
        assert_eq!(lines.utf16(1, 0), 0);
    }
}
