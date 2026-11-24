//! A card as the resolver sees it: its references and its reserved
//! frontmatter keys.
//!
//! Parsing never fails. A card caught half-written is ordinary input: a
//! reference that is malformed is left out, and frontmatter that cannot be read
//! contributes nothing.

use std::fmt;

use crate::frontmatter;
use crate::imports::Import;
use crate::scan;
use crate::text;

/// The part of a reference after `#`: a place inside the card it names.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Fragment {
    /// A heading, written `[[page#Heading]]`; holds the text after `#` as
    /// written.
    Heading(String),
    /// A block, written `[[page#^id]]`; holds the block identifier without its
    /// `^`.
    Block(String),
}

/// Why the text between `[[` and `]]` is not a reference.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum ReferenceError {
    /// The text is empty or only whitespace.
    Empty,
    /// A `|` is followed by no display text.
    EmptyDisplay,
    /// A `#` is followed by no heading.
    EmptyHeading,
    /// The text after `#^` is not a block identifier: a letter or digit, then
    /// up to 63 letters, digits, `_` or `-`.
    InvalidBlockId(String),
    /// Nothing names a page, as in `[[#heading]]`.
    NoPage,
    /// The page reference holds `^`, `[`, `]`, `:` or a newline, which are
    /// reserved.
    ReservedCharacter,
    /// An absolute or unqualified page reference has a `.` or `..` segment,
    /// which only a relative reference, opening with `./` or `../`, may hold.
    DotSegment,
}

impl fmt::Display for ReferenceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ReferenceError::Empty => f.write_str("empty link target"),
            ReferenceError::EmptyDisplay => f.write_str("empty display text"),
            ReferenceError::EmptyHeading => f.write_str("empty heading fragment"),
            ReferenceError::InvalidBlockId(id) => write!(f, "invalid block id '{id}'"),
            ReferenceError::NoPage => f.write_str("link target has no page reference"),
            ReferenceError::ReservedCharacter => f.write_str("reserved character in target"),
            ReferenceError::DotSegment => {
                f.write_str("'.' or '..' outside an explicit relative reference")
            }
        }
    }
}

impl std::error::Error for ReferenceError {}

/// The text between `[[` and `]]`, split into its parts.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Reference {
    /// The page reference: what [`Vault::resolve`](crate::Vault::resolve)
    /// takes, with surrounding whitespace removed.
    pub page: String,
    /// The heading or block the reference points at inside that page.
    pub fragment: Option<Fragment>,
    /// The display text after `|`, as written.
    pub display: Option<String>,
}

impl Reference {
    /// Splits the text between `[[` and `]]` into page reference, fragment
    /// and display text.
    pub fn parse(inner: &str) -> Result<Reference, ReferenceError> {
        if text::strip(inner).is_empty() {
            return Err(ReferenceError::Empty);
        }

        // Display text comes last and may itself hold a `|`, so the split is
        // at the first one.
        let (rest, display) = match inner.split_once('|') {
            Some((_, display)) if text::strip(display).is_empty() => {
                return Err(ReferenceError::EmptyDisplay);
            }
            Some((rest, display)) => (rest, Some(display.to_owned())),
            None => (inner, None),
        };

        let (rest, fragment) = match rest.split_once('#') {
            Some((rest, fragment)) => match fragment.strip_prefix('^') {
                Some(id) if is_block_id(id) => (rest, Some(Fragment::Block(id.to_owned()))),
                Some(id) => return Err(ReferenceError::InvalidBlockId(id.to_owned())),
                None if text::strip(fragment).is_empty() => {
                    return Err(ReferenceError::EmptyHeading);
                }
                None => (rest, Some(Fragment::Heading(fragment.to_owned()))),
            },
            None => (rest, None),
        };

        let page = text::strip(rest);
        if page.is_empty() {
            return Err(ReferenceError::NoPage);
        }
        if page.contains(['^', '[', ']', ':', '\n']) {
            return Err(ReferenceError::ReservedCharacter);
        }
        if dot_segment_outside_relative(page) {
            return Err(ReferenceError::DotSegment);
        }

        Ok(Reference {
            page: page.to_owned(),
            fragment,
            display,
        })
    }
}

/// Whether `id` is a block identifier: a letter or digit, then up to 63
/// letters, digits, `_` or `-`.
fn is_block_id(id: &str) -> bool {
    let mut chars = id.chars();
    chars.next().is_some_and(|c| c.is_ascii_alphanumeric())
        && id.len() <= 64
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// One `[[reference]]` or `![[embed]]` in a card.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Link {
    /// The reference as written, brackets and `!` included.
    pub raw: String,
    /// The page reference: what [`Vault::resolve`](crate::Vault::resolve)
    /// takes.
    pub page: String,
    /// The heading or block the reference points at inside that page.
    pub fragment: Option<Fragment>,
    /// The display text after `|`, as written.
    pub display: Option<String>,
    /// Whether the reference is an embed, written with a leading `!`.
    pub embed: bool,
    /// The line the reference starts on, counted from 1.
    pub line: usize,
    /// The column the reference starts at, counted from 1 in Unicode code
    /// points, so it is the same number in every implementation whatever its
    /// string type.
    pub column: usize,
}

/// What a card is written in, which its file extension decides (HMD-0029).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Kind {
    /// A `.hmd` file: scanned for references, with its reserved frontmatter
    /// keys read.
    HyperMarkdown,
    /// A `.md` or `.markdown` file: a target of references, never scanned, its
    /// frontmatter not interpreted.
    Markdown,
}

/// One card: its path, its references, and its reserved frontmatter keys.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Page {
    /// The card's path relative to the namespace root, with `/` between
    /// components.
    pub path: String,
    /// What the card is written in.
    pub kind: Kind,
    /// The card's well-formed references, in the order they appear.
    pub links: Vec<Link>,
    /// What the card's `use` key says about autodiscovery: `Some(true)` for
    /// `autodiscovery`, `Some(false)` for `no_autodiscovery`, `None` when the
    /// card does not say.
    pub autodiscovery: Option<bool>,
    /// The well-formed statements of the card's `import` key, in the order
    /// written.
    pub imports: Vec<Import>,
}

impl Page {
    /// Parses the text of the card at `path`.
    ///
    /// One leading byte-order mark is dropped first, so frontmatter after it
    /// is frontmatter and line 1, column 1 is the character after it. A line
    /// ends at `\n`, `\r\n` or a lone `\r`, and at nothing else. A path
    /// ending in `.md`
    /// or `.markdown` is a Markdown card: it has no links, no imports and no
    /// `use` key, whatever its text holds.
    pub fn parse(path: impl Into<String>, text: &str) -> Page {
        let path = path.into();
        if matches!(crate::paths::card_suffix(&path), Some(".md" | ".markdown")) {
            return Page {
                path,
                kind: Kind::Markdown,
                links: Vec::new(),
                autodiscovery: None,
                imports: Vec::new(),
            };
        }
        let text = text::universal_newlines(text::strip_bom(text));
        let (raw_yaml, body_start) = frontmatter::split(&text);
        let card = raw_yaml.map(frontmatter::card).unwrap_or_default();

        // Only the body is scanned: frontmatter is YAML, not markup.
        let chars: Vec<char> = text.chars().collect();
        let body_offset = text[..body_start].chars().count();
        let masked = scan::mask(&chars[body_offset..]);

        let positions = Positions::new(&chars);
        let links = scan::find_links(&masked)
            .into_iter()
            .filter_map(|found| {
                let reference = Reference::parse(&found.inner).ok()?;
                let start = body_offset + found.start;
                let end = body_offset + found.end;
                let (line, column) = positions.at(start);
                Some(Link {
                    raw: chars[start..end].iter().collect(),
                    page: reference.page,
                    fragment: reference.fragment,
                    display: reference.display,
                    embed: found.embed,
                    line,
                    column,
                })
            })
            .collect();

        Page {
            path,
            kind: Kind::HyperMarkdown,
            links,
            autodiscovery: card.autodiscovery,
            imports: card.imports,
        }
    }
}

/// The character offset each line of a text starts at.
struct Positions {
    starts: Vec<usize>,
}

impl Positions {
    /// Indexes the lines of `chars`.
    fn new(chars: &[char]) -> Self {
        let mut starts = vec![0];
        starts.extend(
            chars
                .iter()
                .enumerate()
                .filter(|(_, c)| **c == '\n')
                .map(|(at, _)| at + 1),
        );
        Positions { starts }
    }

    /// The line and column of a character offset, both counted from 1.
    fn at(&self, offset: usize) -> (usize, usize) {
        let line = self.starts.partition_point(|&start| start <= offset);
        (line, offset - self.starts[line - 1] + 1)
    }
}

/// Whether an absolute or unqualified page reference has a `.` or `..`
/// segment. Only an explicit relative reference may hold them.
pub(crate) fn dot_segment_outside_relative(page: &str) -> bool {
    !(page.starts_with("./") || page.starts_with("../"))
        && page.split('/').any(|part| part == "." || part == "..")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reference(inner: &str) -> Reference {
        Reference::parse(inner).unwrap()
    }

    #[test]
    fn a_reference_is_a_page() {
        let r = reference(" tokens ");
        assert_eq!(r.page, "tokens");
        assert_eq!(r.fragment, None);
        assert_eq!(r.display, None);
    }

    #[test]
    fn a_fragment_follows_the_hash() {
        assert_eq!(
            reference("tokens#Rotation policy").fragment,
            Some(Fragment::Heading("Rotation policy".into()))
        );
        assert_eq!(
            reference("tokens#^def-1").fragment,
            Some(Fragment::Block("def-1".into()))
        );
        // The split is at the first `#`.
        assert_eq!(
            reference("a#b#c").fragment,
            Some(Fragment::Heading("b#c".into()))
        );
    }

    #[test]
    fn display_text_follows_the_first_bar() {
        let r = reference("tokens#Rotation|see | here");
        assert_eq!(r.page, "tokens");
        assert_eq!(r.fragment, Some(Fragment::Heading("Rotation".into())));
        assert_eq!(r.display.as_deref(), Some("see | here"));
        // A `#` in display text is not a fragment.
        assert_eq!(reference("tokens|issue #4").fragment, None);
    }

    #[test]
    fn a_malformed_reference_says_why() {
        for (inner, why) in [
            ("", ReferenceError::Empty),
            ("  ", ReferenceError::Empty),
            ("a|", ReferenceError::EmptyDisplay),
            ("a| ", ReferenceError::EmptyDisplay),
            ("a#", ReferenceError::EmptyHeading),
            ("a#^", ReferenceError::InvalidBlockId(String::new())),
            ("a#^-x", ReferenceError::InvalidBlockId("-x".into())),
            ("a#^x y", ReferenceError::InvalidBlockId("x y".into())),
            ("#tag", ReferenceError::NoPage),
            ("|x", ReferenceError::NoPage),
            ("a^b", ReferenceError::ReservedCharacter),
            ("/a/../b", ReferenceError::DotSegment),
            ("/./a", ReferenceError::DotSegment),
            ("a/../b", ReferenceError::DotSegment),
            ("..", ReferenceError::DotSegment),
        ] {
            assert_eq!(Reference::parse(inner), Err(why), "{inner:?}");
        }
    }

    #[test]
    fn a_block_id_is_at_most_64_characters() {
        assert!(is_block_id(&"a".repeat(64)));
        assert!(!is_block_id(&"a".repeat(65)));
        assert!(is_block_id("A_b-9"));
        assert!(!is_block_id("_a"));
    }

    #[test]
    fn a_page_lists_its_references_with_positions() {
        let page = Page::parse(
            "specs/login.hmd",
            "# Login\n\nsee [[tokens#Rotation|the policy]] and ![[tokens#^def]]\n",
        );
        assert_eq!(page.path, "specs/login.hmd");
        assert_eq!(page.links.len(), 2);

        let first = &page.links[0];
        assert_eq!(first.raw, "[[tokens#Rotation|the policy]]");
        assert_eq!(first.page, "tokens");
        assert_eq!(first.fragment, Some(Fragment::Heading("Rotation".into())));
        assert_eq!(first.display.as_deref(), Some("the policy"));
        assert!(!first.embed);
        assert_eq!((first.line, first.column), (3, 5));

        let second = &page.links[1];
        assert_eq!(second.raw, "![[tokens#^def]]");
        assert_eq!(second.fragment, Some(Fragment::Block("def".into())));
        assert!(second.embed);
        assert_eq!((second.line, second.column), (3, 40));
    }

    #[test]
    fn a_column_counts_characters() {
        let page = Page::parse("a.hmd", "é😀 [[b]]\n");
        assert_eq!((page.links[0].line, page.links[0].column), (1, 4));
    }

    #[test]
    fn frontmatter_is_read_and_not_scanned() {
        let page = Page::parse(
            "a.hmd",
            "---\nuse: no_autodiscovery\nimport: from ./lib import x\ntitle: \"[[not-a-link]]\"\n---\n[[b]]\n",
        );
        assert_eq!(page.autodiscovery, Some(false));
        assert_eq!(page.imports.len(), 1);
        assert_eq!(page.links.len(), 1);
        assert_eq!((page.links[0].line, page.links[0].column), (6, 1));
    }

    #[test]
    fn a_malformed_reference_is_left_out() {
        let page = Page::parse("a.hmd", "[[]] [[#tag]] [[ok]] [[a#^]] [[unclosed\n");
        assert_eq!(
            page.links
                .iter()
                .map(|l| l.raw.as_str())
                .collect::<Vec<_>>(),
            ["[[ok]]"]
        );
    }

    #[test]
    fn carriage_returns_end_lines() {
        let page = Page::parse("a.hmd", "one\r\ntwo\r[[b]]\r\n");
        assert_eq!((page.links[0].line, page.links[0].column), (3, 1));
    }

    #[test]
    fn no_other_boundary_ends_a_line() {
        let page = Page::parse("a.hmd", "a\u{0c}b\u{2028}c\u{85} [[d]]\n");
        assert_eq!((page.links[0].line, page.links[0].column), (1, 8));
    }

    #[test]
    fn a_leading_byte_order_mark_is_not_part_of_the_card() {
        let page = Page::parse("a.hmd", "\u{feff}---\nuse: no_autodiscovery\n---\n[[b]]\n");
        assert_eq!(page.autodiscovery, Some(false));
        assert_eq!((page.links[0].line, page.links[0].column), (4, 1));

        let page = Page::parse("a.hmd", "\u{feff}[[b]]");
        assert_eq!((page.links[0].line, page.links[0].column), (1, 1));

        // Only one: a second mark is text, so the fence is not the first line.
        let page = Page::parse("a.hmd", "\u{feff}\u{feff}---\nuse: no_autodiscovery\n---\n");
        assert_eq!(page.autodiscovery, None);
    }

    #[test]
    fn a_card_with_no_frontmatter_states_nothing() {
        let page = Page::parse("a.hmd", "[[b]]");
        assert_eq!(page.autodiscovery, None);
        assert!(page.imports.is_empty());
    }
}
