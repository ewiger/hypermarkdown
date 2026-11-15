//! The port a vault is read through.
//!
//! The resolver never touches a filesystem of its own. It lists directories and
//! reads cards through [`Host`], so the same code resolves a tree on disk
//! ([`FsHost`]), a set of documents held in memory ([`MemoryHost`]), or
//! whatever a consumer supplies.
//!
//! Every path a host is given is relative to the namespace root, with `/`
//! between components and the empty string for the root itself.

use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::PathBuf;

/// Whether a directory entry is a file or a directory.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EntryKind {
    /// A regular file.
    File,
    /// A directory.
    Directory,
}

/// One name in a directory listing.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Entry {
    /// The entry's own name, without its directory.
    pub name: String,
    /// Whether the entry is a file or a directory.
    pub kind: EntryKind,
}

impl Entry {
    /// An entry for a file called `name`.
    pub fn file(name: impl Into<String>) -> Self {
        Entry {
            name: name.into(),
            kind: EntryKind::File,
        }
    }

    /// An entry for a directory called `name`.
    pub fn directory(name: impl Into<String>) -> Self {
        Entry {
            name: name.into(),
            kind: EntryKind::Directory,
        }
    }
}

/// The source of a vault's directories and cards.
pub trait Host {
    /// Lists the entries of the directory at `dir`, in any order; `""` is the
    /// namespace root.
    ///
    /// Entries whose names start with `.` must be included, because a `.hmd`
    /// directory is what marks a nested vault.
    fn list(&self, dir: &str) -> io::Result<Vec<Entry>>;

    /// Reads the file at `path` as UTF-8 text.
    fn read(&self, path: &str) -> io::Result<String>;
}

impl<H: Host + ?Sized> Host for &H {
    fn list(&self, dir: &str) -> io::Result<Vec<Entry>> {
        (**self).list(dir)
    }

    fn read(&self, path: &str) -> io::Result<String> {
        (**self).read(path)
    }
}

/// A [`Host`] over a directory on disk, read with `std::fs`.
///
/// A symbolic link to a file is listed as a file. A symbolic link to a
/// directory is not listed, so a link cannot make the walk loop or carry it
/// out of the tree. An entry whose name is not UTF-8 is not listed.
#[derive(Debug, Clone)]
pub struct FsHost {
    root: PathBuf,
}

impl FsHost {
    /// A host whose namespace root is the directory `root`.
    pub fn new(root: impl Into<PathBuf>) -> Self {
        FsHost { root: root.into() }
    }

    /// The directory this host reads from.
    pub fn root(&self) -> &std::path::Path {
        &self.root
    }

    /// The path on disk that the root-relative `path` names.
    fn locate(&self, path: &str) -> PathBuf {
        let mut full = self.root.clone();
        full.extend(path.split('/').filter(|part| !part.is_empty()));
        full
    }
}

impl Host for FsHost {
    fn list(&self, dir: &str) -> io::Result<Vec<Entry>> {
        let mut entries = Vec::new();
        for entry in fs::read_dir(self.locate(dir))? {
            let entry = entry?;
            let Ok(name) = entry.file_name().into_string() else {
                continue;
            };
            let file_type = entry.file_type()?;
            let kind = if file_type.is_dir() {
                EntryKind::Directory
            } else if file_type.is_file() {
                EntryKind::File
            } else if file_type.is_symlink() {
                match fs::metadata(entry.path()) {
                    Ok(target) if target.is_file() => EntryKind::File,
                    _ => continue,
                }
            } else {
                continue;
            };
            entries.push(Entry { name, kind });
        }
        Ok(entries)
    }

    fn read(&self, path: &str) -> io::Result<String> {
        fs::read_to_string(self.locate(path))
    }
}

/// A [`Host`] over documents held in memory.
///
/// The directories are the ones the file paths imply, so a file at
/// `inner/.hmd/config.toml` is what makes `inner` a nested vault.
#[derive(Debug, Clone, Default)]
pub struct MemoryHost {
    files: BTreeMap<String, String>,
}

impl MemoryHost {
    /// A host holding `files`, each a root-relative path and that file's text.
    pub fn new<P, T>(files: impl IntoIterator<Item = (P, T)>) -> Self
    where
        P: Into<String>,
        T: Into<String>,
    {
        let mut host = MemoryHost::default();
        for (path, text) in files {
            host.insert(path, text);
        }
        host
    }

    /// Adds the file at `path`, replacing any file already held there.
    pub fn insert(&mut self, path: impl Into<String>, text: impl Into<String>) {
        let path: String = path.into();
        let path = path
            .split('/')
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join("/");
        self.files.insert(path, text.into());
    }
}

impl Host for MemoryHost {
    fn list(&self, dir: &str) -> io::Result<Vec<Entry>> {
        let prefix = if dir.is_empty() {
            String::new()
        } else {
            format!("{dir}/")
        };
        let mut kinds: BTreeMap<&str, EntryKind> = BTreeMap::new();
        for path in self.files.keys() {
            let Some(rest) = path.strip_prefix(&prefix) else {
                continue;
            };
            match rest.split_once('/') {
                Some((name, _)) => {
                    kinds.insert(name, EntryKind::Directory);
                }
                None => {
                    kinds.entry(rest).or_insert(EntryKind::File);
                }
            }
        }
        if kinds.is_empty() && !dir.is_empty() {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("no such directory: {dir}"),
            ));
        }
        Ok(kinds
            .into_iter()
            .map(|(name, kind)| Entry {
                name: name.to_owned(),
                kind,
            })
            .collect())
    }

    fn read(&self, path: &str) -> io::Result<String> {
        self.files
            .get(path)
            .cloned()
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, format!("no such file: {path}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_memory_host_lists_the_directories_its_paths_imply() {
        let host = MemoryHost::new([
            ("a.hmd", "A"),
            ("inner/.hmd/config.toml", ""),
            ("inner/b.hmd", "B"),
        ]);
        assert_eq!(
            host.list("").unwrap(),
            [Entry::file("a.hmd"), Entry::directory("inner")]
        );
        assert_eq!(
            host.list("inner").unwrap(),
            [Entry::directory(".hmd"), Entry::file("b.hmd")]
        );
        assert_eq!(host.read("inner/b.hmd").unwrap(), "B");
    }

    #[test]
    fn a_memory_host_reports_what_it_does_not_hold() {
        let host = MemoryHost::new([("a.hmd", "A")]);
        assert_eq!(
            host.read("b.hmd").unwrap_err().kind(),
            io::ErrorKind::NotFound
        );
        assert_eq!(
            host.list("nowhere").unwrap_err().kind(),
            io::ErrorKind::NotFound
        );
        assert!(MemoryHost::default().list("").unwrap().is_empty());
    }
}
