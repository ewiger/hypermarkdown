//! The answers about one reference: where it leads, what it resolves to, and
//! whether it resolves at all.

use std::str::FromStr;

use hypermarkdown::{Link, Resolution, Via};
use lsp_types::{
    Diagnostic, DiagnosticSeverity, Hover, HoverContents, Location, MarkupContent, MarkupKind,
    NumberOrString, Position, Range, Uri,
};

use crate::lines::Lines;
use crate::links;
use crate::workspace::View;

/// The name diagnostics carry as their source.
const SOURCE: &str = "hmd";

/// The range `link` covers in its document.
fn range(lines: &Lines, link: &Link) -> Range {
    let line = link.line - 1;
    let column = link.column - 1;
    Range {
        start: Position {
            line: line as u32,
            character: lines.utf16(line, column),
        },
        end: Position {
            line: line as u32,
            character: lines.utf16(line, column + links::len(link)),
        },
    }
}

/// The reference under `position`, with the range it covers.
fn link_at<'a>(view: &'a View, position: Position) -> Option<(&'a Link, Range)> {
    let lines = Lines::new(view.text);
    let line = position.line as usize;
    let column = lines.code_points(line, position.character);
    let link = links::at(&view.page, line, column)?;
    Some((link, range(&lines, link)))
}

/// The start of a card: where a reference to the card leads.
fn top() -> Range {
    Range::default()
}

/// Where the reference under `position` leads.
///
/// A reference that resolves leads to its card. An ambiguous reference leads
/// to every card it could name, so the editor offers the choice.
pub fn definition(view: &View, position: Position) -> Vec<Location> {
    let Some((link, _)) = link_at(view, position) else {
        return Vec::new();
    };
    let Some(home) = view.home else {
        return Vec::new();
    };
    let paths = match view.resolve(link) {
        Some(Resolution::Resolved { path, .. }) => vec![path],
        Some(Resolution::Ambiguous { candidates }) => candidates,
        _ => Vec::new(),
    };
    paths
        .iter()
        .filter_map(|path| {
            let uri = Uri::from_str(&home.uri_of(path)?).ok()?;
            Some(Location { uri, range: top() })
        })
        .collect()
}

/// What the reference under `position` resolves to, in words.
pub fn hover(view: &View, position: Position) -> Option<Hover> {
    let (link, range) = link_at(view, position)?;
    let value = match view.resolve(link)? {
        Resolution::Resolved { path, via } => {
            format!("`{path}`\n\nFound by {}.", rule(via))
        }
        Resolution::Unresolved => "No card has this name.".to_owned(),
        Resolution::Ambiguous { candidates } => {
            let mut text = format!(
                "{} cards have this name, and none is chosen:\n",
                candidates.len()
            );
            for candidate in candidates {
                text.push_str(&format!("\n- `{candidate}`"));
            }
            text
        }
        Resolution::Escapes => "This path leaves the namespace.".to_owned(),
    };
    Some(Hover {
        contents: HoverContents::Markup(MarkupContent {
            kind: MarkupKind::Markdown,
            value,
        }),
        range: Some(range),
    })
}

/// The rule that resolved a reference, as the end of "Found by …".
fn rule(via: Via) -> &'static str {
    match via {
        Via::Path => "the path in the reference",
        Via::NamedImport => "a named import of this card",
        Via::Spine => "the spine: a directory between this card and the namespace root",
        Via::SearchPath => "a directory this card imports with `*`",
        Via::Autodiscovery => "autodiscovery: it is the only card whose path ends with this name",
    }
}

/// One diagnostic for every reference of the document that does not resolve
/// to a card.
///
/// The codes, the severities and the messages are the canonical linter's for
/// the same three outcomes. The linter has other rules, and this server
/// reports none of them.
pub fn diagnostics(view: &View) -> Vec<Diagnostic> {
    let lines = Lines::new(view.text);
    view.page
        .links
        .iter()
        .filter_map(|link| {
            let raw = &link.raw;
            let (code, severity, message) = match view.resolve(link)? {
                Resolution::Resolved { .. } => return None,
                Resolution::Unresolved => (
                    "HMD001",
                    DiagnosticSeverity::WARNING,
                    format!("{raw} does not resolve to a page"),
                ),
                Resolution::Ambiguous { candidates } => (
                    "HMD002",
                    DiagnosticSeverity::ERROR,
                    format!(
                        "{raw} matches {} pages; qualify it (candidates: {})",
                        candidates.len(),
                        candidates.join(", ")
                    ),
                ),
                Resolution::Escapes => (
                    "HMD003",
                    DiagnosticSeverity::ERROR,
                    format!("{raw} resolves outside the namespace root"),
                ),
            };
            Some(Diagnostic {
                range: range(&lines, link),
                severity: Some(severity),
                code: Some(NumberOrString::String(code.to_owned())),
                source: Some(SOURCE.to_owned()),
                message,
                ..Diagnostic::default()
            })
        })
        .collect()
}
