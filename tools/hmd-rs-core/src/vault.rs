//! The vault and the resolver.
//!
//! A vault is every card under one namespace root. A reference is resolved
//! from the card that holds it, and the rules are tried in this order:
//!
//! 1. A reference opening with `/` names a card from the namespace root, and
//!    one opening with `./` or `../` names a card from the directory of the
//!    card holding it. Neither is looked up anywhere else.
//! 2. A bare single-segment reference that a named import binds is the card
//!    the import bound.
//! 3. The spine: the directory of the card holding the reference, then each
//!    directory above it up to the root. The nearest directory that holds the
//!    reference wins.
//! 4. The directories imported with `import *`, in the order written.
//! 5. Autodiscovery, when it is on for the card: every card in the namespace
//!    whose path ends with the reference. One match resolves; more than one is
//!    ambiguous and nothing is chosen.
//!
//! In every directory a name binds the card `name.hmd`, `name.md` or
//! `name.markdown`, in that order, and failing those the folder note
//! `name/index` with the same extensions in the same order. A reference that
//! writes an extension binds only that extension, and a named import whose
//! card has another extension does not apply. Where two files of one directory
//! share a name, the later extension is shadowed: bound, and found by
//! autodiscovery, only by a reference that writes its extension. `./` and
//! `../` alone name a directory, and bind only its folder note.
//!
//! A directory below the root that holds its own `.hmd` directory is the root
//! of another vault. None of its cards belong to this one, and a reference
//! whose path enters it escapes the namespace, as does one whose path climbs
//! above the root or meets a symbolic link out of it.
//!
//! Names compare in Unicode NFC: a reference, a name on disk and an import's
//! directory match whether each is stored composed or decomposed. Two files
//! whose paths are one path in NFC are one card, the first of them in path
//! order.
//!
//! A file with a card extension that is not valid UTF-8 is not a card. It is
//! not loaded and no reference reaches it; [`Vault::undecodable`] lists it.

use std::cmp::Ordering;
use std::collections::{BTreeSet, HashMap, HashSet};
use std::io;
use std::path::Path;

use crate::config::{Config, MARKER_DIR, Mode};
use crate::error::Error;
use crate::host::{EntryKind, FsHost, Host};
use crate::page::{Page, dot_segment_outside_relative};
use crate::paths::{self, CARD_SUFFIXES, INDEX_STEM, SUFFIX};
use crate::text::nfc;

/// The rule that resolved a reference.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Via {
    /// The reference names its card by path: it opens with `/`, `./` or
    /// `../`.
    Path,
    /// A named import of the card holding the reference binds the name.
    NamedImport,
    /// A directory on the spine holds the name.
    Spine,
    /// A directory imported with `import *` holds the name.
    SearchPath,
    /// Exactly one card in the namespace has a path ending with the reference.
    Autodiscovery,
}

/// The outcome of resolving one reference.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Resolution {
    /// The reference names exactly one card.
    Resolved {
        /// The card's path relative to the namespace root.
        path: String,
        /// The rule that found it.
        via: Via,
    },
    /// The reference names no card.
    Unresolved,
    /// Autodiscovery found more than one card and chose none.
    Ambiguous {
        /// The paths of the cards found, sorted.
        candidates: Vec<String>,
    },
    /// The reference's path leaves the namespace: it climbs above the root,
    /// enters a nested vault, or meets a symbolic link out of the root.
    Escapes,
}

/// What looking a path up in one directory finds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Bound<'a> {
    /// The card at this path.
    Card(&'a str),
    /// No card.
    NotFound,
    /// The path leaves the namespace.
    Escapes,
}

impl Resolution {
    /// The path of the card the reference resolved to, if it resolved.
    pub fn path(&self) -> Option<&str> {
        match self {
            Resolution::Resolved { path, .. } => Some(path),
            _ => None,
        }
    }

    /// Whether the reference resolved to a card.
    pub fn is_resolved(&self) -> bool {
        matches!(self, Resolution::Resolved { .. })
    }
}

/// What one card's import statements resolve to.
#[derive(Debug, Default)]
struct ImportTable {
    /// Local name, in NFC, to the path of the card it is bound to.
    bindings: HashMap<String, String>,
    /// The directories imported with `*`, in the order written, each as a
    /// root-relative path.
    search_paths: Vec<String>,
}

/// Every card under one namespace root, and resolution over them.
#[derive(Debug)]
pub struct Vault {
    config: Config,
    /// The cards, ordered by path.
    pages: Vec<Page>,
    /// A card's path to its position in `pages`.
    by_path: HashMap<String, usize>,
    /// A card's path in NFC to its position in `pages`, which is what binding
    /// looks a name up in.
    by_nfc: HashMap<String, usize>,
    /// A path without its suffix, in NFC, to the cards it names, for
    /// autodiscovery; a folder note is also filed under its directory.
    by_parts: HashMap<String, Vec<usize>>,
    /// The import table of each card, in the order of `pages`.
    imports: Vec<ImportTable>,
    /// Every directory of the namespace that is not hidden and not inside a
    /// nested vault, in NFC; the root is the empty string.
    directories: HashSet<String>,
    /// The roots of the vaults nested below this one, sorted.
    nested: Vec<String>,
    /// A shadowed card's path to the path of the card that shadows it.
    shadowed: HashMap<String, String>,
    /// Symbolic links below the root that lead out of it, in NFC.
    escaping: HashSet<String>,
    /// The files with a card extension that are not valid UTF-8, in path
    /// order.
    undecodable: Vec<String>,
}

impl Vault {
    /// Loads every card under the namespace root `host` reads from.
    ///
    /// The walk skips every entry whose name starts with `.`, and does not
    /// enter a directory below the root that holds a `.hmd` directory. The
    /// `wiki` setting of `config` is not consulted: the host already is the
    /// namespace root.
    ///
    /// A file the host reports as not valid UTF-8, with
    /// [`io::ErrorKind::InvalidData`], is not a card and does not fail the
    /// load: it is listed in [`Vault::undecodable`]. Of two files whose paths
    /// are one path in NFC, the first in path order is the card and the other
    /// is not loaded. Any other failure to read is an [`Error::Io`].
    pub fn load<H: Host + ?Sized>(host: &H, config: Config) -> Result<Vault, Error> {
        let mut tree = Tree::default();
        walk(host, "", &mut tree)?;

        // Ordered by path component, so a directory's cards stay together.
        let Tree {
            cards: mut found,
            directories,
            mut nested,
            escaping,
        } = tree;
        found.sort_by(|a, b| compare_paths(a, b));
        nested.sort();

        let mut pages = Vec::with_capacity(found.len());
        let mut undecodable = Vec::new();
        let mut claimed = HashSet::new();
        for path in found {
            let text = match host.read(&path) {
                Ok(text) => text,
                Err(err) if err.kind() == io::ErrorKind::InvalidData => {
                    undecodable.push(path);
                    continue;
                }
                Err(err) => return Err(Error::io(&path, err)),
            };
            if !claimed.insert(nfc(&path).into_owned()) {
                continue;
            }
            pages.push(Page::parse(path, &text));
        }
        let mut vault = Vault::index(config, pages, directories, nested, escaping);
        vault.undecodable = undecodable;
        Ok(vault)
    }

    /// Loads the vault rooted at the directory `vault_root` from disk.
    ///
    /// The configuration is the vault's `.hmd/config.toml`, or the defaults
    /// when it has none, and the namespace root is the directory its `wiki`
    /// setting names.
    pub fn open(vault_root: &Path) -> Result<Vault, Error> {
        let config = Config::read(vault_root)?;
        // The namespace root has to lie in this vault. A directory between the
        // vault and the root that carries its own `.hmd` is another vault, and
        // its cards are never this one's; the vault's own marker is not
        // counted.
        let mut directory = vault_root.to_path_buf();
        for part in config.location_path.split('/') {
            if part.is_empty() || part == "." {
                continue;
            }
            directory.push(part);
            if directory.join(MARKER_DIR).is_dir() {
                let nested = directory
                    .strip_prefix(vault_root)
                    .unwrap_or(&directory)
                    .to_string_lossy()
                    .replace(std::path::MAIN_SEPARATOR, "/");
                return Err(Error::config(format!(
                    "`location_path` {:?} resolves into the nested vault at {nested}; \
                     the namespace root must lie in the vault that names it",
                    config.location_path
                )));
            }
        }
        let root = config.namespace_root(vault_root);
        if !root.is_dir() {
            return Err(Error::config(format!(
                "namespace root does not exist: {}",
                root.display()
            )));
        }
        Vault::load(&FsHost::new(root), config)
    }

    /// Builds the lookup tables over already parsed cards.
    fn index(
        config: Config,
        pages: Vec<Page>,
        directories: HashSet<String>,
        nested: Vec<String>,
        escaping: HashSet<String>,
    ) -> Vault {
        let mut vault = Vault {
            config,
            pages,
            by_path: HashMap::new(),
            by_nfc: HashMap::new(),
            by_parts: HashMap::new(),
            imports: Vec::new(),
            directories,
            nested,
            shadowed: HashMap::new(),
            escaping,
            undecodable: Vec::new(),
        };

        // Files of one directory whose names differ only in their card
        // extension claim one name; the earliest extension is the card at it.
        let mut claims: HashMap<String, Vec<&str>> = HashMap::new();
        for page in &vault.pages {
            claims
                .entry(nfc(&paths::page_parts(&page.path).join("/")).into_owned())
                .or_default()
                .push(&page.path);
        }
        for mut claimants in claims.into_values() {
            claimants.sort_by_key(|path| rank(path));
            if let Some((winner, losers)) = claimants.split_first() {
                for loser in losers {
                    vault
                        .shadowed
                        .insert((*loser).to_owned(), (*winner).to_owned());
                }
            }
        }

        for (at, page) in vault.pages.iter().enumerate() {
            vault.by_path.insert(page.path.clone(), at);
            vault.by_nfc.insert(nfc(&page.path).into_owned(), at);

            // A shadowed card is filed too: a reference that writes its
            // extension finds it in the sweep, and one that writes none skips
            // it there.
            let key = nfc(&page.path).into_owned();
            let parts = paths::page_parts(&key);
            vault.by_parts.entry(parts.join("/")).or_default().push(at);
            // A folder note is also addressable by its directory's name, so a
            // bare name means the same card on the spine and in the sweep.
            if let [directory @ .., INDEX_STEM] = &parts[..]
                && !directory.is_empty()
            {
                vault
                    .by_parts
                    .entry(directory.join("/"))
                    .or_default()
                    .push(at);
            }
        }

        vault.imports = vault
            .pages
            .iter()
            .map(|page| vault.import_table(page))
            .collect();
        vault
    }

    /// The configuration the vault was loaded with.
    pub fn config(&self) -> &Config {
        &self.config
    }

    /// The vault's cards, ordered by path, component by component.
    pub fn pages(&self) -> &[Page] {
        &self.pages
    }

    /// The card at `path`, a path relative to the namespace root, spelled as
    /// the host listed it.
    pub fn page(&self, path: &str) -> Option<&Page> {
        self.by_path.get(path).map(|&at| &self.pages[at])
    }

    /// The card whose path is `path` in NFC: the lookup binding makes.
    fn card(&self, path: &str) -> Option<&Page> {
        self.by_nfc
            .get(nfc(path).as_ref())
            .map(|&at| &self.pages[at])
    }

    /// The files below the root with a card extension that are not valid
    /// UTF-8, in path order.
    ///
    /// None of them is a card: none is in [`Vault::pages`], and no reference
    /// resolves to one. The canonical implementation reports each as HMD019;
    /// reporting is the caller's.
    pub fn undecodable(&self) -> &[String] {
        &self.undecodable
    }

    /// The directories below the root that are the roots of other vaults,
    /// sorted.
    pub fn nested_vaults(&self) -> &[String] {
        &self.nested
    }

    /// The card that shadows the card at `path`, when one does: a card of the
    /// same name in the same directory with an earlier card extension.
    pub fn shadowed_by(&self, path: &str) -> Option<&str> {
        self.shadowed.get(path).map(String::as_str)
    }

    /// Whether autodiscovery is on for the card at `source`.
    ///
    /// The card's own `use` key decides; failing that, the `use` key of the
    /// nearest folder note at or above the card's directory; failing that, the
    /// configuration.
    pub fn autodiscovery(&self, source: &str) -> bool {
        if let Some(stated) = self.page(source).and_then(|page| page.autodiscovery) {
            return stated;
        }

        let mut directory = paths::parent(source);
        loop {
            let note = join(&directory, &[&format!("{INDEX_STEM}{SUFFIX}")]);
            if note != source
                && let Some(stated) = self.page(&note).and_then(|page| page.autodiscovery)
            {
                return stated;
            }
            if directory.pop().is_none() {
                break;
            }
        }

        self.config.autodiscovery
    }

    /// Resolves the page reference `reference` from the card at `source`.
    ///
    /// `source` is a path relative to the namespace root; it need not be a
    /// card the vault holds, in which case it has no imports and no `use` key.
    /// `reference` is a page reference without fragment or display text, as
    /// [`Link::page`](crate::Link::page) and
    /// [`Reference::page`](crate::Reference::page) hold it. A trailing card
    /// extension is stripped, and only that extension is then bound. The
    /// reference is compared in NFC, so a name written decomposed reaches a
    /// card stored composed, and the other way round.
    pub fn resolve(&self, source: &str, reference: &str) -> Resolution {
        let reference = nfc(reference);
        let reference = reference.as_ref();
        let ext = paths::card_suffix(reference);
        let stem = &reference[..reference.len() - ext.map_or(0, str::len)];

        // A `.` or `..` outside an explicit relative reference is malformed, and such a
        // reference is never a link; resolved directly, it names no card.
        if dot_segment_outside_relative(stem) {
            return Resolution::Unresolved;
        }

        // A reference that ends in `/` names a directory, and resolves only to
        // its folder note, in every phase; `[[/]]` is the root's.
        let dir_ref = stem.ends_with('/');

        if stem.starts_with('/') {
            return by_path_rule(self.bind(&[], &paths::split(stem), ext, dir_ref));
        }

        if stem.starts_with("./") || stem.starts_with("../") {
            let from = paths::parent(source);
            let Some(parts) = paths::normalize(from.into_iter().chain(stem.split('/'))) else {
                return Resolution::Escapes;
            };
            // `./`, `../`, a trailing `/`, and a last component of `.` or `..`
            // name a directory, and bind only its folder note; so does a path
            // that normalizes to the root itself.
            let last = stem.rsplit('/').next();
            let directory_only = dir_ref || parts.is_empty() || matches!(last, Some("." | ".."));
            return by_path_rule(self.bind_path(&parts, ext, directory_only));
        }

        let parts = paths::split(stem);
        if parts.is_empty() {
            return Resolution::Unresolved;
        }

        let table = self.by_path.get(source).map(|&at| &self.imports[at]);

        // A named import binds a card, not a directory, so it applies to a
        // single-segment reference only, never to one that names a directory,
        // and not to one that writes an extension the bound card does not have.
        if !dir_ref
            && let ([name], Some(table)) = (&parts[..], table)
            && let Some(path) = table.bindings.get(*name)
            && ext.is_none_or(|ext| paths::card_suffix(path) == Some(ext))
        {
            return resolved(path, Via::NamedImport);
        }

        // The spine, nearest directory first.
        let mut directory = paths::parent(source);
        loop {
            match self.bind(&directory, &parts, ext, dir_ref) {
                Bound::Card(path) => return resolved(path, Via::Spine),
                Bound::Escapes => return Resolution::Escapes,
                Bound::NotFound => {}
            }
            if directory.pop().is_none() {
                break;
            }
        }

        // Imported directories, in the order the card wrote them. The first
        // card wins. A path out of the namespace before any card is found
        // escapes; after one, it leaves the result as it is, and reporting it
        // is the caller's.
        let mut first = None;
        for directory in table.iter().flat_map(|table| &table.search_paths) {
            match self.bind(&paths::split(directory), &parts, ext, dir_ref) {
                Bound::Card(path) => {
                    first.get_or_insert(path);
                }
                Bound::Escapes if first.is_none() => return Resolution::Escapes,
                Bound::Escapes | Bound::NotFound => {}
            }
        }
        if let Some(path) = first {
            return resolved(path, Via::SearchPath);
        }

        if !self.autodiscovery(source) {
            return Resolution::Unresolved;
        }

        let mut matches = self.sweep(source, &parts, ext, dir_ref);
        match matches.len() {
            0 => Resolution::Unresolved,
            1 => Resolution::Resolved {
                path: matches.remove(0),
                via: Via::Autodiscovery,
            },
            _ => Resolution::Ambiguous {
                candidates: matches,
            },
        }
    }

    /// Binds `parts` in the directory `directory`: the card `directory/parts`
    /// with a card extension, or failing that the folder note
    /// `directory/parts/index` with one; `ext`, when given, is the only
    /// extension tried.
    ///
    /// When both exist the card wins. The path is normalized first, and one
    /// that climbs above the root escapes. `directory_only`, for a reference
    /// that names a directory, binds only the folder note; with it, empty
    /// `parts` name `directory` itself.
    fn bind(
        &self,
        directory: &[&str],
        parts: &[&str],
        ext: Option<&str>,
        directory_only: bool,
    ) -> Bound<'_> {
        if parts.is_empty() && !directory_only {
            return Bound::NotFound;
        }
        match paths::normalize(directory.iter().chain(parts).copied()) {
            Some(full) => self.bind_path(&full, ext, directory_only),
            None => Bound::Escapes,
        }
    }

    /// Binds the normalized root-relative path `full`: the card `full` with a
    /// card extension, or failing that the folder note `full/index` with one,
    /// the extensions in priority order or `ext` alone. `directory_only` skips
    /// the card and binds only the folder note, and the empty path, the root,
    /// binds only the root's folder note. A path that enters a nested vault or
    /// meets a symbolic link out of the root escapes.
    fn bind_path(&self, full: &[&str], ext: Option<&str>, directory_only: bool) -> Bound<'_> {
        if self.violates(full) {
            return Bound::Escapes;
        }
        let extensions: Vec<&str> = match ext {
            Some(ext) => vec![ext],
            None => CARD_SUFFIXES.to_vec(),
        };
        let mut candidates = Vec::new();
        if let Some((last, head)) = full.split_last()
            && !directory_only
        {
            for ext in &extensions {
                candidates.push(join(head, &[&format!("{last}{ext}")]));
            }
        }
        for ext in &extensions {
            candidates.push(join(full, &[&format!("{INDEX_STEM}{ext}")]));
        }

        for candidate in candidates {
            if self.escaping.contains(nfc(&candidate).as_ref()) {
                return Bound::Escapes;
            }
            if let Some(page) = self.card(&candidate) {
                return Bound::Card(&page.path);
            }
        }
        Bound::NotFound
    }

    /// Whether the normalized root-relative path `full` breaks the namespace's
    /// boundaries: it enters a nested vault, or meets a symbolic link out of
    /// the root.
    fn violates(&self, full: &[&str]) -> bool {
        let path = nfc(&full.join("/")).into_owned();
        let nested = self.nested.iter().any(|root| {
            let root = nfc(root);
            path == root.as_ref() || path.starts_with(&format!("{root}/"))
        });
        nested
            || (1..=full.len())
                .any(|end| self.escaping.contains(nfc(&full[..end].join("/")).as_ref()))
    }

    /// Resolves the import statements of `page` into bindings and search
    /// paths.
    ///
    /// A statement contributes nothing when its directory climbs above the
    /// root, is not a directory of the namespace, or lies in a nested vault. A
    /// name that binds no card is skipped, and a local name bound twice to
    /// different cards keeps its first binding.
    fn import_table(&self, page: &Page) -> ImportTable {
        let mut table = ImportTable::default();
        for import in &page.imports {
            let directory = if import.directory.starts_with('/') {
                paths::normalize(paths::split(&import.directory))
            } else {
                paths::normalize(
                    paths::parent(&page.path)
                        .into_iter()
                        .chain(import.directory.split('/')),
                )
            };
            let Some(directory) = directory else {
                continue;
            };
            if !self
                .directories
                .contains(nfc(&directory.join("/")).as_ref())
            {
                continue;
            }

            if import.wildcard {
                table.search_paths.push(directory.join("/"));
                continue;
            }

            for binding in &import.bindings {
                if let Bound::Card(target) = self.bind(&directory, &[&binding.name], None, false) {
                    table
                        .bindings
                        .entry(nfc(&binding.local).into_owned())
                        .or_insert_with(|| target.to_owned());
                }
            }
        }
        table
    }

    /// Whether the folder note at `path`, matched under `key` by its
    /// directory's name, gives way: a card beside the directory claims the
    /// same name and is selected in every phase (HMD012), while the note stays
    /// reachable by its `index` path. Only a card the reference could bind
    /// counts: one with the written extension, or any card that is not
    /// shadowed.
    fn note_yields_to_card(&self, path: &str, key: &str, ext: Option<&str>) -> bool {
        let normalized = nfc(path).into_owned();
        let parts = paths::page_parts(&normalized);
        let [directory @ .., INDEX_STEM] = &parts[..] else {
            return false;
        };
        if directory.is_empty() || directory.join("/") != key {
            return false;
        }
        let extensions: Vec<&str> = match ext {
            Some(ext) => vec![ext],
            None => CARD_SUFFIXES.to_vec(),
        };
        extensions.iter().any(|each| {
            self.card(&format!("{}{each}", directory.join("/")))
                .is_some_and(|card| ext.is_some() || !self.shadowed.contains_key(&card.path))
        })
    }

    /// The cards whose path, without its suffix, ends with `parts`, sorted by
    /// path.
    ///
    /// In `recursive` mode only cards beneath the directory of `source` count.
    /// With `ext` only cards with that extension are found, shadowed or not;
    /// without it a shadowed card is never found. With `directory_only`, for a
    /// reference that names a directory, only folder notes are found, and a
    /// folder note it asks for never yields to a card beside its directory.
    fn sweep(
        &self,
        source: &str,
        parts: &[&str],
        ext: Option<&str>,
        directory_only: bool,
    ) -> Vec<String> {
        let scope = match self.config.mode {
            Mode::Both => String::new(),
            Mode::Recursive => paths::parent(source).join("/"),
        };
        let wanted = parts.join("/");
        let tail = format!("/{wanted}");

        let mut matches = BTreeSet::new();
        for (key, pages) in &self.by_parts {
            if *key != wanted && !key.ends_with(&tail) {
                continue;
            }
            for &at in pages {
                let path = &self.pages[at].path;
                let in_scope = scope.is_empty()
                    || path
                        .strip_prefix(&scope)
                        .is_some_and(|rest| rest.starts_with('/'));
                let kept = match ext {
                    Some(ext) => paths::card_suffix(path) == Some(ext),
                    None => !self.shadowed.contains_key(path),
                };
                let eligible = if directory_only {
                    paths::page_parts(path).last() == Some(&INDEX_STEM)
                } else {
                    !self.note_yields_to_card(path, key, ext)
                };
                if in_scope && kept && eligible {
                    matches.insert(path.clone());
                }
            }
        }
        matches.into_iter().collect()
    }
}

/// The outcome of a reference that names its card by path.
fn by_path_rule(bound: Bound<'_>) -> Resolution {
    match bound {
        Bound::Card(path) => resolved(path, Via::Path),
        Bound::NotFound => Resolution::Unresolved,
        Bound::Escapes => Resolution::Escapes,
    }
}

/// A [`Resolution::Resolved`] for `path`.
fn resolved(path: &str, via: Via) -> Resolution {
    Resolution::Resolved {
        path: path.to_owned(),
        via,
    }
}

/// The priority of a card's extension: lower wins a shared name.
fn rank(path: &str) -> usize {
    paths::card_suffix(path)
        .and_then(|suffix| CARD_SUFFIXES.iter().position(|each| *each == suffix))
        .unwrap_or(CARD_SUFFIXES.len())
}

/// The path made of `head` followed by `tail`.
fn join(head: &[&str], tail: &[&str]) -> String {
    head.iter()
        .chain(tail)
        .copied()
        .collect::<Vec<_>>()
        .join("/")
}

/// Orders two paths component by component, as the canonical implementation
/// orders its pages.
fn compare_paths(a: &str, b: &str) -> Ordering {
    a.split('/').cmp(b.split('/'))
}

/// What a walk of the namespace finds.
#[derive(Debug, Default)]
struct Tree {
    /// The path of every card.
    cards: Vec<String>,
    /// Every directory walked, the root included.
    directories: HashSet<String>,
    /// The root of every nested vault.
    nested: Vec<String>,
    /// Every symbolic link out of the root, in NFC.
    escaping: HashSet<String>,
}

/// Collects the cards, directories and nested vaults under `dir` into `tree`.
fn walk<H: Host + ?Sized>(host: &H, dir: &str, tree: &mut Tree) -> Result<(), Error> {
    let entries = host.list(dir).map_err(|err| Error::io(dir, err))?;

    // A directory below the root that carries its own marker is another
    // vault. The root's own marker does not count: every vault has one.
    let marked = entries
        .iter()
        .any(|entry| entry.kind == EntryKind::Directory && entry.name == MARKER_DIR);
    if marked && !dir.is_empty() {
        tree.nested.push(dir.to_owned());
        return Ok(());
    }
    tree.directories.insert(nfc(dir).into_owned());

    for entry in entries {
        if entry.name.starts_with('.') {
            continue;
        }
        let path = if dir.is_empty() {
            entry.name
        } else {
            format!("{dir}/{}", entry.name)
        };
        match entry.kind {
            EntryKind::Directory => walk(host, &path, tree)?,
            EntryKind::File if paths::card_suffix(&path).is_some() => tree.cards.push(path),
            EntryKind::File => {}
            EntryKind::LeavesRoot => {
                tree.escaping.insert(nfc(&path).into_owned());
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::host::MemoryHost;

    fn vault(files: &[(&str, &str)]) -> Vault {
        vault_with(files, Config::default())
    }

    fn vault_with(files: &[(&str, &str)], config: Config) -> Vault {
        Vault::load(&MemoryHost::new(files.iter().copied()), config).unwrap()
    }

    fn hit(path: &str, via: Via) -> Resolution {
        resolved(path, via)
    }

    #[test]
    fn pages_are_ordered_by_path_component() {
        let v = vault(&[
            ("a-b/c.hmd", ""),
            ("a/b.hmd", ""),
            ("z.hmd", ""),
            ("a.hmd", ""),
        ]);
        let paths: Vec<_> = v.pages().iter().map(|p| p.path.as_str()).collect();
        assert_eq!(paths, ["a/b.hmd", "a-b/c.hmd", "a.hmd", "z.hmd"]);
    }

    #[test]
    fn only_cards_outside_hidden_directories_load() {
        let v = vault(&[
            ("a.hmd", ""),
            ("notes.md", ""),
            (".hidden/b.hmd", ""),
            (".c.hmd", ""),
            (".hmd/config.toml", ""),
            ("sub/.git/d.hmd", ""),
        ]);
        let paths: Vec<_> = v.pages().iter().map(|p| p.path.as_str()).collect();
        assert_eq!(paths, ["a.hmd", "notes.md"]);
        assert!(v.nested_vaults().is_empty());
    }

    #[test]
    fn an_absolute_reference_names_a_card_from_the_root() {
        let v = vault(&[
            ("specs/login.hmd", ""),
            ("shared/tokens.hmd", ""),
            ("tokens.hmd", ""),
        ]);
        let from = "specs/login.hmd";
        assert_eq!(
            v.resolve(from, "/shared/tokens"),
            hit("shared/tokens.hmd", Via::Path)
        );
        assert_eq!(v.resolve(from, "/tokens.hmd"), hit("tokens.hmd", Via::Path));
        // A trailing `/` names a directory, so only a folder note answers it,
        // and `shared/tokens/` has none.
        assert_eq!(v.resolve(from, "/shared/tokens/"), Resolution::Unresolved);
        // It is looked up nowhere else: no spine, no sweep.
        assert_eq!(v.resolve(from, "/login"), Resolution::Unresolved);
        assert_eq!(v.resolve(from, "/"), Resolution::Unresolved);
        // `.` and `..` belong to relative references only; an absolute
        // reference holding one is malformed, and names no card.
        assert_eq!(v.resolve(from, "/shared/../tokens"), Resolution::Unresolved);
        assert_eq!(
            v.resolve(from, "/shared/../../tokens"),
            Resolution::Unresolved
        );
    }

    #[test]
    fn a_relative_reference_names_a_card_from_the_source_directory() {
        let v = vault(&[
            ("specs/auth/login.hmd", ""),
            ("specs/auth/tokens.hmd", ""),
            ("specs/glossary.hmd", ""),
            ("tokens.hmd", ""),
        ]);
        let from = "specs/auth/login.hmd";
        assert_eq!(
            v.resolve(from, "./tokens"),
            hit("specs/auth/tokens.hmd", Via::Path)
        );
        assert_eq!(
            v.resolve(from, "../glossary"),
            hit("specs/glossary.hmd", Via::Path)
        );
        assert_eq!(
            v.resolve(from, "../../tokens.hmd"),
            hit("tokens.hmd", Via::Path)
        );
        assert_eq!(
            v.resolve(from, "./../auth/./tokens"),
            hit("specs/auth/tokens.hmd", Via::Path)
        );
        // It is looked up nowhere else.
        assert_eq!(v.resolve(from, "./glossary"), Resolution::Unresolved);
    }

    #[test]
    fn a_relative_reference_above_the_root_escapes() {
        let v = vault(&[("specs/login.hmd", ""), ("tokens.hmd", "")]);
        assert_eq!(
            v.resolve("specs/login.hmd", "../../tokens"),
            Resolution::Escapes
        );
        assert_eq!(v.resolve("tokens.hmd", "../tokens"), Resolution::Escapes);
        assert_eq!(
            v.resolve("specs/login.hmd", "../tokens"),
            hit("tokens.hmd", Via::Path)
        );
    }

    #[test]
    fn a_relative_reference_to_the_root_names_its_folder_note() {
        let v = vault(&[("index.hmd", ""), ("specs/login.hmd", ""), ("a.hmd", "")]);
        assert_eq!(
            v.resolve("specs/login.hmd", "../"),
            hit("index.hmd", Via::Path)
        );
        assert_eq!(v.resolve("a.hmd", "./"), hit("index.hmd", Via::Path));
        // `[[/]]` names the namespace root, so its folder note too.
        assert_eq!(v.resolve("a.hmd", "/"), hit("index.hmd", Via::Path));
    }

    #[test]
    fn a_trailing_slash_names_a_directory_in_every_phase() {
        let v = vault(&[
            ("m.hmd", ""),
            ("m/index.hmd", ""),
            ("m/k/src.hmd", ""),
            ("x/deep/index.hmd", ""),
            ("y/deep.hmd", ""),
        ]);
        let from = "m/k/src.hmd";
        assert_eq!(v.resolve(from, "/m"), hit("m.hmd", Via::Path));
        assert_eq!(v.resolve(from, "/m/"), hit("m/index.hmd", Via::Path));
        assert_eq!(v.resolve(from, "m"), hit("m.hmd", Via::Spine));
        assert_eq!(v.resolve(from, "m/"), hit("m/index.hmd", Via::Spine));
        assert_eq!(v.resolve(from, "../../m/"), hit("m/index.hmd", Via::Path));
        assert_eq!(
            v.resolve(from, "deep/"),
            hit("x/deep/index.hmd", Via::Autodiscovery)
        );
    }

    #[test]
    fn the_nearest_card_on_the_spine_wins() {
        let v = vault(&[
            ("specs/auth/login.hmd", ""),
            ("specs/auth/tokens.hmd", ""),
            ("specs/tokens.hmd", ""),
            ("tokens.hmd", ""),
            ("specs/other.hmd", ""),
            ("root.hmd", ""),
        ]);
        assert_eq!(
            v.resolve("specs/auth/login.hmd", "tokens"),
            hit("specs/auth/tokens.hmd", Via::Spine)
        );
        assert_eq!(
            v.resolve("specs/other.hmd", "tokens"),
            hit("specs/tokens.hmd", Via::Spine)
        );
        assert_eq!(
            v.resolve("root.hmd", "tokens"),
            hit("tokens.hmd", Via::Spine)
        );
        assert_eq!(
            v.resolve("specs/auth/login.hmd", "root"),
            hit("root.hmd", Via::Spine)
        );
    }

    #[test]
    fn a_multi_segment_reference_binds_on_the_spine() {
        let v = vault(&[
            ("specs/auth/login.hmd", ""),
            ("specs/shared/tokens.hmd", ""),
        ]);
        assert_eq!(
            v.resolve("specs/auth/login.hmd", "shared/tokens"),
            hit("specs/shared/tokens.hmd", Via::Spine)
        );
    }

    #[test]
    fn a_directory_name_binds_its_folder_note() {
        let v = vault(&[
            ("a.hmd", ""),
            ("guide/index.hmd", ""),
            ("guide/intro.hmd", ""),
        ]);
        assert_eq!(
            v.resolve("a.hmd", "guide"),
            hit("guide/index.hmd", Via::Spine)
        );
        assert_eq!(
            v.resolve("a.hmd", "/guide"),
            hit("guide/index.hmd", Via::Path)
        );
        assert_eq!(
            v.resolve("a.hmd", "./guide"),
            hit("guide/index.hmd", Via::Path)
        );
        assert_eq!(
            v.resolve("a.hmd", "guide/index"),
            hit("guide/index.hmd", Via::Spine)
        );
    }

    #[test]
    fn a_card_beats_the_folder_note_of_the_same_name() {
        let v = vault(&[("foo.hmd", ""), ("foo/index.hmd", ""), ("a.hmd", "")]);
        assert_eq!(v.resolve("a.hmd", "foo"), hit("foo.hmd", Via::Spine));
        assert_eq!(v.resolve("a.hmd", "/foo"), hit("foo.hmd", Via::Path));
        assert_eq!(
            v.resolve("a.hmd", "foo/index"),
            hit("foo/index.hmd", Via::Spine)
        );
    }

    #[test]
    fn a_folder_note_is_swept_under_its_directory_name() {
        let v = vault(&[("deep/guide/index.hmd", ""), ("other/a.hmd", "")]);
        assert_eq!(
            v.resolve("other/a.hmd", "guide"),
            hit("deep/guide/index.hmd", Via::Autodiscovery)
        );
        // The root's folder note has no directory name to answer to.
        let v = vault(&[("index.hmd", ""), ("a.hmd", "")]);
        assert_eq!(v.resolve("a.hmd", "index"), hit("index.hmd", Via::Spine));
    }

    #[test]
    fn a_name_with_a_dot_binds_whole_and_a_written_extension_binds_only_itself() {
        let v = vault(&[("a.hmd", ""), ("v1.2.md", ""), ("notes.hmd", "")]);
        assert_eq!(v.resolve("a.hmd", "v1.2"), hit("v1.2.md", Via::Spine));
        assert_eq!(v.resolve("a.hmd", "notes.md"), Resolution::Unresolved);
        assert_eq!(
            v.resolve("a.hmd", "notes.hmd"),
            hit("notes.hmd", Via::Spine)
        );
    }

    #[test]
    fn a_markdown_card_is_a_target_and_is_not_scanned() {
        let v = vault(&[("a.hmd", "[[guide]]"), ("guide.md", "[[a]] [[missing]]")]);
        assert_eq!(v.resolve("a.hmd", "guide"), hit("guide.md", Via::Spine));
        let guide = v.page("guide.md").unwrap();
        assert_eq!(guide.kind, crate::Kind::Markdown);
        assert!(guide.links.is_empty());
    }

    #[test]
    fn a_later_extension_is_shadowed() {
        let v = vault(&[
            ("a.hmd", ""),
            ("owl.hmd", ""),
            ("owl.md", ""),
            ("far/y.md", ""),
            ("far/y.markdown", ""),
        ]);
        assert_eq!(v.resolve("a.hmd", "owl"), hit("owl.hmd", Via::Spine));
        assert_eq!(v.resolve("a.hmd", "owl.md"), hit("owl.md", Via::Spine));
        assert_eq!(v.shadowed_by("owl.md"), Some("owl.hmd"));
        assert_eq!(v.shadowed_by("owl.hmd"), None);
        // The sweep finds the card at the name and never the shadowed one.
        assert_eq!(v.resolve("a.hmd", "y"), hit("far/y.md", Via::Autodiscovery));
    }

    #[test]
    fn a_named_import_binds_a_card_and_shadows_the_spine() {
        let v = vault(&[
            (
                "specs/login.hmd",
                "---\nimport: from ../shared import tokens\n---\n",
            ),
            ("specs/tokens.hmd", ""),
            ("shared/tokens.hmd", ""),
        ]);
        assert_eq!(
            v.resolve("specs/login.hmd", "tokens"),
            hit("shared/tokens.hmd", Via::NamedImport)
        );
        // Another card in the same directory has no such import.
        assert_eq!(
            v.resolve("specs/tokens.hmd", "tokens"),
            hit("specs/tokens.hmd", Via::Spine)
        );
    }

    #[test]
    fn as_binds_the_alias_and_not_the_name() {
        let v = vault_with(
            &[
                (
                    "specs/login.hmd",
                    "---\nimport: from /shared import tokens as shared-tokens\n---\n",
                ),
                ("shared/tokens.hmd", ""),
            ],
            Config {
                autodiscovery: false,
                ..Config::default()
            },
        );
        let from = "specs/login.hmd";
        assert_eq!(
            v.resolve(from, "shared-tokens"),
            hit("shared/tokens.hmd", Via::NamedImport)
        );
        assert_eq!(
            v.resolve(from, "shared-tokens.hmd"),
            hit("shared/tokens.hmd", Via::NamedImport)
        );
        assert_eq!(v.resolve(from, "tokens"), Resolution::Unresolved);
        // A binding names a card, so it does not apply to a longer reference.
        assert_eq!(v.resolve(from, "x/shared-tokens"), Resolution::Unresolved);
    }

    #[test]
    fn a_named_import_can_bind_a_folder_note() {
        let v = vault(&[
            ("a.hmd", "---\nimport: from ./lib import guide\n---\n"),
            ("lib/guide/index.hmd", ""),
            ("guide.hmd", ""),
        ]);
        assert_eq!(
            v.resolve("a.hmd", "guide"),
            hit("lib/guide/index.hmd", Via::NamedImport)
        );
    }

    #[test]
    fn a_name_bound_twice_keeps_its_first_binding() {
        let v = vault(&[
            (
                "a.hmd",
                "---\nimport:\n  - from ./one import x\n  - from ./two import x\n  - from ./two import missing\n---\n",
            ),
            ("one/x.hmd", ""),
            ("two/x.hmd", ""),
        ]);
        assert_eq!(v.resolve("a.hmd", "x"), hit("one/x.hmd", Via::NamedImport));
        assert_eq!(v.resolve("a.hmd", "missing"), Resolution::Unresolved);
    }

    #[test]
    fn a_wildcard_import_is_searched_after_the_spine() {
        let v = vault_with(
            &[
                (
                    "specs/login.hmd",
                    "---\nimport:\n  - from /one import *\n  - from ../two import *\n---\n",
                ),
                ("one/tokens.hmd", ""),
                ("two/tokens.hmd", ""),
                ("two/only.hmd", ""),
                ("one/sub/deep.hmd", ""),
                ("specs/local.hmd", ""),
                ("one/local.hmd", ""),
            ],
            Config {
                autodiscovery: false,
                ..Config::default()
            },
        );
        let from = "specs/login.hmd";
        // Declaration order decides between two imported directories.
        assert_eq!(
            v.resolve(from, "tokens"),
            hit("one/tokens.hmd", Via::SearchPath)
        );
        assert_eq!(
            v.resolve(from, "only"),
            hit("two/only.hmd", Via::SearchPath)
        );
        assert_eq!(
            v.resolve(from, "sub/deep"),
            hit("one/sub/deep.hmd", Via::SearchPath)
        );
        // An imported directory never shadows a card on the spine.
        assert_eq!(v.resolve(from, "local"), hit("specs/local.hmd", Via::Spine));
        // The search is not recursive.
        assert_eq!(v.resolve(from, "deep"), Resolution::Unresolved);
    }

    #[test]
    fn an_import_from_above_the_root_contributes_nothing() {
        let v = vault_with(
            &[
                (
                    "a.hmd",
                    "---\nimport:\n  - from ../x import *\n  - from ../x import y\n---\n",
                ),
                ("x/y.hmd", ""),
            ],
            Config {
                autodiscovery: false,
                ..Config::default()
            },
        );
        assert_eq!(v.resolve("a.hmd", "y"), Resolution::Unresolved);
    }

    #[test]
    fn an_import_from_what_is_not_a_directory_contributes_nothing() {
        let v = vault_with(
            &[
                (
                    "a.hmd",
                    "---\nimport:\n  - from ./nowhere import *\n  - from ./x import *\n  - from ./x import y\n---\n",
                ),
                ("x.hmd", ""),
            ],
            Config {
                autodiscovery: false,
                ..Config::default()
            },
        );
        assert_eq!(v.resolve("a.hmd", "y"), Resolution::Unresolved);
        assert_eq!(v.resolve("a.hmd", "."), Resolution::Unresolved);
    }

    #[test]
    fn autodiscovery_finds_the_one_card_ending_with_the_reference() {
        let v = vault(&[
            ("specs/login.hmd", ""),
            ("shared/auth/tokens.hmd", ""),
            ("shared/other.hmd", ""),
        ]);
        let from = "specs/login.hmd";
        assert_eq!(
            v.resolve(from, "tokens"),
            hit("shared/auth/tokens.hmd", Via::Autodiscovery)
        );
        assert_eq!(
            v.resolve(from, "auth/tokens"),
            hit("shared/auth/tokens.hmd", Via::Autodiscovery)
        );
        assert_eq!(v.resolve(from, "th/tokens"), Resolution::Unresolved);
        assert_eq!(v.resolve(from, "nothing"), Resolution::Unresolved);
    }

    #[test]
    fn two_sweep_matches_are_ambiguous() {
        let v = vault(&[
            ("a/tokens.hmd", ""),
            ("b/tokens.hmd", ""),
            ("c/here.hmd", ""),
        ]);
        let outcome = v.resolve("c/here.hmd", "tokens");
        assert_eq!(
            outcome,
            Resolution::Ambiguous {
                candidates: vec!["a/tokens.hmd".into(), "b/tokens.hmd".into()],
            }
        );
        assert_eq!(outcome.path(), None);
        assert!(!outcome.is_resolved());
    }

    #[test]
    fn a_card_and_a_folder_note_are_two_sweep_matches() {
        let v = vault(&[("x/foo.hmd", ""), ("y/foo/index.hmd", ""), ("z/a.hmd", "")]);
        assert_eq!(
            v.resolve("z/a.hmd", "foo"),
            Resolution::Ambiguous {
                candidates: vec!["x/foo.hmd".into(), "y/foo/index.hmd".into()],
            }
        );
    }

    #[test]
    fn recursive_mode_sweeps_only_beneath_the_source_directory() {
        let files = [
            ("specs/login.hmd", ""),
            ("specs/auth/deep/tokens.hmd", ""),
            ("shared/tokens.hmd", ""),
            ("shared/only.hmd", ""),
            ("top.hmd", ""),
        ];
        let v = vault_with(
            &files,
            Config {
                mode: Mode::Recursive,
                ..Config::default()
            },
        );
        assert_eq!(
            v.resolve("specs/login.hmd", "tokens"),
            hit("specs/auth/deep/tokens.hmd", Via::Autodiscovery)
        );
        assert_eq!(v.resolve("specs/login.hmd", "only"), Resolution::Unresolved);
        // From the root the two modes cover the same cards.
        assert!(matches!(
            v.resolve("top.hmd", "tokens"),
            Resolution::Ambiguous { .. }
        ));
        assert!(matches!(
            vault(&files).resolve("specs/login.hmd", "tokens"),
            Resolution::Ambiguous { .. }
        ));
    }

    #[test]
    fn the_configuration_turns_autodiscovery_off() {
        let v = vault_with(
            &[("specs/login.hmd", ""), ("shared/tokens.hmd", "")],
            Config {
                autodiscovery: false,
                ..Config::default()
            },
        );
        assert!(!v.autodiscovery("specs/login.hmd"));
        assert_eq!(
            v.resolve("specs/login.hmd", "tokens"),
            Resolution::Unresolved
        );
    }

    #[test]
    fn a_card_overrides_the_configuration_in_either_direction() {
        let files = [
            ("on.hmd", "---\nuse: autodiscovery\n---\n"),
            ("off.hmd", "---\nuse: no_autodiscovery\n---\n"),
            ("plain.hmd", ""),
            ("shared/tokens.hmd", ""),
        ];
        let off = vault_with(
            &files,
            Config {
                autodiscovery: false,
                ..Config::default()
            },
        );
        assert!(off.resolve("on.hmd", "tokens").is_resolved());
        assert!(!off.resolve("plain.hmd", "tokens").is_resolved());

        let on = vault(&files);
        assert!(!on.resolve("off.hmd", "tokens").is_resolved());
        assert!(on.resolve("plain.hmd", "tokens").is_resolved());
    }

    #[test]
    fn the_nearest_folder_note_decides_for_the_cards_beneath_it() {
        let v = vault(&[
            ("index.hmd", "---\nuse: no_autodiscovery\n---\n"),
            ("a/index.hmd", "---\nuse: autodiscovery\n---\n"),
            ("a/b/card.hmd", ""),
            ("a/b/own.hmd", "---\nuse: no_autodiscovery\n---\n"),
            ("c/card.hmd", ""),
            ("c/index.hmd", ""),
        ]);
        assert!(v.autodiscovery("a/b/card.hmd"));
        assert!(!v.autodiscovery("a/b/own.hmd"));
        assert!(!v.autodiscovery("c/card.hmd"));
        // A folder note does not consult itself twice: its own key, then the
        // notes above it.
        assert!(v.autodiscovery("a/index.hmd"));
        assert!(!v.autodiscovery("c/index.hmd"));
        assert!(!v.autodiscovery("index.hmd"));
    }

    #[test]
    fn a_nested_vault_contributes_no_cards() {
        let v = vault(&[
            ("here.hmd", "[[time]]"),
            ("wiki/time.hmd", ""),
            ("inner/.hmd/config.toml", ""),
            ("inner/time.hmd", ""),
            ("inner/deeper/abs.hmd", ""),
        ]);
        assert_eq!(v.nested_vaults(), ["inner"]);
        assert!(v.page("inner/time.hmd").is_none());
        assert_eq!(
            v.resolve("here.hmd", "time"),
            hit("wiki/time.hmd", Via::Autodiscovery)
        );
        // A path into the nested vault leaves this namespace; the sweep finds
        // nothing behind its marker.
        assert_eq!(v.resolve("here.hmd", "/inner/time"), Resolution::Escapes);
        assert_eq!(v.resolve("here.hmd", "./inner/time"), Resolution::Escapes);
        assert_eq!(v.resolve("here.hmd", "abs"), Resolution::Unresolved);
    }

    #[test]
    fn the_root_marker_does_not_make_the_root_nested() {
        let v = vault(&[(".hmd/config.toml", ""), ("a.hmd", "")]);
        assert!(v.nested_vaults().is_empty());
        assert_eq!(v.pages().len(), 1);
    }

    #[test]
    fn an_import_into_a_nested_vault_binds_nothing() {
        let v = vault(&[
            (
                "a.hmd",
                "---\nimport:\n  - from ./inner import time\n  - from ./inner import *\n---\n",
            ),
            ("inner/.hmd/config.toml", ""),
            ("inner/time.hmd", ""),
        ]);
        assert_eq!(v.resolve("a.hmd", "time"), Resolution::Unresolved);
    }

    #[test]
    fn a_source_the_vault_does_not_hold_still_has_a_spine() {
        let v = vault(&[("specs/tokens.hmd", "")]);
        assert_eq!(
            v.resolve("specs/unsaved.hmd", "tokens"),
            hit("specs/tokens.hmd", Via::Spine)
        );
    }

    #[test]
    fn an_empty_reference_is_unresolved() {
        let v = vault(&[("a.hmd", "")]);
        assert_eq!(v.resolve("a.hmd", ""), Resolution::Unresolved);
        assert_eq!(v.resolve("a.hmd", ".hmd"), Resolution::Unresolved);
    }

    #[test]
    fn a_file_that_is_not_utf8_is_not_a_card() {
        struct Bytes;
        impl Host for Bytes {
            fn list(&self, _dir: &str) -> std::io::Result<Vec<crate::Entry>> {
                Ok(vec![
                    crate::Entry::file("bad.hmd"),
                    crate::Entry::file("good.hmd"),
                    crate::Entry::file("worse.md"),
                ])
            }
            fn read(&self, path: &str) -> std::io::Result<String> {
                match path {
                    "good.hmd" => Ok("[[bad]] [[worse]]".to_owned()),
                    _ => Err(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        "stream did not contain valid UTF-8",
                    )),
                }
            }
        }
        let v = Vault::load(&Bytes, Config::default()).unwrap();
        assert_eq!(v.undecodable(), ["bad.hmd", "worse.md"]);
        let paths: Vec<_> = v.pages().iter().map(|p| p.path.as_str()).collect();
        assert_eq!(paths, ["good.hmd"]);
        assert!(v.page("bad.hmd").is_none());
        assert_eq!(v.resolve("good.hmd", "bad"), Resolution::Unresolved);
        assert_eq!(v.resolve("good.hmd", "/worse.md"), Resolution::Unresolved);
        assert!(vault(&[("a.hmd", "")]).undecodable().is_empty());
    }

    #[test]
    fn a_reference_and_a_name_on_disk_compare_in_nfc() {
        // `café` stored decomposed, referred to composed, and the other way
        // round.
        let v = vault(&[
            ("a.hmd", ""),
            ("cafe\u{301}.hmd", ""),
            ("x/re\u{301}sume\u{301}/index.hmd", ""),
            ("na\u{ef}ve.hmd", ""),
        ]);
        assert_eq!(
            v.resolve("a.hmd", "caf\u{e9}"),
            hit("cafe\u{301}.hmd", Via::Spine)
        );
        assert_eq!(
            v.resolve("a.hmd", "/caf\u{e9}.hmd"),
            hit("cafe\u{301}.hmd", Via::Path)
        );
        assert_eq!(
            v.resolve("a.hmd", "./nai\u{308}ve"),
            hit("na\u{ef}ve.hmd", Via::Path)
        );
        assert_eq!(
            v.resolve("a.hmd", "r\u{e9}sum\u{e9}"),
            hit("x/re\u{301}sume\u{301}/index.hmd", Via::Autodiscovery)
        );
        // The card keeps the name it is stored under.
        assert!(v.page("cafe\u{301}.hmd").is_some());
        assert!(v.page("caf\u{e9}.hmd").is_none());
    }

    #[test]
    fn two_names_that_are_one_in_nfc_are_one_card() {
        let v = vault(&[
            ("a.hmd", ""),
            ("caf\u{e9}.hmd", "composed"),
            ("cafe\u{301}.hmd", "decomposed"),
        ]);
        // The first in path order is the card; the other is not loaded.
        let paths: Vec<_> = v.pages().iter().map(|p| p.path.as_str()).collect();
        assert_eq!(paths, ["a.hmd", "cafe\u{301}.hmd"]);
        assert_eq!(
            v.resolve("a.hmd", "caf\u{e9}"),
            hit("cafe\u{301}.hmd", Via::Spine)
        );
    }

    #[test]
    fn an_import_compares_its_directory_and_names_in_nfc() {
        let v = vault_with(
            &[
                (
                    "a.hmd",
                    "---\nimport:\n  - from ./caf\u{e9} import me\u{301}nu as ca\u{300}rte\n  - from /caf\u{e9} import *\n---\n",
                ),
                ("cafe\u{301}/m\u{e9}nu.hmd", ""),
                ("cafe\u{301}/drinks.hmd", ""),
            ],
            Config {
                autodiscovery: false,
                ..Config::default()
            },
        );
        assert_eq!(
            v.resolve("a.hmd", "c\u{e0}rte"),
            hit("cafe\u{301}/m\u{e9}nu.hmd", Via::NamedImport)
        );
        assert_eq!(
            v.resolve("a.hmd", "drinks"),
            hit("cafe\u{301}/drinks.hmd", Via::SearchPath)
        );
    }

    #[test]
    fn a_host_failure_is_an_io_error_naming_the_path() {
        struct Broken;
        impl Host for Broken {
            fn list(&self, _dir: &str) -> std::io::Result<Vec<crate::Entry>> {
                Ok(vec![crate::Entry::file("a.hmd")])
            }
            fn read(&self, _path: &str) -> std::io::Result<String> {
                Err(std::io::Error::other("unreadable"))
            }
        }
        let err = Vault::load(&Broken, Config::default()).unwrap_err();
        assert!(matches!(&err, Error::Io { path, .. } if path == "a.hmd"));
        assert_eq!(err.to_string(), "cannot read a.hmd: unreadable");
    }
}
