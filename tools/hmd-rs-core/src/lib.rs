//! The HyperMarkdown resolver.
//!
//! HyperMarkdown is Markdown whose cards refer to each other with
//! `[[references]]`. This crate answers one question about a tree of cards:
//! which card a reference names. It finds the references in each card, reads
//! the frontmatter keys that steer resolution, and resolves a reference from
//! the card that holds it to one card, to none, or to an ambiguity.
//!
//! It is a resolver, not a linter and not a renderer: it reports no
//! diagnostics and produces no HTML.
//!
//! The canonical implementation of the format is the Python package in the
//! same repository. This crate is held to it by the repository's conformance
//! corpus, and where the two differ the Python package is right.
//!
//! # Example
//!
//! ```
//! use hypermarkdown::{Config, MemoryHost, Resolution, Vault, Via};
//!
//! # fn main() -> Result<(), hypermarkdown::Error> {
//! let host = MemoryHost::new([
//!     ("shared/tokens.hmd", "# Tokens\n"),
//!     ("specs/login.hmd", "see [[tokens#Rotation]]\n"),
//! ]);
//! let vault = Vault::load(&host, Config::default())?;
//!
//! // Every reference of every card, resolved from the card that holds it.
//! for page in vault.pages() {
//!     for link in &page.links {
//!         assert_eq!(
//!             vault.resolve(&page.path, &link.page),
//!             Resolution::Resolved {
//!                 path: "shared/tokens.hmd".to_owned(),
//!                 via: Via::Autodiscovery,
//!             }
//!         );
//!     }
//! }
//!
//! // A reference need not come from a card: any source path and any page
//! // reference resolve.
//! assert_eq!(
//!     vault.resolve("specs/login.hmd", "missing"),
//!     Resolution::Unresolved
//! );
//! # Ok(())
//! # }
//! ```

#![forbid(unsafe_code)]
#![warn(missing_docs)]

mod config;
mod error;
mod frontmatter;
mod host;
mod imports;
mod page;
mod paths;
mod scan;
mod text;
mod vault;

pub use config::{CONFIG_NAME, Config, DEFAULT_WIKI, MARKER_DIR, Mode, find_vault_root};
pub use error::Error;
pub use host::{Entry, EntryKind, FsHost, Host, MemoryHost};
pub use imports::{Binding, Import};
pub use page::{Fragment, Link, Page, Reference, ReferenceError};
pub use vault::{Resolution, Vault, Via};
