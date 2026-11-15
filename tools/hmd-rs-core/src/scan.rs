//! The masking scanner: where a card's references are.
//!
//! The scanner does not parse CommonMark. It blanks the regions in which markup
//! is not interpreted (fenced code blocks, HTML comments and inline code spans)
//! and then finds `[[...]]` in what is left. Blanking replaces each character
//! with a space and keeps every newline, so an offset into the masked text is
//! the same offset into the card.
//!
//! An indented block is not masked. Under the callout and footnote syntaxes a
//! four-space indent continues a callout body or a footnote, so a reference
//! inside one is a reference.
//!
//! Offsets are counted in characters, as the canonical implementation counts
//! them, which is what makes a column the same number in both.

use crate::text;

/// A half-open range of character offsets.
type Region = (usize, usize);

/// A `[[...]]` or `![[...]]` found in masked text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RawLink {
    /// Whether the reference opens with `!`.
    pub(crate) embed: bool,
    /// The masked text between the brackets.
    pub(crate) inner: String,
    /// The offset of the first character of the reference.
    pub(crate) start: usize,
    /// The offset one past the closing brackets.
    pub(crate) end: usize,
}

/// `body` with every region markup is not interpreted in replaced by spaces.
pub(crate) fn mask(body: &[char]) -> Vec<char> {
    let mut regions = fenced_regions(body);
    let mut blanked = body.to_vec();
    blank(&mut blanked, &regions);

    // Comments are found in text that already has its fences blanked, so a
    // `<!--` inside a code block does not open a comment.
    let comments = comment_regions(&blanked);
    blank(&mut blanked, &comments);
    regions.extend(comments);

    regions.extend(code_span_regions(&blanked));

    let mut masked = body.to_vec();
    blank(&mut masked, &regions);
    masked
}

/// Replaces every character of `regions` in `chars` with a space, except a
/// newline.
fn blank(chars: &mut [char], regions: &[Region]) {
    for &(start, end) in regions {
        let end = end.min(chars.len());
        for c in &mut chars[start..end] {
            if *c != '\n' {
                *c = ' ';
            }
        }
    }
}

/// A line that opens or closes a fenced code block.
struct Fence<'a> {
    /// The character the fence is made of, a backtick or a tilde.
    mark: char,
    /// How many of that character the fence is made of.
    length: usize,
    /// The rest of the line after the fence.
    info: &'a str,
}

/// Reads `line` as a fence: optional indentation, then three or more backticks
/// or three or more tildes.
fn fence(line: &str) -> Option<Fence<'_>> {
    let rest = line.trim_start_matches([' ', '\t']);
    let mark = rest.chars().next().filter(|c| matches!(c, '`' | '~'))?;
    let length = rest.chars().take_while(|&c| c == mark).count();
    (length >= 3).then(|| Fence {
        mark,
        length,
        info: &rest[length..],
    })
}

/// The region of each fenced code block, closed or not.
fn fenced_regions(body: &[char]) -> Vec<Region> {
    let text: String = body.iter().collect();
    let mut regions = Vec::new();
    let mut open: Option<(char, usize, usize)> = None;
    let mut offset = 0;

    for line in text::lines_with_ends(&text) {
        let length = line.chars().count();
        let found = fence(text::strip_eol(line));
        match (open, found) {
            // An opener's info string may not start with the fence character.
            (None, Some(f)) if !text::strip(f.info).starts_with(f.mark) => {
                open = Some((f.mark, f.length, offset));
            }
            // A closer is the same character, at least as long, with no info
            // string.
            (Some((mark, min, start)), Some(f))
                if f.mark == mark && f.length >= min && text::strip(f.info).is_empty() =>
            {
                regions.push((start, offset + length));
                open = None;
            }
            _ => {}
        }
        offset += length;
    }

    // An unterminated fence runs to the end of the card.
    if let Some((_, _, start)) = open {
        regions.push((start, body.len()));
    }
    regions
}

/// The offset of the first occurrence of `needle` in `chars` at or after
/// `from`.
fn find(chars: &[char], needle: &[char], from: usize) -> Option<usize> {
    if from > chars.len() {
        return None;
    }
    chars[from..]
        .windows(needle.len())
        .position(|window| window == needle)
        .map(|at| at + from)
}

/// The region of each HTML comment, from `<!--` to the nearest `-->`.
fn comment_regions(chars: &[char]) -> Vec<Region> {
    const OPEN: [char; 4] = ['<', '!', '-', '-'];
    const CLOSE: [char; 3] = ['-', '-', '>'];
    let mut regions = Vec::new();
    let mut from = 0;
    while let Some(start) = find(chars, &OPEN, from) {
        let Some(close) = find(chars, &CLOSE, start + OPEN.len()) else {
            break;
        };
        from = close + CLOSE.len();
        regions.push((start, from));
    }
    regions
}

/// The region of each inline code span: a run of backticks, the shortest text
/// of at least one character, and the same number of backticks again.
///
/// When a run has no closing run of its own length the span is tried with
/// fewer backticks, so the unmatched ones become part of the span's text. A
/// span holding a blank line is not a code span and is not masked, though the
/// search still resumes after it.
fn code_span_regions(chars: &[char]) -> Vec<Region> {
    let mut regions = Vec::new();
    let mut at = 0;
    while at < chars.len() {
        if chars[at] != '`' {
            at += 1;
            continue;
        }
        let run = chars[at..].iter().take_while(|&&c| c == '`').count();
        let end = (1..=run).rev().find_map(|ticks| {
            let closer = vec!['`'; ticks];
            find(chars, &closer, at + ticks + 1).map(|close| close + ticks)
        });
        match end {
            Some(end) => {
                let blank_line = chars[at..end].windows(2).any(|pair| pair == ['\n', '\n']);
                if !blank_line {
                    regions.push((at, end));
                }
                at = end;
            }
            None => at += 1,
        }
    }
    regions
}

/// Every well-formed reference in `masked`: optional `!`, `[[`, text holding
/// no bracket and no newline, `]]`.
pub(crate) fn find_links(masked: &[char]) -> Vec<RawLink> {
    let mut links = Vec::new();
    let mut last_end = 0;
    let mut at = 0;
    while at + 1 < masked.len() {
        if masked[at] != '[' || masked[at + 1] != '[' {
            at += 1;
            continue;
        }
        let inner_start = at + 2;
        let inner_end = masked[inner_start..]
            .iter()
            .position(|c| matches!(c, '[' | ']' | '\n'))
            .map_or(masked.len(), |len| inner_start + len);
        let closed = masked.get(inner_end) == Some(&']') && masked.get(inner_end + 1) == Some(&']');
        if !closed {
            at += 1;
            continue;
        }
        let embed = at > last_end && masked[at - 1] == '!';
        let end = inner_end + 2;
        links.push(RawLink {
            embed,
            inner: masked[inner_start..inner_end].iter().collect(),
            start: if embed { at - 1 } else { at },
            end,
        });
        last_end = end;
        at = end;
    }
    links
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chars(text: &str) -> Vec<char> {
        text.chars().collect()
    }

    fn masked(text: &str) -> String {
        mask(&chars(text)).into_iter().collect()
    }

    fn raws(text: &str) -> Vec<String> {
        let source = chars(text);
        find_links(&mask(&source))
            .into_iter()
            .map(|link| source[link.start..link.end].iter().collect())
            .collect()
    }

    #[test]
    fn masking_keeps_every_offset_and_newline() {
        let text = "a\n```\n[[x]]\n```\nb `[[y]]` <!-- [[z]]\n --> c\n";
        let out = masked(text);
        assert_eq!(out.chars().count(), text.chars().count());
        assert_eq!(out, "a\n   \n     \n   \nb                   \n     c\n");
    }

    #[test]
    fn a_fenced_block_hides_its_references() {
        assert_eq!(
            raws("[[a]]\n```hql\n[[b]]\n```\n[[c]]\n"),
            ["[[a]]", "[[c]]"]
        );
        assert_eq!(raws("~~~\n[[b]]\n~~~~\n[[c]]\n"), ["[[c]]"]);
    }

    #[test]
    fn a_fence_closes_only_on_its_own_character_and_length() {
        // A shorter run and the other character do not close the block.
        assert!(raws("````\n```\n~~~~\n[[b]]\n").is_empty());
        // A closer carries no info string.
        assert!(raws("```\n``` x\n[[b]]\n").is_empty());
    }

    #[test]
    fn an_unterminated_fence_runs_to_the_end() {
        assert_eq!(raws("[[a]]\n  ```\n[[b]]\n"), ["[[a]]"]);
    }

    #[test]
    fn backticks_in_an_info_string_do_not_open_a_fence() {
        assert_eq!(raws("``` `x`\n[[a]]\n"), ["[[a]]"]);
    }

    #[test]
    fn a_comment_hides_its_references() {
        assert_eq!(raws("<!-- [[a]]\n[[b]] --> [[c]]"), ["[[c]]"]);
        assert_eq!(raws("<!-- [[a]]"), ["[[a]]"]);
        assert_eq!(raws("<!--> [[a]] -->[[b]]"), ["[[b]]"]);
    }

    #[test]
    fn a_code_span_hides_its_references() {
        assert_eq!(raws("`[[a]]` [[b]] ``[[c]] ` ``"), ["[[b]]"]);
    }

    #[test]
    fn a_code_span_does_not_cross_a_blank_line() {
        assert_eq!(raws("`[[a]]\n\n[[b]]`"), ["[[a]]", "[[b]]"]);
    }

    #[test]
    fn an_unmatched_run_is_tried_with_fewer_backticks() {
        // Two backticks have no closing pair, so one opens a span that the
        // next single backtick closes.
        assert_eq!(code_span_regions(&chars("``a` b")), [(0, 4)]);
        assert_eq!(
            code_span_regions(&chars("``a` b ``c`` `")),
            [(0, 9), (10, 14)]
        );
    }

    #[test]
    fn an_indented_reference_is_found() {
        assert_eq!(raws("    [[a]]\n\t[[b]]\n"), ["[[a]]", "[[b]]"]);
    }

    #[test]
    fn a_reference_holds_no_bracket_and_no_newline() {
        assert_eq!(raws("[[[a]]"), ["[[a]]"]);
        assert!(raws("[[a\nb]]").is_empty());
        assert!(raws("[[a]").is_empty());
        assert_eq!(raws("[[a]]]"), ["[[a]]"]);
        assert_eq!(raws("[[]]"), ["[[]]"]);
    }

    #[test]
    fn a_bang_makes_an_embed() {
        let links = find_links(&chars("![[a]] [[b]]![[c]]"));
        assert_eq!(
            links
                .iter()
                .map(|l| (l.embed, l.start, l.end))
                .collect::<Vec<_>>(),
            [(true, 0, 6), (false, 7, 12), (true, 12, 18)]
        );
    }

    #[test]
    fn offsets_count_characters() {
        let links = find_links(&chars("é😀 [[a]]"));
        assert_eq!((links[0].start, links[0].end), (3, 8));
    }
}
