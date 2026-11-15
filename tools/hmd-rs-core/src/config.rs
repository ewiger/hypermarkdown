//! Project configuration and vault discovery.
//!
//! A directory is the root of a vault when it holds a `.hmd` directory. The
//! `config.toml` inside that directory carries three settings: where the
//! namespace root is, whether a reference the nearer rules missed falls back to
//! a sweep of the namespace, and how far that sweep reaches.

use std::path::{Path, PathBuf};

use crate::error::Error;

/// The name of the directory that marks a vault's root.
pub const MARKER_DIR: &str = ".hmd";

/// The name of the configuration file inside the marker directory.
pub const CONFIG_NAME: &str = "config.toml";

/// The namespace root when `wiki` is not set, relative to the vault's root.
pub const DEFAULT_WIKI: &str = "doc/wiki";

/// How far the autodiscovery sweep reaches.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum Mode {
    /// The sweep covers the whole namespace; written `"both"`.
    #[default]
    Both,
    /// The sweep covers only the directory of the card holding the reference
    /// and everything beneath it; written `"recursive"`.
    Recursive,
}

/// The settings a vault is loaded with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Config {
    /// The namespace root, relative to the vault's root; the `wiki` key.
    pub wiki: String,
    /// Whether a bare reference that no nearer rule resolves is looked up
    /// across the namespace; the `autodiscovery` key of `[discovery]`.
    pub autodiscovery: bool,
    /// How far that lookup reaches; the `mode` key of `[discovery]`.
    pub mode: Mode,
}

impl Default for Config {
    /// The settings of a vault with no `config.toml`: the namespace root is
    /// `doc/wiki`, autodiscovery is on, and the sweep covers the namespace.
    fn default() -> Self {
        Config {
            wiki: DEFAULT_WIKI.to_owned(),
            autodiscovery: true,
            mode: Mode::Both,
        }
    }
}

impl Config {
    /// Parses the text of a `.hmd/config.toml`, taking the default for every
    /// setting the text does not state and ignoring every other key.
    pub fn parse(text: &str) -> Result<Config, Error> {
        let data: toml::Table = text
            .parse()
            .map_err(|err| Error::config(format!("cannot read {CONFIG_NAME}: {err}")))?;

        let wiki = match data.get("wiki") {
            None => DEFAULT_WIKI.to_owned(),
            Some(toml::Value::String(wiki)) => wiki.clone(),
            Some(_) => return Err(Error::config("`wiki` must be a string")),
        };

        // A `discovery` key that is not a table is read as an empty one.
        let discovery = data.get("discovery").and_then(toml::Value::as_table);

        let autodiscovery = match discovery.and_then(|table| table.get("autodiscovery")) {
            None => true,
            Some(toml::Value::Boolean(value)) => *value,
            Some(_) => {
                return Err(Error::config("[discovery] autodiscovery must be a boolean"));
            }
        };

        let mode = match discovery.and_then(|table| table.get("mode")) {
            None => Mode::Both,
            Some(toml::Value::String(value)) if value == "both" => Mode::Both,
            Some(toml::Value::String(value)) if value == "recursive" => Mode::Recursive,
            Some(toml::Value::String(value)) => {
                return Err(Error::config(format!(
                    "[discovery] mode must be one of \"both\", \"recursive\", got {value:?}"
                )));
            }
            Some(_) => {
                return Err(Error::config(
                    "[discovery] mode must be one of \"both\", \"recursive\"",
                ));
            }
        };

        Ok(Config {
            wiki,
            autodiscovery,
            mode,
        })
    }

    /// Reads the configuration of the vault rooted at `vault_root`, which is
    /// the default when the vault has no `config.toml`.
    pub fn read(vault_root: &Path) -> Result<Config, Error> {
        let path = vault_root.join(MARKER_DIR).join(CONFIG_NAME);
        if !path.is_file() {
            return Ok(Config::default());
        }
        let text = std::fs::read_to_string(&path)
            .map_err(|err| Error::io(path.display().to_string(), err))?;
        Config::parse(&text)
    }

    /// The directory the `wiki` setting names for the vault rooted at
    /// `vault_root`.
    pub fn namespace_root(&self, vault_root: &Path) -> PathBuf {
        vault_root.join(&self.wiki)
    }
}

/// Finds the root of the vault that `start` belongs to: the nearest directory
/// at or above `start` that holds a `.hmd` directory.
///
/// `start` may be a directory or a file; a relative `start` is taken from the
/// current directory. No symbolic link is resolved.
pub fn find_vault_root(start: &Path) -> Option<PathBuf> {
    let start = std::path::absolute(start).ok()?;
    let first = if start.is_dir() {
        start.as_path()
    } else {
        start.parent()?
    };
    first
        .ancestors()
        .find(|dir| dir.join(MARKER_DIR).is_dir())
        .map(Path::to_path_buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_empty_file_is_the_defaults() {
        assert_eq!(Config::parse("").unwrap(), Config::default());
        assert_eq!(Config::default().wiki, "doc/wiki");
        assert!(Config::default().autodiscovery);
        assert_eq!(Config::default().mode, Mode::Both);
    }

    #[test]
    fn the_three_settings_are_read_and_other_keys_ignored() {
        let config = Config::parse(
            "wiki = \".\"\nextra = 1\n[namespace]\nname = \"x\"\n\
             [discovery]\nautodiscovery = false\nmode = \"recursive\"\n",
        )
        .unwrap();
        assert_eq!(config.wiki, ".");
        assert!(!config.autodiscovery);
        assert_eq!(config.mode, Mode::Recursive);
    }

    #[test]
    fn a_discovery_key_that_is_not_a_table_is_ignored() {
        assert_eq!(Config::parse("discovery = 3\n").unwrap(), Config::default());
    }

    #[test]
    fn a_setting_of_the_wrong_type_is_refused() {
        for text in [
            "wiki = 3\n",
            "[discovery]\nautodiscovery = \"yes\"\n",
            "[discovery]\nmode = \"spine\"\n",
            "[discovery]\nmode = 1\n",
            "wiki = \n",
        ] {
            assert!(
                matches!(Config::parse(text), Err(Error::Config { .. })),
                "{text:?} was accepted"
            );
        }
    }

    #[test]
    fn the_namespace_root_is_the_wiki_setting_under_the_vault_root() {
        let config = Config::default();
        assert_eq!(
            config.namespace_root(Path::new("/project")),
            Path::new("/project/doc/wiki")
        );
    }
}
