//! Semantic tokens: the colours of a card's references.
//!
//! The server marks the three parts of each reference: the page it names, the
//! fragment after `#`, and the display text after `|`. A modifier on every
//! part of a reference says what the reference resolves to, which is the one
//! thing a grammar in the editor cannot know.
//!
//! The token types are standard ones, so a theme colours them with no
//! configuration. The modifiers are this server's own, and a client that does
//! not know them ignores them.

use hypermarkdown::Resolution;
use lsp_types::{SemanticToken, SemanticTokenModifier, SemanticTokenType, SemanticTokensLegend};

use crate::lines::Lines;
use crate::links;
use crate::workspace::View;

/// The token type of a page reference.
pub const PAGE: u32 = 0;
/// The token type of a fragment.
pub const FRAGMENT: u32 = 1;
/// The token type of display text.
pub const DISPLAY: u32 = 2;

/// The token types, in the order their numbers name them.
pub const TYPES: [&str; 3] = ["class", "property", "string"];

/// The reference names no card.
pub const UNRESOLVED: u32 = 1 << 0;
/// The reference names more than one card.
pub const AMBIGUOUS: u32 = 1 << 1;
/// The reference's path leaves the namespace.
pub const OUTSIDE: u32 = 1 << 2;
/// The reference is an embed.
pub const EMBED: u32 = 1 << 3;

/// The token modifiers, in the order their bits name them.
pub const MODIFIERS: [&str; 4] = ["unresolved", "ambiguous", "outside", "embed"];

/// The legend a client reads the numbers of [`tokens`] with.
pub fn legend() -> SemanticTokensLegend {
    SemanticTokensLegend {
        token_types: TYPES.into_iter().map(SemanticTokenType::new).collect(),
        token_modifiers: MODIFIERS
            .into_iter()
            .map(SemanticTokenModifier::new)
            .collect(),
    }
}

/// The tokens of a document, in the protocol's relative encoding.
pub fn tokens(view: &View) -> Vec<SemanticToken> {
    let lines = Lines::new(view.text);
    let mut tokens = Vec::new();
    let mut last_line = 0;
    let mut last_start = 0;

    for link in &view.page.links {
        let line = link.line - 1;
        let column = link.column - 1;
        let mut modifiers = match view.resolve(link) {
            Some(Resolution::Unresolved) => UNRESOLVED,
            Some(Resolution::Ambiguous { .. }) => AMBIGUOUS,
            Some(Resolution::Escapes) => OUTSIDE,
            Some(Resolution::Resolved { .. }) | None => 0,
        };
        if link.embed {
            modifiers |= EMBED;
        }

        let parts = links::parts(link);
        let runs = [
            (Some(parts.page), PAGE),
            (parts.fragment, FRAGMENT),
            (parts.display, DISPLAY),
        ];
        for (run, token_type) in runs {
            let Some(run) = run else { continue };
            let start = lines.utf16(line, column + run.start);
            let end = lines.utf16(line, column + run.start + run.len);
            if end <= start {
                continue;
            }
            let line = line as u32;
            tokens.push(SemanticToken {
                delta_line: line - last_line,
                delta_start: if line == last_line {
                    start - last_start
                } else {
                    start
                },
                length: end - start,
                token_type,
                token_modifiers_bitset: modifiers,
            });
            last_line = line;
            last_start = start;
        }
    }
    tokens
}
