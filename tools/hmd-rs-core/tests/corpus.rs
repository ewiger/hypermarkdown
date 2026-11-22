//! The conformance runner.
//!
//! Every case under `examples/conformance/cases/` is loaded and resolved, and
//! the resolutions must equal the `resolutions` of the case's `expected.json`,
//! which the canonical implementation wrote. A case that holds addresses of
//! more than one step also carries `addresses`, each a UTF-8 byte span or the
//! rule it failed on, and those must be equal too. Diagnostics are not
//! compared: this crate is a resolver and emits none.
//!
//! A case named in `conformance-xfail.json` is expected to differ. A ledgered
//! case that matches fails the run, because an expected failure that starts
//! succeeding and is not removed is a ledger that no longer tells the truth.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use hypermarkdown::{Address, CONFIG_NAME, Card, Config, Fragment, FsHost, Vault, digest_of};
use serde_json::{Value, json};

/// This crate's directory.
fn package_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

/// A path of the repository, found by searching upward so that moving the
/// crate cannot leave a fixed path pointing somewhere else.
fn in_repository(relative: &str) -> PathBuf {
    let start = package_root();
    start
        .ancestors()
        .map(|dir| dir.join(relative))
        .find(|path| path.exists())
        .unwrap_or_else(|| panic!("no {relative} at or above {}", start.display()))
}

/// The corpus.
fn cases_dir() -> PathBuf {
    in_repository("examples/conformance/cases")
}

/// The identifier of every lint rule the canonical implementation defines,
/// read from the module that defines them.
fn canonical_rules() -> BTreeSet<String> {
    let path = in_repository("tools/hmd/src/hypermarkdown/lint/rules.py");
    let text = fs::read_to_string(&path).unwrap_or_else(|err| panic!("{}: {err}", path.display()));
    let rules: BTreeSet<String> = text
        .match_indices("HMD")
        .filter_map(|(at, _)| text.get(at..at + 6))
        .filter(|id| id[3..].bytes().all(|b| b.is_ascii_digit()))
        .map(str::to_owned)
        .collect();
    assert!(!rules.is_empty(), "{} names no rule", path.display());
    rules
}

/// The names of the corpus cases, sorted.
fn case_names() -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(cases_dir())
        .expect("the corpus directory lists")
        .map(|entry| entry.expect("a corpus entry reads"))
        .filter(|entry| entry.path().is_dir())
        .map(|entry| entry.file_name().into_string().expect("a UTF-8 case name"))
        .collect();
    names.sort();
    names
}

fn read_json(path: &Path) -> Value {
    let text = fs::read_to_string(path).unwrap_or_else(|err| panic!("{}: {err}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|err| panic!("{}: {err}", path.display()))
}

/// The ledger of known differences from the canonical implementation.
fn ledger() -> Value {
    read_json(&package_root().join("conformance-xfail.json"))
}

/// The `id` of every entry in one section of the ledger.
fn ledger_ids(section: &str) -> BTreeSet<String> {
    ledger()[section]
        .as_array()
        .unwrap_or_else(|| panic!("the ledger has no `{section}` list"))
        .iter()
        .map(|entry| {
            let id = entry["id"].as_str().expect("a ledger entry has an id");
            let reason = entry["reason"].as_str().unwrap_or_default();
            assert!(!reason.trim().is_empty(), "ledger entry {id} has no reason");
            id.to_owned()
        })
        .collect()
}

/// Resolves every reference of one case, in the shape and order of
/// `expected.json`'s `resolutions`.
fn resolutions(case: &Path) -> Value {
    // A case's `config.toml` sits beside its tree and is the tree's
    // `.hmd/config.toml`; without one the defaults are the case.
    let config = match fs::read_to_string(case.join(CONFIG_NAME)) {
        Ok(text) => Config::parse(&text).expect("the case's config.toml parses"),
        Err(_) => Config::default(),
    };
    let vault = Vault::load(&FsHost::new(case.join("tree")), config).expect("the case loads");

    let mut rows: Vec<(String, String, Option<String>)> = Vec::new();
    for page in vault.pages() {
        for link in &page.links {
            let target = vault
                .resolve(&page.path, &link.page)
                .path()
                .map(str::to_owned);
            rows.push((page.path.clone(), link.raw.clone(), target));
        }
    }
    rows.sort_by(|a, b| {
        let key = |row: &(String, String, Option<String>)| {
            (
                row.0.clone(),
                row.1.clone(),
                row.2.clone().unwrap_or_default(),
            )
        };
        key(a).cmp(&key(b))
    });

    rows.into_iter()
        .map(|(source, raw, target)| json!({ "raw": raw, "source": source, "target": target }))
        .collect()
}

/// Where each address of more than one step lands, in the shape and order of
/// `expected.json`'s `addresses`.
fn addresses(case: &Path) -> Value {
    let config = match fs::read_to_string(case.join(CONFIG_NAME)) {
        Ok(text) => Config::parse(&text).expect("the case's config.toml parses"),
        Err(_) => Config::default(),
    };
    let tree = case.join("tree");
    let vault = Vault::load(&FsHost::new(tree.clone()), config).expect("the case loads");

    let mut rows: Vec<(String, String, Value)> = Vec::new();
    for page in vault.pages() {
        for link in &page.links {
            let Some(Fragment::Address(fragment)) = &link.fragment else {
                continue;
            };
            let base = |extra: Value| {
                let mut entry = json!({ "raw": link.raw, "source": page.path });
                for (key, value) in extra.as_object().expect("an object") {
                    entry[key] = value.clone();
                }
                entry
            };
            let entry = match (
                Address::parse(fragment),
                vault.resolve(&page.path, &link.page).path(),
            ) {
                (Err(error), _) => base(json!({ "rule": error.rule() })),
                (Ok(_), None) => base(json!({ "rule": "HMD001" })),
                (Ok(address), Some(target)) => {
                    let source = fs::read_to_string(tree.join(target)).expect("the target reads");
                    match Card::read(target, &source).locate(&address, target) {
                        Err(error) => base(json!({ "rule": error.rule() })),
                        Ok(located) => base(json!({
                            "start": located.start,
                            "end": located.end,
                            "text": located.text,
                            "digest": digest_of(&located.text),
                        })),
                    }
                }
            };
            rows.push((page.path.clone(), link.raw.clone(), entry));
        }
    }
    rows.sort_by(|a, b| (&a.0, &a.1).cmp(&(&b.0, &b.1)));
    rows.into_iter().map(|(_, _, entry)| entry).collect()
}

#[test]
fn the_corpus_has_cases() {
    assert!(!case_names().is_empty());
}

#[test]
fn every_case_resolves_as_the_canonical_implementation_does() {
    let expected_to_fail = ledger_ids("cases");
    let names = case_names();

    for id in &expected_to_fail {
        assert!(
            names.contains(id),
            "conformance-xfail.json names {id}, which is not a corpus case"
        );
    }

    let mut failures = Vec::new();
    for name in &names {
        let case = cases_dir().join(name);
        let expected = read_json(&case.join("expected.json"))["resolutions"].clone();
        assert!(
            expected.is_array(),
            "{name}: expected.json has no resolutions"
        );
        let actual = resolutions(&case);
        let expected_addresses = read_json(&case.join("expected.json"))["addresses"].clone();
        let actual_addresses = if expected_addresses.is_null() {
            Value::Null
        } else {
            addresses(&case)
        };
        let matches = actual == expected && actual_addresses == expected_addresses;

        if expected_to_fail.contains(name) {
            if matches {
                failures.push(format!(
                    "{name} is in conformance-xfail.json but now passes: remove the ledger entry"
                ));
            }
        } else if !matches {
            failures.push(format!(
                "{name}: resolutions or addresses differ\n  expected: {expected}\n  actual:   {actual}\n  expected addresses: {expected_addresses}\n  actual addresses:   {actual_addresses}"
            ));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn the_ledger_names_every_lint_rule_as_not_emitted() {
    // The crate emits no diagnostic, so every rule the canonical
    // implementation defines is a known difference and has to be written down.
    assert_eq!(ledger_ids("rules"), canonical_rules());
}
