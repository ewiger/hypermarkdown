//! The crate over a real directory: the `std::fs` host, vault discovery, and
//! loading a vault from its root.

use std::fs;
use std::path::{Path, PathBuf};

use hypermarkdown::{Config, Entry, Error, FsHost, Host, Mode, Resolution, Vault, find_vault_root};

/// A fresh directory for one test, holding `files`.
fn tree(name: &str, files: &[(&str, &str)]) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    if root.exists() {
        fs::remove_dir_all(&root).expect("the old tree is removed");
    }
    for (path, text) in files {
        let full = root.join(path);
        fs::create_dir_all(full.parent().expect("a file has a parent")).expect("directories");
        fs::write(full, text).expect("the file is written");
    }
    root
}

#[test]
fn the_fs_host_lists_and_reads() {
    let root = tree(
        "fs-host",
        &[("a.hmd", "A"), ("sub/b.hmd", "B"), (".hmd/config.toml", "")],
    );
    let host = FsHost::new(&root);
    assert_eq!(host.root(), root);

    let mut entries = host.list("").expect("the root lists");
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    assert_eq!(
        entries,
        [
            Entry::directory(".hmd"),
            Entry::file("a.hmd"),
            Entry::directory("sub")
        ]
    );
    assert_eq!(host.read("sub/b.hmd").expect("the card reads"), "B");
    assert!(host.read("missing.hmd").is_err());
    assert!(host.list("missing").is_err());
}

#[test]
fn the_vault_root_is_the_nearest_directory_holding_the_marker() {
    let root = tree(
        "discovery",
        &[
            ("outer/.hmd/config.toml", ""),
            ("outer/notes/deep/card.hmd", ""),
            ("outer/inner/.hmd/config.toml", ""),
            ("outer/inner/card.hmd", ""),
            ("plain/card.hmd", ""),
        ],
    );
    let outer = root.join("outer");
    assert_eq!(find_vault_root(&outer), Some(outer.clone()));
    assert_eq!(
        find_vault_root(&outer.join("notes/deep/card.hmd")),
        Some(outer.clone())
    );
    assert_eq!(
        find_vault_root(&outer.join("notes/deep")),
        Some(outer.clone())
    );
    assert_eq!(
        find_vault_root(&outer.join("inner/card.hmd")),
        Some(outer.join("inner"))
    );
    // Nothing between this card and the test directory carries a marker, so
    // whatever is found lies above the tree.
    let found = find_vault_root(&root.join("plain/card.hmd"));
    assert!(found.is_none_or(|dir| !dir.starts_with(&root)));
}

#[test]
fn a_vault_opens_from_its_root_with_its_own_configuration() {
    let root = tree(
        "open",
        &[
            (
                ".hmd/config.toml",
                "location_path = \"notes\"\n[discovery]\nmode = \"recursive\"\n",
            ),
            ("notes/a.hmd", "[[b]]"),
            ("notes/sub/b.hmd", ""),
            ("outside.hmd", ""),
        ],
    );
    let vault = Vault::open(&root).expect("the vault opens");
    assert_eq!(vault.config().location_path, "notes");
    assert_eq!(vault.config().mode, Mode::Recursive);
    let paths: Vec<_> = vault.pages().iter().map(|p| p.path.as_str()).collect();
    assert_eq!(paths, ["a.hmd", "sub/b.hmd"]);
    assert_eq!(vault.resolve("a.hmd", "b").path(), Some("sub/b.hmd"));
}

/// A host that answers one path from memory and every other from disk.
struct InFront {
    disk: FsHost,
    path: &'static str,
    text: &'static str,
}

impl Host for InFront {
    fn list(&self, dir: &str) -> std::io::Result<Vec<Entry>> {
        self.disk.list(dir)
    }

    fn read(&self, path: &str) -> std::io::Result<String> {
        if path == self.path {
            return Ok(self.text.to_owned());
        }
        self.disk.read(path)
    }
}

#[test]
fn a_vault_opens_through_a_host_the_caller_puts_in_front_of_the_disk() {
    let root = tree(
        "open-with",
        &[
            (".hmd/config.toml", "location_path = \"notes\"\n"),
            ("notes/a.hmd", "[[b]]"),
            ("notes/b.hmd", ""),
            ("notes/c.hmd", ""),
        ],
    );
    let vault = Vault::open_with(&root, |disk| {
        // The host is over the namespace root the configuration names.
        assert_eq!(disk.root(), root.join("notes"));
        InFront {
            disk,
            path: "a.hmd",
            text: "[[c]]",
        }
    })
    .expect("the vault opens");
    assert_eq!(vault.config().location_path, "notes");
    let links: Vec<_> = vault
        .page("a.hmd")
        .expect("the card")
        .links
        .iter()
        .collect();
    assert_eq!(links.len(), 1);
    assert_eq!(links[0].page, "c");
}

#[test]
fn opening_through_a_host_refuses_what_opening_from_disk_refuses() {
    let root = tree(
        "open-with-missing",
        &[(".hmd/config.toml", "location_path = \"absent\"\n")],
    );
    let err = Vault::open_with(&root, |disk| disk).expect_err("the namespace root is missing");
    assert!(matches!(err, Error::Config { .. }));
}

#[test]
fn a_vault_without_configuration_reads_the_vault_itself() {
    let root = tree(
        "open-default",
        &[("a.hmd", "[[missing]]"), ("doc/wiki/b.hmd", "")],
    );
    let vault = Vault::open(&root).expect("the vault opens");
    assert_eq!(*vault.config(), Config::default());
    let paths: Vec<_> = vault.pages().iter().map(|p| p.path.as_str()).collect();
    assert_eq!(paths, ["a.hmd", "doc/wiki/b.hmd"]);
    assert_eq!(vault.resolve("a.hmd", "missing"), Resolution::Unresolved);
}

#[test]
fn a_missing_namespace_root_is_a_configuration_error() {
    let root = tree(
        "open-missing",
        &[(".hmd/config.toml", "location_path = \"nowhere\"\n")],
    );
    let err = Vault::open(&root).expect_err("the namespace root does not exist");
    assert!(matches!(err, Error::Config { .. }), "{err}");
    assert!(err.to_string().starts_with("namespace root does not exist"));
}

#[test]
fn a_vault_whose_configuration_sets_wiki_is_not_opened() {
    let root = tree(
        "open-retired",
        &[
            (".hmd/config.toml", "wiki = \"notes\"\n"),
            ("notes/a.hmd", ""),
        ],
    );
    let err = Vault::open(&root).expect_err("a config with `wiki` is refused");
    assert!(matches!(err, Error::Config { .. }), "{err}");
    assert!(err.to_string().contains("`location_path`"), "{err}");
}

#[test]
fn a_location_path_into_a_nested_vault_is_refused() {
    for location in ["inner", "inner/notes", "./inner/notes"] {
        let config = format!("location_path = \"{location}\"\n");
        let root = tree(
            &format!("open-into-nested-{}", location.replace(['/', '.'], "-")),
            &[
                (".hmd/config.toml", config.as_str()),
                ("inner/.hmd/config.toml", ""),
                ("inner/notes/a.hmd", ""),
            ],
        );
        let err = Vault::open(&root).expect_err("a root inside a nested vault is refused");
        assert!(matches!(err, Error::Config { .. }), "{err}");
        let message = err.to_string();
        assert!(
            message.contains("`location_path`") && message.contains("nested vault at inner"),
            "{message}"
        );
    }
}

#[test]
fn a_location_path_beside_a_nested_vault_is_read() {
    let root = tree(
        "open-beside-nested",
        &[
            (".hmd/config.toml", "location_path = \"notes\"\n"),
            ("inner/.hmd/config.toml", ""),
            ("notes/a.hmd", ""),
        ],
    );
    let vault = Vault::open(&root).expect("the vault opens");
    assert_eq!(vault.pages().len(), 1);
}

#[test]
fn an_unusable_configuration_file_is_an_error() {
    let root = tree("open-bad", &[(".hmd/config.toml", "location_path = [")]);
    assert!(matches!(Vault::open(&root), Err(Error::Config { .. })));
}

#[cfg(unix)]
#[test]
fn a_link_out_of_the_root_escapes_and_a_link_inside_it_is_read() {
    use std::os::unix::fs::symlink;

    let root = tree(
        "links",
        &[
            ("vault/a.hmd", ""),
            ("vault/real/d.hmd", ""),
            ("elsewhere/b.hmd", ""),
            ("elsewhere/c.hmd", ""),
        ],
    );
    symlink(root.join("elsewhere/b.hmd"), root.join("vault/b.hmd")).expect("a file link out");
    symlink(root.join("elsewhere"), root.join("vault/linked")).expect("a directory link out");
    symlink(root.join("vault/real/d.hmd"), root.join("vault/d.hmd")).expect("a file link in");
    symlink(root.join("vault/real"), root.join("vault/alias")).expect("a directory link in");

    let vault =
        Vault::load(&FsHost::new(root.join("vault")), Config::default()).expect("the vault loads");
    let paths: Vec<_> = vault.pages().iter().map(|p| p.path.as_str()).collect();
    // Nothing through a link out of the root is a card, and a linked directory
    // inside it is not walked, so a link cannot make the walk loop.
    assert_eq!(paths, ["a.hmd", "d.hmd", "real/d.hmd"]);
    // A reference whose path meets a link out of the root escapes.
    assert_eq!(vault.resolve("a.hmd", "b"), Resolution::Escapes);
    assert_eq!(vault.resolve("a.hmd", "/linked/c"), Resolution::Escapes);
    assert_eq!(vault.resolve("a.hmd", "c"), Resolution::Unresolved);
}

#[test]
fn a_file_on_disk_that_is_not_utf8_is_skipped_and_listed() {
    let root = tree(
        "undecodable",
        &[("good.hmd", "# Good\n\n[[bad]]\n"), ("sub/fine.md", "")],
    );
    fs::write(root.join("bad.hmd"), b"# Caf\xe9\n").expect("the file is written");
    fs::write(root.join("sub/worse.markdown"), b"\xff").expect("the file is written");

    let vault = Vault::load(&FsHost::new(&root), Config::default()).expect("the vault loads");
    assert_eq!(vault.undecodable(), ["bad.hmd", "sub/worse.markdown"]);
    assert!(vault.page("bad.hmd").is_none());
    assert_eq!(vault.resolve("good.hmd", "bad"), Resolution::Unresolved);
    assert!(vault.resolve("good.hmd", "fine").is_resolved());
}

#[test]
fn a_byte_order_mark_on_disk_does_not_hide_frontmatter() {
    let root = tree(
        "byte-order-mark",
        &[
            (
                "card.hmd",
                "\u{feff}---\nuse: no_autodiscovery\n---\n[[deep]]\n",
            ),
            ("sub/deep.hmd", ""),
        ],
    );
    let vault = Vault::load(&FsHost::new(&root), Config::default()).expect("the vault loads");
    let card = vault.page("card.hmd").expect("the card loads");
    assert_eq!(card.autodiscovery, Some(false));
    assert_eq!((card.links[0].line, card.links[0].column), (4, 1));
    assert_eq!(vault.resolve("card.hmd", "deep"), Resolution::Unresolved);
}
