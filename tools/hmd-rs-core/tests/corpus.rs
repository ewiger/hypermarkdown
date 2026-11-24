//! The conformance runner.
//!
//! Every case under `examples/conformance/cases/` is loaded and resolved, and
//! the resolutions must equal the `resolutions` of the case's `expected.json`.
//! Diagnostics are not compared, since this crate is a resolver and emits none,
//! but the three that only restate an outcome are: a reference the case expects
//! HMD001, HMD002, or HMD003 at must come out `Unresolved`, `Ambiguous` with
//! those candidates in that order, or `Escapes`, so a null target cannot hide
//! the difference between a missing card and a path out of the namespace.
//!
//! A case named in `conformance-xfail.json` is expected to differ. A ledgered
//! case that matches fails the run, because an expected failure that starts
//! succeeding and is not removed is a ledger that no longer tells the truth.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use hypermarkdown::{CONFIG_NAME, Config, FsHost, Resolution, Vault};
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

/// The outcome each of HMD001, HMD002, and HMD003 restates.
fn outcome_of(rule: &str) -> Option<&'static str> {
    match rule {
        "HMD001" => Some("unresolved"),
        "HMD002" => Some("ambiguous"),
        "HMD003" => Some("escapes"),
        _ => None,
    }
}

/// Where each reference of a case sits: `(source, line, column)` to its raw
/// text. Positions are the grammar's, shared by every implementation.
type Positions = BTreeMap<(String, u64, u64), String>;

/// The outcomes a case's expected diagnostics restate, keyed by where the
/// reference is: `{source, line, column, outcome, candidates?}`, sorted.
///
/// A diagnostic restates an outcome only for a reference the case expects to
/// resolve to nothing. An HMD003 at a reference that resolves is about a
/// later imported search path that leaves the namespace, which the
/// specification reports without changing the result.
fn expected_outcomes(expected: &Value, positions: &Positions) -> Value {
    let resolves = |source: &str, raw: &str| {
        expected["resolutions"].as_array().is_some_and(|rows| {
            rows.iter()
                .any(|r| r["source"] == source && r["raw"] == raw && !r["target"].is_null())
        })
    };
    let mut rows: Vec<Value> = expected["diagnostics"]
        .as_array()
        .expect("expected.json has diagnostics")
        .iter()
        .filter_map(|d| {
            let outcome = outcome_of(d["rule"].as_str()?)?;
            let source = d["path"].as_str()?;
            let at = (
                source.to_owned(),
                d["line"].as_u64()?,
                d["column"].as_u64()?,
            );
            if positions.get(&at).is_some_and(|raw| resolves(source, raw)) {
                return None;
            }
            let mut row = json!({
                "source": d["path"], "line": d["line"], "column": d["column"], "outcome": outcome,
            });
            if outcome == "ambiguous" {
                row["candidates"] = d["candidates"].clone();
            }
            Some(row)
        })
        .collect();
    rows.sort_by_key(|row| row.to_string());
    Value::Array(rows)
}

/// Resolves every reference of one case: its `resolutions`, in the shape and
/// order of `expected.json`'s, the outcome of every reference that did not
/// resolve, in the shape of [`expected_outcomes`], and where each reference is.
fn observed(case: &Path) -> (Value, Value, Positions) {
    // A case's `config.toml` sits beside its tree and is the tree's
    // `.hmd/config.toml`; without one the defaults are the case.
    let config = match fs::read_to_string(case.join(CONFIG_NAME)) {
        Ok(text) => Config::parse(&text).expect("the case's config.toml parses"),
        Err(_) => Config::default(),
    };
    // The tree is the vault, and its `location_path` names the namespace
    // root: the tree itself by default.
    let root = config.namespace_root(&case.join("tree"));
    let vault = Vault::load(&FsHost::new(root), config).expect("the case loads");

    let mut rows: Vec<(String, String, Option<String>)> = Vec::new();
    let mut outcomes: Vec<Value> = Vec::new();
    let mut positions = Positions::new();
    for page in vault.pages() {
        for link in &page.links {
            positions.insert(
                (page.path.clone(), link.line as u64, link.column as u64),
                link.raw.clone(),
            );
            let resolution = vault.resolve(&page.path, &link.page);
            let outcome = match &resolution {
                Resolution::Resolved { .. } => None,
                Resolution::Unresolved => Some(json!({"outcome": "unresolved"})),
                Resolution::Ambiguous { candidates } => {
                    Some(json!({"outcome": "ambiguous", "candidates": candidates}))
                }
                Resolution::Escapes => Some(json!({"outcome": "escapes"})),
            };
            if let Some(mut row) = outcome {
                row["source"] = json!(page.path);
                row["line"] = json!(link.line);
                row["column"] = json!(link.column);
                outcomes.push(row);
            }
            let target = resolution.path().map(str::to_owned);
            rows.push((page.path.clone(), link.raw.clone(), target));
        }
    }
    outcomes.sort_by_key(|row| row.to_string());
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

    let resolutions = rows
        .into_iter()
        .map(|(source, raw, target)| json!({ "raw": raw, "source": source, "target": target }))
        .collect();
    (resolutions, Value::Array(outcomes), positions)
}

#[test]
fn the_corpus_has_cases() {
    assert!(!case_names().is_empty());
}

#[test]
fn every_case_resolves_as_the_specification_says() {
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
        let expected_json = read_json(&case.join("expected.json"));
        let expected = expected_json["resolutions"].clone();
        assert!(
            expected.is_array(),
            "{name}: expected.json has no resolutions"
        );
        let (resolutions, outcomes, positions) = observed(&case);
        let expected = (expected, expected_outcomes(&expected_json, &positions));
        let actual = (resolutions, outcomes);
        let matches = actual == expected;

        if expected_to_fail.contains(name) {
            if matches {
                failures.push(format!(
                    "{name} is in conformance-xfail.json but now passes: remove the ledger entry"
                ));
            }
        } else if !matches {
            failures.push(format!(
                "{name}: resolutions differ\n  expected: {}\n             {}\n  actual:   {}\n             {}",
                expected.0, expected.1, actual.0, actual.1
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
