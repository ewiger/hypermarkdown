//! In-card addresses: the path of steps after a reference's `#` (HMD-0006).
//!
//! A port of the canonical `address.py` and `blocks.py`. An address is parsed
//! without the card it points into, then resolved against one card to a span
//! of its text: a section, a block, a sentence, a span of words, or lines.
//! The crate does not lint, so where the canonical implementation reports a
//! diagnostic this module returns an [`AddressError`] or a [`Warning`], each
//! naming the rule it stands for.
//!
//! Work is done over characters, as the scanner's is, and offsets are reported
//! in UTF-8 bytes of the card's text after newline translation — the text the
//! canonical implementation reads.

use std::fmt;

use crate::{frontmatter, paths, scan, text};

/// A unit a counted step counts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Unit {
    /// A paragraph, `Para` or `p`.
    Para,
    /// A table, `Table` or `t`.
    Table,
    /// A list, `List`.
    List,
    /// A fenced code block that is not a diagram cell, `Code` or `c`.
    Code,
    /// A blockquote, `Blockquote`.
    Blockquote,
    /// An admonition or a `> [!type]` quote, `Callout`.
    Callout,
    /// A display-math block, `Math` or `m`.
    Math,
    /// A `d2#show` or `mermaid#show` fence, `Diagram` or `d`.
    Diagram,
    /// A paragraph that is a single embed, `Embed` or `e`.
    Embed,
    /// A raw HTML block, `Html`.
    Html,
    /// A block of any kind, `Block` or `b`.
    Block,
    /// A sentence of a prose block, `Sentence` or `s`.
    Sentence,
    /// A word of a prose block or a sentence, `Word` or `w`.
    Word,
    /// A line of the card or of a block, `Line` or `l`.
    Line,
}

const UNITS: [(Unit, &str, Option<&str>); 14] = [
    (Unit::Para, "Para", Some("p")),
    (Unit::Table, "Table", Some("t")),
    (Unit::List, "List", None),
    (Unit::Code, "Code", Some("c")),
    (Unit::Blockquote, "Blockquote", None),
    (Unit::Callout, "Callout", None),
    (Unit::Math, "Math", Some("m")),
    (Unit::Diagram, "Diagram", Some("d")),
    (Unit::Embed, "Embed", Some("e")),
    (Unit::Html, "Html", None),
    (Unit::Block, "Block", Some("b")),
    (Unit::Sentence, "Sentence", Some("s")),
    (Unit::Word, "Word", Some("w")),
    (Unit::Line, "Line", Some("l")),
];

impl Unit {
    /// The unit's long name, as an address spells it in full.
    pub fn name(self) -> &'static str {
        UNITS
            .iter()
            .find(|(u, _, _)| *u == self)
            .map(|(_, n, _)| *n)
            .unwrap_or("")
    }

    fn is_block(self) -> bool {
        !matches!(self, Unit::Sentence | Unit::Word | Unit::Line)
    }

    fn plural(self) -> &'static str {
        match self {
            Unit::Para => "paragraphs",
            Unit::Table => "tables",
            Unit::List => "lists",
            Unit::Code => "code blocks",
            Unit::Blockquote => "blockquotes",
            Unit::Callout => "callouts",
            Unit::Math => "math blocks",
            Unit::Diagram => "diagrams",
            Unit::Embed => "embeds",
            Unit::Html => "HTML blocks",
            Unit::Block => "blocks",
            Unit::Sentence => "sentences",
            Unit::Word => "words",
            Unit::Line => "lines",
        }
    }

    fn is_prose(self) -> bool {
        matches!(
            self,
            Unit::Para | Unit::List | Unit::Blockquote | Unit::Callout
        )
    }
}

fn unit_of(word: &str) -> Option<(Unit, bool)> {
    UNITS.iter().find_map(|(unit, long, short)| {
        if *long == word {
            Some((*unit, true))
        } else if *short == Some(word) {
            Some((*unit, false))
        } else {
            None
        }
    })
}

/// One step of an address.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Step {
    /// A heading, by its text or slug as written.
    Heading(String),
    /// A block anchor, by its identifier without `^`.
    Anchor(String),
    /// A unit and a 1-based ordinal, or a range of ordinals.
    Counted {
        /// The step as written.
        text: String,
        /// What is counted.
        unit: Unit,
        /// The first ordinal.
        first: usize,
        /// The last ordinal; equal to `first` unless the step is a range.
        last: usize,
        /// Whether the step was written as a range.
        range: bool,
    },
}

impl Step {
    fn text(&self) -> String {
        match self {
            Step::Heading(t) => t.clone(),
            Step::Anchor(id) => format!("^{id}"),
            Step::Counted { text, .. } => text.clone(),
        }
    }

    fn selects_block(&self) -> bool {
        match self {
            Step::Anchor(_) => true,
            Step::Counted { unit, .. } => unit.is_block(),
            Step::Heading(_) => false,
        }
    }
}

/// A parsed address: its steps and its optional integrity digest.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Address {
    /// The steps, in order.
    pub steps: Vec<Step>,
    /// The sixteen hex digits after `@sha256-`, if written.
    pub digest: Option<String>,
}

/// Why an address selects nothing. Each variant stands for the rule the
/// canonical implementation reports.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum AddressError {
    /// A static rule of the address grammar is broken (HMD019).
    Syntax(String),
    /// A heading step matches no heading in its scope (HMD004).
    NoHeading(String),
    /// A block step matches no anchor in the card (HMD005).
    NoBlock(String),
    /// A counted step selects nothing in its scope (HMD020).
    Nothing(String),
}

impl AddressError {
    /// The identifier of the rule this failure stands for.
    pub fn rule(&self) -> &'static str {
        match self {
            AddressError::Syntax(_) => "HMD019",
            AddressError::NoHeading(_) => "HMD004",
            AddressError::NoBlock(_) => "HMD005",
            AddressError::Nothing(_) => "HMD020",
        }
    }
}

impl fmt::Display for AddressError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AddressError::Syntax(m)
            | AddressError::NoHeading(m)
            | AddressError::NoBlock(m)
            | AddressError::Nothing(m) => f.write_str(m),
        }
    }
}

impl std::error::Error for AddressError {}

/// Something that does not stop an address resolving.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum Warning {
    /// A block step is not inside the section named before it (HMD021).
    Moved(String),
    /// The integrity digest does not match the selected text (HMD023).
    Stale {
        /// The digest the address carries.
        written: String,
        /// The digest of the text it now selects.
        actual: String,
    },
}

impl Warning {
    /// The identifier of the rule this warning stands for.
    pub fn rule(&self) -> &'static str {
        match self {
            Warning::Moved(_) => "HMD021",
            Warning::Stale { .. } => "HMD023",
        }
    }
}

/// Where an address landed.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Located {
    /// UTF-8 byte offset of the first selected byte.
    pub start: usize,
    /// UTF-8 byte offset one past the last selected byte.
    pub end: usize,
    /// The selected text.
    pub text: String,
    /// Warnings that did not stop the address resolving.
    pub warnings: Vec<Warning>,
}

/// Ordinals above this are refused before anything is counted.
pub const MAX_ORDINAL: usize = 1_000_000;
/// Addresses longer than this are refused.
pub const MAX_STEPS: usize = 32;

const SHORT_LETTERS: &str = "bcdelmpstw";

fn syntax(message: String) -> AddressError {
    AddressError::Syntax(message)
}

/// Python's `repr` of a string, for messages that match the canonical ones.
fn repr(value: &str) -> String {
    if value.contains('\'') && !value.contains('"') {
        format!("\"{value}\"")
    } else {
        format!("'{}'", value.replace('\\', "\\\\").replace('\'', "\\'"))
    }
}

/// The leftmost `@sha256-` with no `/` after it, as `re.search` finds it.
fn integrity(fragment: &str) -> Option<(usize, &str)> {
    fragment
        .match_indices("@sha256-")
        .map(|(at, _)| (at, &fragment[at + 8..]))
        .find(|(_, digest)| !digest.contains('/'))
}

/// `([A-Za-z]+)([0-9]+)` and optionally `-([A-Za-z]+)([0-9]+)`, the whole text.
/// A unit word and its digits, as written.
type Piece<'a> = (&'a str, &'a str);

fn counted_shape(text: &str) -> Option<(&str, &str, Option<Piece<'_>>)> {
    fn one(s: &str) -> Option<(&str, &str)> {
        let letters = s.bytes().take_while(u8::is_ascii_alphabetic).count();
        let digits = s[letters..].bytes().take_while(u8::is_ascii_digit).count();
        (letters > 0 && digits > 0 && letters + digits == s.len())
            .then(|| (&s[..letters], &s[letters..]))
    }
    if let Some(whole) = one(text) {
        return Some((whole.0, whole.1, None));
    }
    let (a, b) = text.split_once('-')?;
    let first = one(a)?;
    let second = one(b)?;
    Some((first.0, first.1, Some(second)))
}

fn counted(text: &str) -> Result<Option<Step>, AddressError> {
    let Some((u1, n1, second)) = counted_shape(text) else {
        return Ok(None);
    };
    let first_unit = unit_of(u1);
    let second_unit = second.and_then(|(u2, _)| unit_of(u2));
    if first_unit.is_none() && second_unit.is_none() {
        return Ok(None);
    }
    if second.is_some() {
        match (first_unit, second_unit) {
            (Some(a), Some(b)) if a.0 == b.0 => {
                if a.1 != b.1 {
                    return Err(syntax(format!(
                        "a range must spell both ends the same way, not {}",
                        repr(text)
                    )));
                }
            }
            _ => {
                return Err(syntax(format!(
                    "a range must use one unit on both ends, not {}",
                    repr(text)
                )));
            }
        }
    }
    let mut numbers = vec![n1];
    if let Some((_, n2)) = second {
        numbers.push(n2);
    }
    for number in &numbers {
        if number.bytes().all(|b| b == b'0') {
            return Err(syntax(format!(
                "ordinals count from 1, so {} names nothing",
                repr(text)
            )));
        }
        if number.starts_with('0') {
            return Err(syntax(format!(
                "an ordinal has no leading zeros: {}",
                repr(text)
            )));
        }
        if number.len() > 7 || number.parse::<usize>().unwrap_or(usize::MAX) > MAX_ORDINAL {
            return Err(syntax(format!(
                "ordinal {number} is above the limit of {MAX_ORDINAL}"
            )));
        }
    }
    let first: usize = numbers[0].parse().unwrap_or(0);
    let last: usize = numbers[numbers.len() - 1].parse().unwrap_or(0);
    if last < first {
        return Err(syntax(format!(
            "range {} ends before it starts",
            repr(text)
        )));
    }
    Ok(Some(Step::Counted {
        text: text.to_owned(),
        unit: first_unit.expect("a unit on the first end").0,
        first,
        last,
        range: second.is_some(),
    }))
}

/// Whether a fragment is more than the one-step heading or block form: it has
/// a `/`, an integrity digest, or a counted first step.
pub fn is_multi_step(fragment: &str) -> bool {
    if fragment.contains('/') || integrity(fragment).is_some() {
        return true;
    }
    !matches!(counted(fragment), Ok(None))
}

fn is_block_id(id: &str) -> bool {
    let mut chars = id.chars();
    chars.next().is_some_and(|c| c.is_ascii_alphanumeric())
        && id.len() <= 64
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

impl Address {
    /// Parses the text after `#`, checking every static rule (HMD019).
    pub fn parse(fragment: &str) -> Result<Address, AddressError> {
        let mut body = fragment;
        let mut digest = None;
        if let Some((at, written)) = integrity(fragment) {
            let valid = written.len() == 16
                && written
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b));
            if !valid {
                return Err(syntax(
                    "an integrity digest is '@sha256-' and sixteen lowercase hex digits".to_owned(),
                ));
            }
            digest = Some(written.to_owned());
            body = &fragment[..at];
        }

        let parts: Vec<&str> = body.split('/').collect();
        if parts.len() > MAX_STEPS {
            return Err(syntax(format!("an address has at most {MAX_STEPS} steps")));
        }
        let mut steps = Vec::new();
        for part in &parts {
            if part.trim_matches([' ', '\t']).is_empty() {
                return Err(syntax(
                    if parts.len() > 1 {
                        "an address has an empty step"
                    } else {
                        "empty fragment"
                    }
                    .to_owned(),
                ));
            }
            if let Some(id) = part.strip_prefix('^') {
                if !is_block_id(id) {
                    return Err(syntax(format!("invalid block id {}", repr(id))));
                }
                steps.push(Step::Anchor(id.to_owned()));
                continue;
            }
            match counted(part)? {
                Some(step) => steps.push(step),
                None => steps.push(Step::Heading((*part).to_owned())),
            }
        }
        check_placement(&steps)?;
        Ok(Address { steps, digest })
    }
}

fn check_placement(steps: &[Step]) -> Result<(), AddressError> {
    let mut previous: Option<&Step> = None;
    for (index, step) in steps.iter().enumerate() {
        let last = index == steps.len() - 1;
        let text = repr(&step.text());
        let after = previous
            .map(|p| format!(" cannot follow {}", repr(&p.text())))
            .unwrap_or_default();
        if matches!(step, Step::Counted { range: true, .. }) && !last {
            return Err(syntax(format!(
                "a range selects content, so {text} must be the last step"
            )));
        }
        let previous_is_heading = matches!(previous, Some(Step::Heading(_)));
        match step {
            Step::Heading(_) | Step::Anchor(_) => {
                if previous.is_some() && !previous_is_heading {
                    return Err(syntax(format!(
                        "{text}{after}: a named step follows only a heading"
                    )));
                }
            }
            Step::Counted { unit, .. } if unit.is_block() => {
                if previous.is_some() && !previous_is_heading {
                    return Err(syntax(format!(
                        "{text}{after}: blocks are counted in a card or a section"
                    )));
                }
            }
            Step::Counted {
                unit: Unit::Line, ..
            } => {
                if previous.is_some_and(|p| !p.selects_block()) {
                    return Err(syntax(format!(
                        "{text}{after}: lines are counted in the card or in one block"
                    )));
                }
                if !last {
                    return Err(syntax(format!(
                        "a line step must be the last step, not {text}"
                    )));
                }
            }
            Step::Counted {
                unit: Unit::Sentence,
                ..
            } => {
                if !previous.is_some_and(Step::selects_block) {
                    return Err(syntax(format!(
                        "{text} must follow a block: sentences are counted in one block"
                    )));
                }
            }
            Step::Counted { .. } => {
                let ok = previous.is_some_and(|p| {
                    p.selects_block()
                        || matches!(
                            p,
                            Step::Counted {
                                unit: Unit::Sentence,
                                ..
                            }
                        )
                });
                if !ok {
                    return Err(syntax(format!(
                        "{text} must follow a block or a sentence: words are counted in one of those"
                    )));
                }
            }
        }
        previous = Some(step);
    }
    Ok(())
}

// -- the card ----------------------------------------------------------------

#[derive(Debug, Clone)]
struct Heading {
    level: usize,
    text: String,
    slug: String,
    start: usize,
    end: usize,
}

#[derive(Debug, Clone)]
struct Anchor {
    id: String,
    start: usize,
    end: usize,
}

/// One card's text, read for resolving addresses into it.
#[derive(Debug, Clone)]
pub struct Card {
    text: String,
    chars: Vec<char>,
    /// Character offset where the body starts.
    body: usize,
    headings: Vec<Heading>,
    anchors: Vec<Anchor>,
}

/// Python-Markdown's `toc.slugify(value, "-")`.
pub(crate) fn slugify(value: &str) -> String {
    use unicode_normalization::UnicodeNormalization;
    let ascii: String = value.nfkd().filter(char::is_ascii).collect();
    let cleaned: String = ascii
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-' || is_py_ascii_space(*c))
        .collect();
    let trimmed = cleaned.trim_matches(is_py_ascii_space).to_lowercase();
    let mut out = String::new();
    let mut in_run = false;
    for c in trimmed.chars() {
        if c == '-' || is_py_ascii_space(c) {
            if !in_run {
                out.push('-');
            }
            in_run = true;
        } else {
            out.push(c);
            in_run = false;
        }
    }
    out
}

fn is_py_ascii_space(c: char) -> bool {
    matches!(
        c,
        ' ' | '\t' | '\n' | '\r' | '\x0b' | '\x0c' | '\x1c'..='\x1f'
    )
}

/// `toc.unique`: `_1`, `_2`, … appended in document order.
fn unique(id: String, used: &mut Vec<String>) -> String {
    let mut candidate = id;
    while used.contains(&candidate) || candidate.is_empty() {
        candidate = match candidate.rsplit_once('_') {
            Some((base, n)) if !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()) => {
                format!("{base}_{}", n.parse::<u64>().unwrap_or(0) + 1)
            }
            _ => format!("{candidate}_1"),
        };
    }
    used.push(candidate.clone());
    candidate
}

fn slice(chars: &[char], start: usize, end: usize) -> String {
    chars[start.min(chars.len())..end.min(chars.len())]
        .iter()
        .collect()
}

/// The `[ \t]+\^id[ \t]*` at the end of `line`, as (start, end) within it.
fn anchor_tail(line: &[char]) -> Option<(usize, usize, String)> {
    let mut end = line.len();
    while end > 0 && matches!(line[end - 1], ' ' | '\t') {
        end -= 1;
    }
    let mut id_start = end;
    while id_start > 0
        && (line[id_start - 1].is_ascii_alphanumeric() || matches!(line[id_start - 1], '_' | '-'))
    {
        id_start -= 1;
    }
    if id_start == end || end - id_start > 64 || !line[id_start].is_ascii_alphanumeric() {
        return None;
    }
    if id_start == 0 || line[id_start - 1] != '^' {
        return None;
    }
    let caret = id_start - 1;
    let mut space = caret;
    while space > 0 && matches!(line[space - 1], ' ' | '\t') {
        space -= 1;
    }
    if space == caret {
        return None;
    }
    Some((space, line.len(), line[id_start..end].iter().collect()))
}

/// `line` with a trailing anchor removed, as `re.sub(ANCHOR_TAIL, "")`.
fn without_anchor(line: &[char]) -> &[char] {
    match anchor_tail(line) {
        Some((start, _, _)) => &line[..start],
        None => line,
    }
}

/// Splits on `\n` only: (start, end) of each line, `\n` excluded.
fn raw_lines(chars: &[char], start: usize, end: usize) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    let mut cursor = start;
    while cursor < end {
        let stop = (cursor..end).find(|&i| chars[i] == '\n').unwrap_or(end);
        out.push((cursor, stop));
        if stop == end {
            break;
        }
        cursor = stop + 1;
    }
    out
}

impl Card {
    /// Reads the card at `path` for addressing. Newlines are translated first,
    /// as the canonical implementation reads a card in text mode.
    pub fn read(path: &str, source: &str) -> Card {
        let text = text::universal_newlines(source);
        let markdown = matches!(paths::card_suffix(path), Some(".md" | ".markdown"));
        let (raw, body_bytes) = frontmatter::split(&text);
        let mut body_bytes = body_bytes;
        if markdown && let Some(raw) = raw {
            let mapping = serde_yaml_ng::from_str::<serde_yaml_ng::Mapping>(raw);
            if !matches!(mapping, Ok(ref m) if !m.is_empty()) {
                body_bytes = 0;
            }
        }
        let chars: Vec<char> = text.chars().collect();
        let body = text[..body_bytes].chars().count();

        let mut masked: Vec<char> = chars[..body]
            .iter()
            .map(|&c| if c == '\n' || c == '\r' { c } else { ' ' })
            .collect();
        masked.extend(scan::mask(&chars[body..]));

        let mut headings = Vec::new();
        let mut used = Vec::new();
        let mut anchors = Vec::new();
        for (start, end) in raw_lines(&masked, 0, masked.len()) {
            let line = &masked[start..end];
            if let Some(level) = atx_with_text(line) {
                let original = &chars[start..end];
                let display = heading_display(original, level);
                let slug = unique(slugify(&display), &mut used);
                headings.push(Heading {
                    level,
                    text: display,
                    slug,
                    start,
                    end,
                });
            }
            if !markdown && let Some((a, b, id)) = anchor_tail(line) {
                anchors.push(Anchor {
                    id,
                    start: start + a,
                    end: start + b,
                });
            }
        }
        Card {
            text,
            chars,
            body,
            headings,
            anchors,
        }
    }

    /// Resolves `address` against this card.
    pub fn locate(&self, address: &Address, card_name: &str) -> Result<Located, AddressError> {
        let (start, end, mut warnings) = self.resolve(address, card_name)?;
        let selected = slice(&self.chars, start, end);
        if let Some(written) = &address.digest {
            let actual = digest_of(&selected);
            if &actual != written {
                warnings.push(Warning::Stale {
                    written: written.clone(),
                    actual,
                });
            }
        }
        Ok(Located {
            start: self.byte(start),
            end: self.byte(end),
            text: selected,
            warnings,
        })
    }

    fn byte(&self, char_offset: usize) -> usize {
        self.chars[..char_offset.min(self.chars.len())]
            .iter()
            .map(|c| c.len_utf8())
            .sum()
    }

    /// The card's text after newline translation, which offsets index.
    pub fn text(&self) -> &str {
        &self.text
    }
}

/// The level of an ATX heading `^[ \t]{0,3}#{1,6}[ \t]+...`, as the scanner
/// finds headings.
fn atx_with_text(line: &[char]) -> Option<usize> {
    let indent = line.iter().take_while(|c| matches!(c, ' ' | '\t')).count();
    if indent > 3 {
        return None;
    }
    let hashes = line[indent..].iter().take_while(|&&c| c == '#').count();
    if !(1..=6).contains(&hashes) {
        return None;
    }
    let after = indent + hashes;
    (after < line.len() && matches!(line[after], ' ' | '\t')).then_some(hashes)
}

fn heading_display(original: &[char], level: usize) -> String {
    let indent = original
        .iter()
        .take_while(|c| matches!(c, ' ' | '\t'))
        .count();
    let mut rest = &original[indent + level..];
    while let Some((&c, tail)) = rest.split_first() {
        if matches!(c, ' ' | '\t') {
            rest = tail;
        } else {
            break;
        }
    }
    let mut end = rest.len();
    while end > 0 && matches!(rest[end - 1], ' ' | '\t') {
        end -= 1;
    }
    let mut display = &rest[..end];
    // A closing run of hashes, preceded by whitespace.
    {
        let mut e = display.len();
        while e > 0 && matches!(display[e - 1], ' ' | '\t') {
            e -= 1;
        }
        let mut h = e;
        while h > 0 && display[h - 1] == '#' {
            h -= 1;
        }
        if h < e && h > 0 && matches!(display[h - 1], ' ' | '\t') {
            let mut s = h;
            while s > 0 && matches!(display[s - 1], ' ' | '\t') {
                s -= 1;
            }
            display = &display[..s];
        }
    }
    let display = without_anchor(display);
    let joined: String = display.iter().collect();
    text::strip(&joined).to_owned()
}

// -- blocks ------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Block {
    kind: Unit,
    start: usize,
    end: usize,
    body_start: usize,
    body_end: usize,
}

fn lines(chars: &[char], start: usize, end: usize) -> Vec<(usize, usize)> {
    raw_lines(chars, start, end)
        .into_iter()
        .map(|(s, e)| {
            if e > s && chars[e - 1] == '\r' {
                (s, e - 1)
            } else {
                (s, e)
            }
        })
        .collect()
}

fn is_blank(line: &[char]) -> bool {
    line.iter().all(|c| matches!(c, ' ' | '\t'))
}

fn spaces_upto3(line: &[char]) -> Option<usize> {
    let n = line.iter().take_while(|&&c| c == ' ').count();
    (n <= 3).then_some(n)
}

fn is_atx(line: &[char]) -> bool {
    let Some(i) = spaces_upto3(line) else {
        return false;
    };
    let hashes = line[i..].iter().take_while(|&&c| c == '#').count();
    (1..=6).contains(&hashes)
        && (i + hashes == line.len() || matches!(line[i + hashes], ' ' | '\t'))
}

fn is_break(line: &[char]) -> bool {
    let Some(i) = spaces_upto3(line) else {
        return false;
    };
    let rest = &line[i..];
    let Some(&mark) = rest.first() else {
        return false;
    };
    if !matches!(mark, '-' | '*' | '_') {
        return false;
    }
    rest.iter().all(|&c| c == mark || matches!(c, ' ' | '\t'))
        && rest.iter().filter(|&&c| c == mark).count() >= 3
}

fn starts(line: &[char], prefix: &str) -> bool {
    let p: Vec<char> = prefix.chars().collect();
    line.len() >= p.len() && line[..p.len()] == p[..]
}

fn is_quote(line: &[char]) -> bool {
    spaces_upto3(line).is_some_and(|i| line.get(i) == Some(&'>'))
}

fn is_callout_quote(line: &[char]) -> bool {
    let Some(i) = spaces_upto3(line) else {
        return false;
    };
    if line.get(i) != Some(&'>') {
        return false;
    }
    let mut j = i + 1;
    while j < line.len() && matches!(line[j], ' ' | '\t') {
        j += 1;
    }
    if !(line.get(j) == Some(&'[') && line.get(j + 1) == Some(&'!')) {
        return false;
    }
    let k = j + 2;
    let n = line[k..]
        .iter()
        .take_while(|c| !matches!(c, ']' | ' ' | '\t'))
        .count();
    n > 0 && line.get(k + n) == Some(&']')
}

fn is_admonition(line: &[char]) -> bool {
    let after = if starts(line, "!!!") {
        3
    } else if starts(line, "???+") {
        4
    } else if starts(line, "???") {
        3
    } else {
        return false;
    };
    matches!(line.get(after), Some(' ' | '\t'))
}

fn is_math(line: &[char]) -> bool {
    spaces_upto3(line).is_some_and(|i| starts(&line[i..], "$$"))
}

fn is_html(line: &[char]) -> bool {
    spaces_upto3(line).is_some_and(|i| {
        line.get(i) == Some(&'<')
            && line
                .get(i + 1)
                .is_some_and(|c| c.is_ascii_alphabetic() || matches!(c, '/' | '!' | '?'))
    })
}

/// (marker end, marker) for a bullet `^ {0,3}[-*+](?:[ \t]|$)`.
fn bullet(line: &[char]) -> Option<(usize, char)> {
    let i = spaces_upto3(line)?;
    let c = *line.get(i)?;
    if !matches!(c, '-' | '*' | '+') {
        return None;
    }
    match line.get(i + 1) {
        None => Some((i + 1, c)),
        Some(' ' | '\t') => Some((i + 2, c)),
        _ => None,
    }
}

/// (marker end, number, delimiter) for `^ {0,3}[0-9]{1,9}[.)](?:[ \t]|$)`.
fn ordered(line: &[char]) -> Option<(usize, String, char)> {
    let i = spaces_upto3(line)?;
    let digits = line[i..].iter().take_while(|c| c.is_ascii_digit()).count();
    if !(1..=9).contains(&digits) {
        return None;
    }
    let d = *line.get(i + digits)?;
    if !matches!(d, '.' | ')') {
        return None;
    }
    let number: String = line[i..i + digits].iter().collect();
    match line.get(i + digits + 1) {
        None => Some((i + digits + 1, number, d)),
        Some(' ' | '\t') => Some((i + digits + 2, number, d)),
        _ => None,
    }
}

fn list_type(line: &[char]) -> Option<(bool, char)> {
    if let Some((_, marker)) = bullet(line)
        && !is_break(line)
    {
        return Some((true, marker));
    }
    ordered(line).map(|(_, _, delim)| (false, delim))
}

fn interrupts(line: &[char], fence: bool) -> bool {
    if fence
        || is_atx(line)
        || is_break(line)
        || is_quote(line)
        || is_math(line)
        || is_admonition(line)
    {
        return true;
    }
    if let Some((end, _)) = bullet(line)
        && !is_blank(&line[end..])
    {
        return true;
    }
    matches!(ordered(line), Some((end, ref n, _)) if n == "1" && !is_blank(&line[end..]))
}

fn is_delimiter_row(line: &[char]) -> bool {
    let Some(i) = spaces_upto3(line) else {
        return false;
    };
    let mut rest: &[char] = &line[i..];
    if rest.first() == Some(&'|') {
        rest = &rest[1..];
    }
    let mut cells: Vec<&[char]> = rest.split(|&c| c == '|').collect();
    if cells.len() > 1 && cells.last().is_some_and(|c| is_blank(c)) {
        cells.pop();
    }
    !cells.is_empty()
        && cells.iter().all(|cell| {
            let t: Vec<char> = cell
                .iter()
                .copied()
                .skip_while(|c| matches!(c, ' ' | '\t'))
                .collect();
            let mut t: &[char] = &t;
            while let Some((&last, head)) = t.split_last() {
                if matches!(last, ' ' | '\t') {
                    t = head;
                } else {
                    break;
                }
            }
            let t = t.strip_prefix(&[':']).unwrap_or(t);
            let t = t.strip_suffix(&[':']).unwrap_or(t);
            !t.is_empty() && t.iter().all(|&c| c == '-')
        })
}

fn is_embed_line(line: &[char]) -> bool {
    let t: Vec<char> = line
        .iter()
        .copied()
        .skip_while(|c| matches!(c, ' ' | '\t'))
        .collect();
    let mut t: &[char] = &t;
    while let Some((&last, head)) = t.split_last() {
        if matches!(last, ' ' | '\t') {
            t = head;
        } else {
            break;
        }
    }
    starts(t, "![[")
        && t.len() >= 5
        && t.ends_with(&[']', ']'])
        && t[3..t.len() - 2]
            .iter()
            .all(|c| !matches!(c, '[' | ']' | '\n'))
}

fn fence_info_word(line: &[char]) -> String {
    let s: String = line.iter().collect();
    let rest = s.trim_start_matches([' ', '\t']);
    let mark = rest.chars().next().unwrap_or('`');
    let info = rest.trim_start_matches(mark).trim_matches([' ', '\t']);
    info.split([' ', '\t']).next().unwrap_or("").to_owned()
}

fn is_fence_line(line: &[char]) -> bool {
    let s: String = line.iter().collect();
    let rest = s.trim_start_matches([' ', '\t']);
    let Some(mark) = rest.chars().next().filter(|c| matches!(c, '`' | '~')) else {
        return false;
    };
    rest.chars().take_while(|&c| c == mark).count() >= 3
}

impl Card {
    fn fence_starts(&self) -> std::collections::HashMap<usize, usize> {
        let mut blanked: Vec<char> = self.chars[..self.body]
            .iter()
            .map(|&c| if c == '\n' || c == '\r' { c } else { ' ' })
            .collect();
        blanked.extend_from_slice(&self.chars[self.body..]);
        scan::fenced_regions(&blanked).into_iter().collect()
    }

    fn segment(&self, start: usize, end: usize) -> Vec<Block> {
        let chars = &self.chars;
        let fences = self.fence_starts();
        let all = lines(chars, start, end);
        let n = all.len();
        let text = |k: usize| &chars[all[k].0..all[k].1];
        let mut blocks = Vec::new();
        let mut i = 0;
        let through = |from: usize, offset: usize| -> usize {
            let mut k = from;
            while k < n && all[k].0 < offset {
                k += 1;
            }
            k
        };
        let emit = |blocks: &mut Vec<Block>,
                    kind: Unit,
                    first: usize,
                    last: usize,
                    body: Option<(usize, usize)>| {
            let (s, e) = (all[first].0, all[last].1);
            let (bs, be) = body.unwrap_or((s, e));
            blocks.push(Block {
                kind,
                start: s,
                end: e,
                body_start: bs,
                body_end: be,
            });
        };

        while i < n {
            let content = text(i);
            if is_blank(content) || is_atx(content) || is_break(content) {
                i += 1;
                continue;
            }

            if let Some(&fence_end) = fences.get(&all[i].0) {
                let j = through(i, fence_end.min(end));
                let last = j - 1;
                let kind = if matches!(
                    fence_info_word(content).as_str(),
                    "d2#show" | "mermaid#show"
                ) {
                    Unit::Diagram
                } else {
                    Unit::Code
                };
                let closes = last > i && is_fence_line(text(last));
                let body_last = if closes { last - 1 } else { last };
                let body = if body_last > i {
                    (all[i + 1].0, all[body_last].1)
                } else {
                    (all[i].1, all[i].1)
                };
                emit(&mut blocks, kind, i, last, Some(body));
                i = j;
                continue;
            }

            if is_math(content) {
                let lead = content.iter().take_while(|&&c| c == ' ').count();
                let rest: String = content[lead + 2..].iter().collect();
                if rest.contains("$$") {
                    emit(&mut blocks, Unit::Math, i, i, None);
                    i += 1;
                    continue;
                }
                let mut j = i + 1;
                while j < n && !text(j).iter().collect::<String>().contains("$$") {
                    j += 1;
                }
                let closed = j < n;
                let last = if closed { j } else { n - 1 };
                let body_last = if closed { last - 1 } else { last };
                let body = if body_last > i {
                    (all[i + 1].0, all[body_last].1)
                } else {
                    (all[i].1, all[i].1)
                };
                emit(&mut blocks, Unit::Math, i, last, Some(body));
                i = last + 1;
                continue;
            }

            if is_admonition(content) {
                let mut j = i + 1;
                let mut last = i;
                while j < n {
                    let following = text(j);
                    if is_blank(following) {
                        j += 1;
                        continue;
                    }
                    if starts(following, "    ") || starts(following, "\t") {
                        last = j;
                        j += 1;
                        continue;
                    }
                    break;
                }
                emit(&mut blocks, Unit::Callout, i, last, None);
                i = last + 1;
                continue;
            }

            if is_quote(content) {
                let kind = if is_callout_quote(content) {
                    Unit::Callout
                } else {
                    Unit::Blockquote
                };
                let mut j = i + 1;
                while j < n && !is_blank(text(j)) {
                    j += 1;
                }
                emit(&mut blocks, kind, i, j - 1, None);
                i = j;
                continue;
            }

            if let Some(kind_of_list) = list_type(content) {
                let mut j = i + 1;
                let mut last = i;
                while j < n {
                    if let Some(&inner) = fences.get(&all[j].0) {
                        let k = through(i, inner.min(end));
                        if !(starts(text(j), " ") || starts(text(j), "\t")) {
                            break;
                        }
                        last = k - 1;
                        j = k;
                        continue;
                    }
                    let following = text(j);
                    if is_blank(following) {
                        j += 1;
                        continue;
                    }
                    let gap = last + 1 < j;
                    if let Some(marker) = list_type(following) {
                        if marker != kind_of_list {
                            break;
                        }
                        last = j;
                        j += 1;
                        continue;
                    }
                    if starts(following, "  ") || starts(following, "\t") {
                        last = j;
                        j += 1;
                        continue;
                    }
                    if gap || interrupts(following, false) {
                        break;
                    }
                    last = j;
                    j += 1;
                }
                emit(&mut blocks, Unit::List, i, last, None);
                i = last + 1;
                continue;
            }

            if is_html(content) {
                let mut j = i + 1;
                while j < n && !is_blank(text(j)) {
                    j += 1;
                }
                emit(&mut blocks, Unit::Html, i, j - 1, None);
                i = j;
                continue;
            }

            if content.contains(&'|') && i + 1 < n && is_delimiter_row(text(i + 1)) {
                let mut j = i + 2;
                while j < n && !is_blank(text(j)) {
                    j += 1;
                }
                emit(&mut blocks, Unit::Table, i, j - 1, None);
                i = j;
                continue;
            }

            let mut j = i + 1;
            while j < n {
                if is_blank(text(j)) || interrupts(text(j), fences.contains_key(&all[j].0)) {
                    break;
                }
                j += 1;
            }
            let kind = if j == i + 1 && is_embed_line(without_anchor(content)) {
                Unit::Embed
            } else {
                Unit::Para
            };
            emit(&mut blocks, kind, i, j - 1, None);
            i = j;
        }
        blocks
    }

    /// The words of a prose block, structure and anchors left out.
    fn words(&self, block: &Block) -> Vec<(usize, usize)> {
        let chars = &self.chars;
        let mut out = Vec::new();
        for (ls, le) in lines(chars, block.start, block.end) {
            let raw = &chars[ls..le];
            let mut offset = 0;
            if matches!(block.kind, Unit::Blockquote | Unit::Callout) {
                offset = admonition_prefix(raw, offset);
                offset = quote_prefix(raw, offset);
                offset = callout_prefix(raw, offset);
            }
            if matches!(block.kind, Unit::List | Unit::Blockquote | Unit::Callout) {
                offset = list_prefix(raw, offset);
            }
            let mut cursor = ls + offset;
            while cursor < le {
                while cursor < le && is_white(chars[cursor]) {
                    cursor += 1;
                }
                if cursor >= le {
                    break;
                }
                let begin = cursor;
                while cursor < le && !is_white(chars[cursor]) {
                    cursor += 1;
                }
                if !self
                    .anchors
                    .iter()
                    .any(|a| a.start <= begin && begin < a.end)
                {
                    out.push((begin, cursor));
                }
            }
        }
        out
    }

    fn sentences(&self, words: &[(usize, usize)]) -> Vec<Vec<(usize, usize)>> {
        let mut out = Vec::new();
        let mut current = Vec::new();
        for &word in words {
            current.push(word);
            if matches!(self.chars[word.1 - 1], '.' | '!' | '?') {
                out.push(std::mem::take(&mut current));
            }
        }
        if !current.is_empty() {
            out.push(current);
        }
        out
    }
}

/// CommonMark's Unicode whitespace: Zs plus tab, LF, FF, CR.
fn is_white(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\x0c' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200a}' | '\u{202f}' | '\u{205f}' | '\u{3000}'
    )
}

fn skip_ws(raw: &[char], mut i: usize) -> usize {
    while i < raw.len() && matches!(raw[i], ' ' | '\t') {
        i += 1;
    }
    i
}

/// `(?:!!!|\?\?\?\+?)[ \t]+[^ \t]+` at `offset`.
fn admonition_prefix(raw: &[char], offset: usize) -> usize {
    let rest = &raw[offset..];
    let after = if starts(rest, "!!!") {
        3
    } else if starts(rest, "???+") {
        4
    } else if starts(rest, "???") {
        3
    } else {
        return offset;
    };
    let ws = skip_ws(rest, after);
    if ws == after {
        return offset;
    }
    let word = rest[ws..]
        .iter()
        .take_while(|c| !matches!(c, ' ' | '\t'))
        .count();
    if word == 0 {
        offset
    } else {
        offset + ws + word
    }
}

/// `[ \t]*(?:>[ \t]?)+` at `offset`.
fn quote_prefix(raw: &[char], offset: usize) -> usize {
    let mut i = skip_ws(raw, offset);
    if raw.get(i) != Some(&'>') {
        return offset;
    }
    while raw.get(i) == Some(&'>') {
        i += 1;
        if matches!(raw.get(i), Some(' ' | '\t')) {
            i += 1;
        }
    }
    i
}

/// `[ \t]*\[![^\] \t]+\][+-]?` at `offset`.
fn callout_prefix(raw: &[char], offset: usize) -> usize {
    let i = skip_ws(raw, offset);
    if !(raw.get(i) == Some(&'[') && raw.get(i + 1) == Some(&'!')) {
        return offset;
    }
    let k = i + 2;
    let n = raw[k..]
        .iter()
        .take_while(|c| !matches!(c, ']' | ' ' | '\t'))
        .count();
    if n == 0 || raw.get(k + n) != Some(&']') {
        return offset;
    }
    let mut end = k + n + 1;
    if matches!(raw.get(end), Some('+' | '-')) {
        end += 1;
    }
    end
}

/// `[ \t]*(?:[-*+]|[0-9]{1,9}[.)])(?=[ \t]|$)` at `offset`.
fn list_prefix(raw: &[char], offset: usize) -> usize {
    let i = skip_ws(raw, offset);
    let end = match raw.get(i) {
        Some('-' | '*' | '+') => i + 1,
        Some(c) if c.is_ascii_digit() => {
            let digits = raw[i..].iter().take_while(|c| c.is_ascii_digit()).count();
            if digits > 9 || !matches!(raw.get(i + digits), Some('.' | ')')) {
                return offset;
            }
            i + digits + 1
        }
        _ => return offset,
    };
    if end == raw.len() || matches!(raw[end], ' ' | '\t') {
        end
    } else {
        offset
    }
}

// -- resolution --------------------------------------------------------------

#[derive(Clone)]
enum ScopeKind {
    Card,
    Section(usize),
    Block(Block),
    Sentence(Vec<(usize, usize)>),
}

struct Scope {
    kind: ScopeKind,
    start: usize,
    end: usize,
    label: String,
}

fn pick<T: Clone>(
    units: &[T],
    first: usize,
    last: usize,
    text: &str,
    label: &str,
    noun: &str,
) -> Result<(T, T), AddressError> {
    let count = units.len();
    if last > count {
        let have = match count {
            0 => format!("no {noun}"),
            1 => format!("1 {}", &noun[..noun.len() - 1]),
            n => format!("{n} {noun}"),
        };
        return Err(AddressError::Nothing(format!(
            "{label} has {have}; {text} is past the end"
        )));
    }
    Ok((units[first - 1].clone(), units[last - 1].clone()))
}

fn article(kind: Unit) -> String {
    match kind {
        Unit::Table => "a table".to_owned(),
        Unit::Code => "a code block".to_owned(),
        Unit::Math => "a math block".to_owned(),
        Unit::Diagram => "a diagram".to_owned(),
        Unit::Embed => "an embed".to_owned(),
        Unit::Html => "an HTML block".to_owned(),
        other => format!("a {}", other.name().to_lowercase()),
    }
}

impl Card {
    fn resolve(
        &self,
        address: &Address,
        card_name: &str,
    ) -> Result<(usize, usize, Vec<Warning>), AddressError> {
        let chars = &self.chars;
        let mut warnings = Vec::new();
        let mut scope = Scope {
            kind: ScopeKind::Card,
            start: self.body,
            end: chars.len(),
            label: card_name.to_owned(),
        };

        for (index, step) in address.steps.iter().enumerate() {
            match step {
                Step::Heading(written) => {
                    let Some((hi, start, end)) = self.heading(written, &scope, index == 0) else {
                        let place = if index > 0 {
                            format!(" in {}", scope.label)
                        } else {
                            String::new()
                        };
                        return Err(AddressError::NoHeading(format!(
                            "{card_name} has no heading '#{}'{place}",
                            slugify(written)
                        )));
                    };
                    let label = format!("'#{}'", self.headings[hi].slug);
                    scope = Scope {
                        kind: ScopeKind::Section(hi),
                        start,
                        end,
                        label,
                    };
                }
                Step::Anchor(id) => {
                    let Some((rs, re)) = self.anchor_region(id) else {
                        return Err(AddressError::NoBlock(format!(
                            "{card_name} has no block '^{id}'"
                        )));
                    };
                    if matches!(scope.kind, ScopeKind::Section(_))
                        && !(scope.start <= rs && rs < scope.end)
                    {
                        warnings.push(Warning::Moved(format!(
                            "block '^{id}' is not in {}; the address was written against an earlier version of {card_name}",
                            scope.label
                        )));
                    }
                    let segmented = self.segment(rs, re);
                    let block = if segmented.len() == 1 {
                        let one = segmented[0];
                        Block {
                            end: one.end.min(re),
                            body_end: one.body_end.min(re),
                            ..one
                        }
                    } else {
                        Block {
                            kind: Unit::Para,
                            start: rs,
                            end: re,
                            body_start: rs,
                            body_end: re,
                        }
                    };
                    scope = Scope {
                        kind: ScopeKind::Block(block),
                        start: rs,
                        end: re,
                        label: format!("'^{id}'"),
                    };
                }
                Step::Counted {
                    text,
                    unit,
                    first,
                    last,
                    range,
                } => {
                    if unit.is_block() {
                        let candidates: Vec<Block> = self
                            .segment(scope.start, scope.end)
                            .into_iter()
                            .filter(|b| *unit == Unit::Block || b.kind == *unit)
                            .collect();
                        let (a, z) = pick(
                            &candidates,
                            *first,
                            *last,
                            text,
                            &scope.label,
                            unit.plural(),
                        )?;
                        if *range {
                            return Ok((a.start, z.end, warnings));
                        }
                        let block = self.strip_anchor(a);
                        let label = format!("{text} of {}", scope.label);
                        scope = Scope {
                            kind: ScopeKind::Block(block),
                            start: block.start,
                            end: block.end,
                            label,
                        };
                        continue;
                    }
                    if *unit == Unit::Line {
                        let (units, label) = match &scope.kind {
                            ScopeKind::Card => (lines(chars, 0, chars.len()), card_name.to_owned()),
                            ScopeKind::Block(b) => (
                                if b.body_end > b.body_start {
                                    lines(chars, b.body_start, b.body_end)
                                } else {
                                    Vec::new()
                                },
                                scope.label.clone(),
                            ),
                            _ => (Vec::new(), scope.label.clone()),
                        };
                        let (a, z) = pick(&units, *first, *last, text, &label, "lines")?;
                        return Ok((a.0, z.1, warnings));
                    }
                    let words = match &scope.kind {
                        ScopeKind::Block(b) => {
                            if !b.kind.is_prose() {
                                return Err(AddressError::Nothing(format!(
                                    "{} is {}, which has no {}; address its lines",
                                    scope.label,
                                    article(b.kind),
                                    unit.plural()
                                )));
                            }
                            self.words(b)
                        }
                        ScopeKind::Sentence(w) => w.clone(),
                        _ => Vec::new(),
                    };
                    if *unit == Unit::Sentence {
                        let groups = self.sentences(&words);
                        let (a, z) = pick(&groups, *first, *last, text, &scope.label, "sentences")?;
                        if *range {
                            return Ok((a[0].0, z[z.len() - 1].1, warnings));
                        }
                        let label = format!("{text} of {}", scope.label);
                        scope = Scope {
                            kind: ScopeKind::Sentence(a.clone()),
                            start: a[0].0,
                            end: a[a.len() - 1].1,
                            label,
                        };
                        continue;
                    }
                    let (a, z) = pick(&words, *first, *last, text, &scope.label, "words")?;
                    return Ok((a.0, z.1, warnings));
                }
            }
        }
        Ok((scope.start, scope.end, warnings))
    }

    fn heading(&self, written: &str, scope: &Scope, first: bool) -> Option<(usize, usize, usize)> {
        let wanted = slugify(written);
        for (index, heading) in self.headings.iter().enumerate() {
            if first {
                if heading.slug != wanted {
                    continue;
                }
            } else {
                if let ScopeKind::Section(hi) = scope.kind
                    && index <= hi
                {
                    continue;
                }
                if !(scope.start <= heading.start && heading.start < scope.end)
                    || slugify(&heading.text) != wanted
                {
                    continue;
                }
            }
            let mut end = self.chars.len();
            for following in &self.headings[index + 1..] {
                if following.level <= heading.level {
                    end = following.start;
                    break;
                }
            }
            if !first {
                end = end.min(scope.end);
            }
            let _ = heading.end;
            return Some((index, heading.start, end));
        }
        None
    }

    fn anchor_region(&self, id: &str) -> Option<(usize, usize)> {
        let chars = &self.chars;
        let anchor = self.anchors.iter().find(|a| a.id == id)?;
        let mut start = chars[..anchor.start]
            .iter()
            .rposition(|&c| c == '\n')
            .map_or(0, |p| p + 1);
        while start > self.body {
            let previous_end = start - 1;
            let previous_start = chars[..previous_end]
                .iter()
                .rposition(|&c| c == '\n')
                .map_or(0, |p| p + 1);
            if previous_start < self.body
                || chars[previous_start..previous_end]
                    .iter()
                    .all(|c| matches!(c, ' ' | '\t' | '\r'))
            {
                break;
            }
            start = previous_start;
        }
        Some((start, anchor.start))
    }

    fn strip_anchor(&self, block: Block) -> Block {
        for anchor in &self.anchors {
            if block.start <= anchor.start && anchor.start < block.end && anchor.end >= block.end {
                let end = anchor.start;
                return Block {
                    end,
                    body_end: block.body_end.min(end),
                    ..block
                };
            }
        }
        block
    }
}

/// Resolves the fragment written after `#` against the card at `path` whose
/// text is `source`. `card_name` names the card in failure messages.
pub fn locate(path: &str, source: &str, fragment: &str) -> Result<Located, AddressError> {
    let address = Address::parse(fragment)?;
    Card::read(path, source).locate(&address, path)
}

/// SHA-256 of `text` as UTF-8, first sixteen lowercase hex digits.
pub fn digest_of(text: &str) -> String {
    sha256(text.as_bytes())
        .iter()
        .take(8)
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn sha256(data: &[u8]) -> [u8; 32] {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];
    let mut message = data.to_vec();
    let bits = (data.len() as u64).wrapping_mul(8);
    message.push(0x80);
    while message.len() % 64 != 56 {
        message.push(0);
    }
    message.extend_from_slice(&bits.to_be_bytes());
    for chunk in message.chunks(64) {
        let mut w = [0u32; 64];
        for (i, word) in chunk.chunks(4).enumerate() {
            w[i] = u32::from_be_bytes([word[0], word[1], word[2], word[3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }
        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh] = h;
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ (!e & g);
            let t1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let t2 = s0.wrapping_add(maj);
            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(t1);
            d = c;
            c = b;
            b = a;
            a = t1.wrapping_add(t2);
        }
        for (slot, value) in h.iter_mut().zip([a, b, c, d, e, f, g, hh]) {
            *slot = slot.wrapping_add(value);
        }
    }
    let mut out = [0u8; 32];
    for (i, word) in h.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&word.to_be_bytes());
    }
    out
}

/// Whether `slug` is shadowed by a short-form step (HMD022).
pub fn is_shadowed_slug(slug: &str) -> bool {
    let mut chars = slug.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !SHORT_LETTERS.contains(first) {
        return false;
    }
    let rest: String = chars.collect();
    let (a, b) = match rest.split_once('-') {
        Some((a, b)) => (a, Some(b)),
        None => (rest.as_str(), None),
    };
    let digits = |s: &str| !s.is_empty() && s.bytes().all(|c| c.is_ascii_digit());
    digits(a)
        && b.is_none_or(|b| {
            let letters = b.bytes().take_while(u8::is_ascii_lowercase).count();
            letters > 0 && digits(&b[letters..])
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_matches_known_vectors() {
        assert_eq!(digest_of(""), "e3b0c44298fc1c14");
        assert_eq!(digest_of("abc"), "ba7816bf8f01cfea");
    }

    #[test]
    fn slugify_matches_python_markdown() {
        assert_eq!(slugify("The limit"), "the-limit");
        assert_eq!(slugify("Über uns"), "uber-uns");
        assert_eq!(slugify("  A -- B  "), "a-b");
        assert_eq!(slugify("C++ & Rust!"), "c-rust");
    }

    #[test]
    fn parses_and_refuses_like_the_canonical_parser() {
        let address =
            Address::parse("the-limit/^limit/Sentence2/Word5-Word9@sha256-0123456789abcdef")
                .unwrap();
        assert_eq!(address.steps.len(), 4);
        assert_eq!(address.digest.as_deref(), Some("0123456789abcdef"));
        for bad in [
            "Para3-Para5/Word1",
            "w1-Word2",
            "Para0",
            "Para01",
            "a//b",
            "a/Line3",
            "Sentence1",
            "Para1/Para2",
        ] {
            assert_eq!(Address::parse(bad).unwrap_err().rule(), "HMD019", "{bad}");
        }
        assert!(matches!(
            Address::parse("x1").unwrap().steps[0],
            Step::Heading(_)
        ));
    }

    #[test]
    fn resolves_spans() {
        let card = "# T\n\n## The limit\n\nA token has a limit. It expires after one hour! ^limit\n\n| a | b |\n| - | - |\n| 1 | 2 |\n";
        let at = |f: &str| locate("t.hmd", card, f).map(|l| l.text);
        assert_eq!(
            at("^limit/Sentence2").unwrap(),
            "It expires after one hour!"
        );
        assert_eq!(at("the-limit/Table1/Line3").unwrap(), "| 1 | 2 |");
        assert_eq!(at("the-limit/Para9").unwrap_err().rule(), "HMD020");
        assert_eq!(at("nope/Para1").unwrap_err().rule(), "HMD004");
    }

    #[test]
    fn shadowed_slugs() {
        assert!(is_shadowed_slug("p3"));
        assert!(is_shadowed_slug("w1-w2"));
        assert!(!is_shadowed_slug("x1"));
        assert!(!is_shadowed_slug("p"));
    }
}
