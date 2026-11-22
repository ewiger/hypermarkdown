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
                "wiki = \"notes\"\n[discovery]\nmode = \"recursive\"\n",
            ),
            ("notes/a.hmd", "[[b]]"),
            ("notes/sub/b.hmd", ""),
            ("outside.hmd", ""),
        ],
    );
    let vault = Vault::open(&root).expect("the vault opens");
    assert_eq!(vault.config().wiki, "notes");
    assert_eq!(vault.config().mode, Mode::Recursive);
    let paths: Vec<_> = vault.pages().iter().map(|p| p.path.as_str()).collect();
    assert_eq!(paths, ["a.hmd", "sub/b.hmd"]);
    assert_eq!(vault.resolve("a.hmd", "b").path(), Some("sub/b.hmd"));
}

#[test]
fn a_vault_without_configuration_reads_doc_wiki() {
    let root = tree("open-default", &[("doc/wiki/a.hmd", "[[missing]]")]);
    let vault = Vault::open(&root).expect("the vault opens");
    assert_eq!(*vault.config(), Config::default());
    assert_eq!(vault.pages().len(), 1);
    assert_eq!(vault.resolve("a.hmd", "missing"), Resolution::Unresolved);
}

#[test]
fn a_missing_namespace_root_is_a_configuration_error() {
    let root = tree(
        "open-missing",
        &[(".hmd/config.toml", "wiki = \"nowhere\"\n")],
    );
    let err = Vault::open(&root).expect_err("the namespace root does not exist");
    assert!(matches!(err, Error::Config { .. }), "{err}");
    assert!(err.to_string().starts_with("namespace root does not exist"));
}

#[test]
fn an_unusable_configuration_file_is_an_error() {
    let root = tree("open-bad", &[(".hmd/config.toml", "wiki = [")]);
    assert!(matches!(Vault::open(&root), Err(Error::Config { .. })));
}

#[cfg(unix)]
#[test]
fn a_linked_file_is_a_card_and_a_linked_directory_is_not_walked() {
    use std::os::unix::fs::symlink;

    let root = tree(
        "links",
        &[
            ("vault/a.hmd", ""),
            ("elsewhere/b.hmd", ""),
            ("elsewhere/c.hmd", ""),
        ],
    );
    symlink(root.join("elsewhere/b.hmd"), root.join("vault/b.hmd")).expect("a file link");
    symlink(root.join("elsewhere"), root.join("vault/linked")).expect("a directory link");

    let vault =
        Vault::load(&FsHost::new(root.join("vault")), Config::default()).expect("the vault loads");
    let paths: Vec<_> = vault.pages().iter().map(|p| p.path.as_str()).collect();
    assert_eq!(paths, ["a.hmd", "b.hmd"]);
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
