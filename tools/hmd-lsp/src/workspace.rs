//! The documents a client has open, and the vaults they belong to.
//!
//! A client sends the text of every document it opens and every change to
//! it, so the text the server answers about is the text in the editor and
//! not the text on disk. A vault is loaded from disk with the open documents
//! placed in front of the files of the same paths.
//!
//! A vault is loaded when a request first needs it and kept until a document
//! or a file changes. Every change drops every loaded vault, and the next
//! request loads again from the start.

use std::borrow::Cow;
use std::collections::{BTreeMap, HashMap};
use std::io;
use std::path::{Path, PathBuf};

use hypermarkdown::{Entry, FsHost, Host, Link, Page, Resolution, Vault, find_vault_root};

use crate::uri;

/// The name a document is parsed under when it has no path.
const UNTITLED: &str = "untitled.hmd";

/// The files of a namespace root, with open documents in front of them.
#[derive(Debug)]
pub struct Overlay {
    disk: FsHost,
    /// Root-relative path to the text of the open document at that path.
    files: BTreeMap<String, String>,
}

impl Overlay {
    /// Places `files` in front of the files that `disk` reads.
    pub fn new(disk: FsHost, files: BTreeMap<String, String>) -> Self {
        Overlay { disk, files }
    }
}

impl Host for Overlay {
    fn list(&self, dir: &str) -> io::Result<Vec<Entry>> {
        let dir = dir.trim_matches('/');
        let prefix = if dir.is_empty() {
            String::new()
        } else {
            format!("{dir}/")
        };
        let under = |path: &String| path.starts_with(&prefix);
        let mut entries = match self.disk.list(dir) {
            Ok(entries) => entries,
            // A document saved nowhere yet may sit in a directory that does
            // not exist yet either.
            Err(err) if err.kind() == io::ErrorKind::NotFound && self.files.keys().any(under) => {
                Vec::new()
            }
            Err(err) => return Err(err),
        };
        for path in self.files.keys() {
            let Some(rest) = path.strip_prefix(&prefix) else {
                continue;
            };
            let (name, deeper) = match rest.split_once('/') {
                Some((name, _)) => (name, true),
                None => (rest, false),
            };
            if entries.iter().any(|entry| entry.name == name) {
                continue;
            }
            entries.push(if deeper {
                Entry::directory(name)
            } else {
                Entry::file(name)
            });
        }
        Ok(entries)
    }

    fn read(&self, path: &str) -> io::Result<String> {
        match self.files.get(path) {
            Some(text) => Ok(text.clone()),
            None => self.disk.read(path),
        }
    }
}

/// One open document.
#[derive(Debug)]
struct Document {
    text: String,
    /// The file the document's URI names, when it names one.
    path: Option<PathBuf>,
}

/// One loaded vault.
#[derive(Debug)]
struct Loaded {
    /// The namespace root: the directory card paths are relative to.
    root: PathBuf,
    vault: Vault,
}

/// A document as a request sees it: its text, its references, and the vault
/// that resolves them.
#[derive(Debug)]
pub struct View<'a> {
    /// The text of the document as the client last sent it.
    pub text: &'a str,
    /// The document parsed as a card.
    pub page: Cow<'a, Page>,
    /// The vault the document is a card of. `None` for a document outside
    /// every vault, outside its vault's namespace root, or in a vault that
    /// did not load.
    pub home: Option<Home<'a>>,
}

/// A document's place in a vault.
#[derive(Debug, Clone, Copy)]
pub struct Home<'a> {
    /// The vault.
    pub vault: &'a Vault,
    /// The namespace root on disk.
    pub root: &'a Path,
    /// The document's path relative to the namespace root.
    pub path: &'a str,
}

impl View<'_> {
    /// What `link` resolves to, or `None` when the document has no vault.
    pub fn resolve(&self, link: &Link) -> Option<Resolution> {
        let home = self.home.as_ref()?;
        Some(home.vault.resolve(home.path, &link.page))
    }
}

impl Home<'_> {
    /// The URI of the card at the root-relative `path`.
    pub fn uri_of(&self, path: &str) -> Option<String> {
        let mut full = self.root.to_path_buf();
        full.extend(path.split('/').filter(|part| !part.is_empty()));
        uri::from_path(&full, uri::WINDOWS)
    }
}

/// Every open document and every loaded vault.
#[derive(Debug, Default)]
pub struct Workspace {
    documents: HashMap<String, Document>,
    /// Vault root to the vault loaded from it, or `None` when it did not
    /// load.
    vaults: HashMap<PathBuf, Option<Loaded>>,
    /// URI to the document's vault root and root-relative path, for the
    /// documents that have both.
    places: HashMap<String, (PathBuf, String)>,
}

impl Workspace {
    /// A workspace with no document open.
    pub fn new() -> Self {
        Workspace::default()
    }

    /// Records the text of the document at `uri`, opened or changed.
    pub fn set(&mut self, uri: &str, text: String) {
        let path = uri::to_path(uri, uri::WINDOWS);
        self.documents
            .insert(uri.to_owned(), Document { text, path });
        self.invalidate();
    }

    /// Forgets the document at `uri`, which the client closed.
    pub fn close(&mut self, uri: &str) {
        self.documents.remove(uri);
        self.invalidate();
    }

    /// Drops every loaded vault, because a document or a file changed.
    pub fn invalidate(&mut self) {
        self.vaults.clear();
        self.places.clear();
    }

    /// The URIs of the open documents, sorted.
    pub fn uris(&self) -> Vec<String> {
        let mut uris: Vec<String> = self.documents.keys().cloned().collect();
        uris.sort();
        uris
    }

    /// The document at `uri` with its vault, loading the vault first when it
    /// is not loaded. `None` when no such document is open.
    pub fn view(&mut self, uri: &str) -> Option<View<'_>> {
        self.place(uri);
        let document = self.documents.get(uri)?;
        let home = self.places.get(uri).and_then(|(root, path)| {
            let loaded = self.vaults.get(root)?.as_ref()?;
            Some(Home {
                vault: &loaded.vault,
                root: &loaded.root,
                path,
            })
        });
        let page = match home.and_then(|home| home.vault.page(home.path)) {
            Some(page) => Cow::Borrowed(page),
            None => {
                let name = document
                    .path
                    .as_deref()
                    .and_then(Path::file_name)
                    .and_then(|name| name.to_str())
                    .unwrap_or(UNTITLED);
                Cow::Owned(Page::parse(name, &document.text))
            }
        };
        // A document that is not a card of the vault it lies in resolves
        // nothing: the vault skipped it, as it skips a hidden file.
        let home = home.filter(|home| home.vault.page(home.path).is_some());
        Some(View {
            text: &document.text,
            page,
            home,
        })
    }

    /// Finds the vault of the document at `uri` and loads it when it is not
    /// loaded.
    fn place(&mut self, uri: &str) {
        if self.places.contains_key(uri) {
            return;
        }
        let Some(path) = self.documents.get(uri).and_then(|doc| doc.path.clone()) else {
            return;
        };
        let Some(vault_root) = find_vault_root(&path) else {
            return;
        };
        if !self.vaults.contains_key(&vault_root) {
            let loaded = self.load(&vault_root);
            self.vaults.insert(vault_root.clone(), loaded);
        }
        let Some(Some(loaded)) = self.vaults.get(&vault_root) else {
            return;
        };
        if let Some(relative) = relative(&loaded.root, &path) {
            self.places.insert(uri.to_owned(), (vault_root, relative));
        }
    }

    /// Loads the vault rooted at `vault_root`, with the open documents in
    /// front of its files. `None` when its configuration or its namespace
    /// root cannot be read.
    fn load(&self, vault_root: &Path) -> Option<Loaded> {
        let mut root = None;
        let vault = Vault::open_with(vault_root, |disk| {
            let base = disk.root().to_path_buf();
            let files = self
                .documents
                .values()
                .filter_map(|doc| {
                    let relative = relative(&base, doc.path.as_deref()?)?;
                    Some((relative, doc.text.clone()))
                })
                .collect();
            // The default `location_path` is `.`, and joining it leaves a
            // `.` in the path. Collecting the components drops it, so the
            // URIs built from this root are the ones a client sends.
            root = Some(base.components().collect());
            Overlay::new(disk, files)
        })
        .ok()?;
        Some(Loaded { root: root?, vault })
    }
}

/// `path` relative to `base`, with `/` between its components. `None` when
/// `path` is not under `base` or is not valid Unicode.
fn relative(base: &Path, path: &Path) -> Option<String> {
    let rest = path.strip_prefix(base).ok()?;
    let parts: Option<Vec<&str>> = rest.iter().map(|part| part.to_str()).collect();
    let parts = parts?;
    (!parts.is_empty()).then(|| parts.join("/"))
}
