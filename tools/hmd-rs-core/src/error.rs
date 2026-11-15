//! The crate's error type.
//!
//! Loading a vault is the only fallible work here: a host can fail to list a
//! directory or read a card, and a `.hmd/config.toml` can be unusable. A
//! reference that names nothing is not an error but a
//! [`Resolution`](crate::Resolution).

use std::fmt;
use std::io;

/// What can go wrong while loading a vault.
#[derive(Debug)]
#[non_exhaustive]
pub enum Error {
    /// The host could not list a directory or read a file.
    Io {
        /// The path the host was asked for, relative to the host's root.
        path: String,
        /// The failure the host reported.
        source: io::Error,
    },
    /// A `.hmd/config.toml` is not valid TOML, holds a setting of the wrong
    /// type, or names a namespace root that is not a directory.
    Config {
        /// What is wrong with the configuration.
        message: String,
    },
}

impl Error {
    /// An [`Error::Io`] for `path`.
    pub(crate) fn io(path: impl Into<String>, source: io::Error) -> Self {
        Error::Io {
            path: path.into(),
            source,
        }
    }

    /// An [`Error::Config`] carrying `message`.
    pub(crate) fn config(message: impl Into<String>) -> Self {
        Error::Config {
            message: message.into(),
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Io { path, source } => {
                let shown = if path.is_empty() { "." } else { path };
                write!(f, "cannot read {shown}: {source}")
            }
            Error::Config { message } => f.write_str(message),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Error::Io { source, .. } => Some(source),
            Error::Config { .. } => None,
        }
    }
}
