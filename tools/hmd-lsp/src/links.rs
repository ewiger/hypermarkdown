//! The parts of a reference as written, and the reference under a position.
//!
//! The resolver gives each reference its text and where it starts. An editor
//! colours the page name, the fragment and the display text separately, so
//! this module finds where each of them lies inside that text. It reads the
//! text the same way the resolver's parser does: the display text follows the
//! first `|`, and the fragment follows the first `#` before it.

use hypermarkdown::{Link, Page};

/// A run of code points inside a reference: where it starts, counted from the
/// reference's first character, and how long it is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Run {
    /// The offset of the run's first code point.
    pub start: usize,
    /// The number of code points in the run.
    pub len: usize,
}

/// Where each part of a reference lies inside its text.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Parts {
    /// The page reference, without the whitespace around it.
    pub page: Run,
    /// The `#` and the heading or block after it.
    pub fragment: Option<Run>,
    /// The display text after `|`.
    pub display: Option<Run>,
}

/// Finds the parts of `link` inside the text it was written as.
pub fn parts(link: &Link) -> Parts {
    let raw: Vec<char> = link.raw.chars().collect();
    let open = if link.embed { 3 } else { 2 };
    let inner = raw.get(open..raw.len().saturating_sub(2)).unwrap_or(&[]);

    let bar = inner.iter().position(|c| *c == '|');
    let rest_end = bar.unwrap_or(inner.len());
    let hash = inner[..rest_end].iter().position(|c| *c == '#');

    let mut start = 0;
    let mut end = hash.unwrap_or(rest_end);
    while start < end && inner[start].is_whitespace() {
        start += 1;
    }
    while end > start && inner[end - 1].is_whitespace() {
        end -= 1;
    }

    Parts {
        page: Run {
            start: open + start,
            len: end - start,
        },
        fragment: hash.map(|hash| Run {
            start: open + hash,
            len: rest_end - hash,
        }),
        display: bar.map(|bar| Run {
            start: open + bar + 1,
            len: inner.len() - bar - 1,
        }),
    }
}

/// The number of code points in the reference as written.
pub fn len(link: &Link) -> usize {
    link.raw.chars().count()
}

/// The reference of `page` that covers the code point `column` of the line
/// `line`, both counted from 0.
///
/// The position just after the closing `]]` counts as inside the reference: a
/// cursor at the end of a link is on that link.
pub fn at(page: &Page, line: usize, column: usize) -> Option<&Link> {
    page.links.iter().find(|link| {
        let start = link.column - 1;
        link.line - 1 == line && (start..=start + len(link)).contains(&column)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn only_link(text: &str) -> Link {
        let page = Page::parse("a.hmd", text);
        assert_eq!(page.links.len(), 1, "{text:?}");
        page.links[0].clone()
    }

    fn slice(link: &Link, run: Run) -> String {
        link.raw.chars().skip(run.start).take(run.len).collect()
    }

    #[test]
    fn a_bare_reference_is_all_page() {
        let link = only_link("[[tokens]]");
        let parts = parts(&link);
        assert_eq!(slice(&link, parts.page), "tokens");
        assert_eq!(parts.fragment, None);
        assert_eq!(parts.display, None);
    }

    #[test]
    fn a_full_reference_has_three_parts() {
        let link = only_link("see ![[ shared/tokens #Rotation|how keys rotate]]");
        let parts = parts(&link);
        assert_eq!(slice(&link, parts.page), "shared/tokens");
        assert_eq!(slice(&link, parts.fragment.unwrap()), "#Rotation");
        assert_eq!(slice(&link, parts.display.unwrap()), "how keys rotate");
    }

    #[test]
    fn a_block_fragment_keeps_its_caret() {
        let link = only_link("[[tokens#^rotation]]");
        assert_eq!(slice(&link, parts(&link).fragment.unwrap()), "#^rotation");
    }

    #[test]
    fn a_hash_in_the_display_text_is_display_text() {
        let link = only_link("[[tokens|issue #4]]");
        let parts = parts(&link);
        assert_eq!(parts.fragment, None);
        assert_eq!(slice(&link, parts.display.unwrap()), "issue #4");
    }

    #[test]
    fn a_position_inside_a_reference_finds_it() {
        let page = Page::parse("a.hmd", "x [[one]] y [[two]]\n");
        assert_eq!(at(&page, 0, 2).unwrap().page, "one");
        assert_eq!(at(&page, 0, 9).unwrap().page, "one");
        assert_eq!(at(&page, 0, 15).unwrap().page, "two");
    }

    #[test]
    fn a_position_outside_every_reference_finds_none() {
        let page = Page::parse("a.hmd", "x [[one]] y\n[[two]]\n");
        assert!(at(&page, 0, 0).is_none());
        assert!(at(&page, 0, 11).is_none());
        assert!(at(&page, 2, 0).is_none());
    }
}
