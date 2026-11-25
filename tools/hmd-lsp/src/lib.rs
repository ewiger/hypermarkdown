//! The HyperMarkDown language server.
//!
//! HyperMarkDown is Markdown whose cards refer to each other with
//! `[[references]]`. This server tells an editor what each reference in an
//! open card resolves to. It speaks the Language Server Protocol, and it
//! asks the `hypermarkdown` crate which card a reference names.
//!
//! The server answers four things about a card:
//!
//! - **Semantic tokens**: the page, the fragment and the display text of each
//!   reference, with a modifier on a reference that names no card, names
//!   several cards, or leaves the namespace.
//! - **Definition**: the card a reference names.
//! - **Hover**: the card a reference names and the rule that found it.
//! - **Diagnostics**: one for each reference that does not resolve to a card.
//!
//! The program is the binary `hmd-lsp`. This library holds everything the
//! binary does, so the tests can run a server in memory.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

pub mod features;
pub mod lines;
pub mod links;
pub mod server;
pub mod tokens;
pub mod uri;
pub mod workspace;
