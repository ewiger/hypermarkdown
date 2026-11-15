//! Frontmatter: the YAML block a card may open with, and the two reserved keys
//! the resolver reads from it.
//!
//! `use` turns a feature on or off for the card (`autodiscovery` or
//! `no_autodiscovery`), and `import` holds the card's import statements. Every
//! other key belongs to the author and is not examined. An entry that is
//! malformed is skipped, and frontmatter that is not a YAML mapping
//! contributes nothing, exactly as if the card had none.

use std::fmt;

use serde::de::{Deserialize, Deserializer, Error as _, MapAccess, SeqAccess, Visitor};

use crate::imports::Import;
use crate::text;

/// The line that opens and closes frontmatter.
const FENCE: &str = "---";

/// The YAML key that merges another mapping into the one holding it.
const MERGE_KEY: &str = "<<";

/// The reserved keys of one card, as far as the resolver reads them.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct Card {
    /// What the card's `use` key says about autodiscovery, if anything.
    pub(crate) autodiscovery: Option<bool>,
    /// The card's well-formed import statements, in the order written.
    pub(crate) imports: Vec<Import>,
}

/// Splits `text` into its raw YAML and the byte offset its body starts at.
///
/// The fence must be the card's first line and must close with another `---`
/// line. Anything else is a card with no frontmatter, and its body starts at
/// offset 0.
pub(crate) fn split(text: &str) -> (Option<&str>, usize) {
    if !text.starts_with(FENCE) {
        return (None, 0);
    }
    let lines = text::lines_with_ends(text);
    let Some(first) = lines.first() else {
        return (None, 0);
    };
    if text::strip_eol(first) != FENCE {
        return (None, 0);
    }

    let mut offset = first.len();
    for line in &lines[1..] {
        if text::strip_eol(line) == FENCE {
            return (Some(&text[first.len()..offset]), offset + line.len());
        }
        offset += line.len();
    }
    (None, 0)
}

/// Reads the reserved keys out of raw frontmatter YAML.
pub(crate) fn card(raw: &str) -> Card {
    let Ok(Yaml::Mapping(entries)) = serde_yaml_ng::from_str::<Yaml>(raw) else {
        return Card::default();
    };
    let Some(entries) = merged(entries) else {
        return Card::default();
    };

    // A key written twice keeps its last value.
    let get = |key: &str| {
        entries
            .iter()
            .rev()
            .find(|(name, _)| matches!(name, Yaml::String(name) if name == key))
            .map(|(_, value)| value)
    };
    Card {
        autodiscovery: autodiscovery(get("use")),
        imports: strings(get("import"))
            .into_iter()
            .filter_map(Import::parse)
            .collect(),
    }
}

/// A YAML value, kept only as far as the reserved keys need it.
///
/// A mapping is a list of entries in the order written, so a key written twice
/// is two entries: the canonical reader keeps the last of them where a map
/// type would refuse the document.
#[derive(Debug, Clone, PartialEq)]
enum Yaml {
    /// A string scalar.
    String(String),
    /// A sequence.
    Sequence(Vec<Yaml>),
    /// A mapping, as its entries in the order written.
    Mapping(Vec<(Yaml, Yaml)>),
    /// Null, a boolean or a number.
    Other,
}

impl<'de> Deserialize<'de> for Yaml {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct YamlVisitor;

        impl<'de> Visitor<'de> for YamlVisitor {
            type Value = Yaml;

            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("a YAML value without a custom tag")
            }

            fn visit_str<E>(self, value: &str) -> Result<Yaml, E> {
                Ok(Yaml::String(value.to_owned()))
            }

            fn visit_bool<E>(self, _: bool) -> Result<Yaml, E> {
                Ok(Yaml::Other)
            }

            fn visit_i64<E>(self, _: i64) -> Result<Yaml, E> {
                Ok(Yaml::Other)
            }

            fn visit_u64<E>(self, _: u64) -> Result<Yaml, E> {
                Ok(Yaml::Other)
            }

            fn visit_f64<E>(self, _: f64) -> Result<Yaml, E> {
                Ok(Yaml::Other)
            }

            fn visit_unit<E>(self) -> Result<Yaml, E> {
                Ok(Yaml::Other)
            }

            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Yaml, A::Error> {
                let mut items = Vec::new();
                while let Some(item) = seq.next_element()? {
                    items.push(item);
                }
                Ok(Yaml::Sequence(items))
            }

            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Yaml, A::Error> {
                let mut entries = Vec::new();
                while let Some((key, value)) = map.next_entry::<Yaml, Yaml>()? {
                    // The canonical reader refuses a key that is a sequence
                    // or a mapping.
                    if matches!(key, Yaml::Sequence(_) | Yaml::Mapping(_)) {
                        return Err(A::Error::custom("a mapping key must be a scalar"));
                    }
                    entries.push((key, value));
                }
                Ok(Yaml::Mapping(entries))
            }
        }

        deserializer.deserialize_any(YamlVisitor)
    }
}

/// The entries of a mapping with every `<<` merge key replaced by the entries
/// it merges in, or `None` when a merge key holds something other than a
/// mapping or a list of mappings.
///
/// Merged entries come first, so a key the mapping states itself wins; among
/// the mappings of one list the earlier wins.
fn merged(entries: Vec<(Yaml, Yaml)>) -> Option<Vec<(Yaml, Yaml)>> {
    let mut merges = Vec::new();
    let mut own = Vec::new();
    for (key, value) in entries {
        if !matches!(&key, Yaml::String(name) if name == MERGE_KEY) {
            own.push((key, value));
            continue;
        }
        match value {
            Yaml::Mapping(inner) => merges.extend(merged(inner)?),
            Yaml::Sequence(items) => {
                let mut each = Vec::new();
                for item in items {
                    let Yaml::Mapping(inner) = item else {
                        return None;
                    };
                    each.push(merged(inner)?);
                }
                merges.extend(each.into_iter().rev().flatten());
            }
            _ => return None,
        }
    }
    merges.extend(own);
    Some(merges)
}

/// The string entries of a key that holds one string or a list.
fn strings(value: Option<&Yaml>) -> Vec<&str> {
    match value {
        Some(Yaml::String(one)) => vec![one],
        Some(Yaml::Sequence(many)) => many
            .iter()
            .filter_map(|item| match item {
                Yaml::String(text) => Some(text.as_str()),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

/// What a `use` key says about autodiscovery; the last entry naming it wins.
fn autodiscovery(value: Option<&Yaml>) -> Option<bool> {
    strings(value)
        .into_iter()
        .filter_map(|entry| match text::strip(entry) {
            "autodiscovery" => Some(true),
            "no_autodiscovery" => Some(false),
            _ => None,
        })
        .next_back()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frontmatter_is_the_block_between_two_fences() {
        let text = "---\nuse: autodiscovery\n---\nbody\n";
        assert_eq!(split(text), (Some("use: autodiscovery\n"), 27));
        assert_eq!(&text[27..], "body\n");
    }

    #[test]
    fn a_card_without_a_closed_fence_has_no_frontmatter() {
        assert_eq!(split("body\n---\n"), (None, 0));
        assert_eq!(split("---\nuse: autodiscovery\n"), (None, 0));
        assert_eq!(split("----\na: 1\n---\n"), (None, 0));
        assert_eq!(split("--- \na: 1\n---\n"), (None, 0));
        assert_eq!(split(" ---\na: 1\n---\n"), (None, 0));
    }

    #[test]
    fn empty_frontmatter_is_frontmatter() {
        assert_eq!(split("---\n---\n[[a]]"), (Some(""), 8));
        assert_eq!(card(""), Card::default());
    }

    #[test]
    fn use_takes_one_string_or_a_list() {
        assert_eq!(card("use: no_autodiscovery\n").autodiscovery, Some(false));
        assert_eq!(card("use: [autodiscovery]\n").autodiscovery, Some(true));
        assert_eq!(
            card("use:\n  - autodiscovery\n  - no_autodiscovery\n").autodiscovery,
            Some(false)
        );
        assert_eq!(card("tags: [a]\n").autodiscovery, None);
    }

    #[test]
    fn a_malformed_use_entry_is_skipped() {
        assert_eq!(card("use: no_autodiscovry\n").autodiscovery, None);
        assert_eq!(
            card("use: [3, true, autodiscovery]\n").autodiscovery,
            Some(true)
        );
        assert_eq!(card("use: {autodiscovery: false}\n").autodiscovery, None);
    }

    #[test]
    fn import_takes_one_statement_or_a_list() {
        let one = card("import: from ./a import x\n");
        assert_eq!(one.imports.len(), 1);
        let many = card("import:\n  - from ./a import x\n  - nonsense\n  - from /b import *\n");
        assert_eq!(many.imports.len(), 2);
        assert!(many.imports[1].wildcard);
    }

    #[test]
    fn a_key_written_twice_keeps_its_last_value() {
        assert_eq!(
            card("use: autodiscovery\nuse: no_autodiscovery\n").autodiscovery,
            Some(false)
        );
        // A duplicate anywhere else does not spoil the reserved keys.
        assert_eq!(
            card("meta: {a: 1, a: 2}\nuse: no_autodiscovery\n").autodiscovery,
            Some(false)
        );
    }

    #[test]
    fn an_alias_and_a_merge_key_are_followed() {
        assert_eq!(
            card("a: &x [no_autodiscovery]\nuse: *x\n").autodiscovery,
            Some(false)
        );
        assert_eq!(
            card("base: &b {use: no_autodiscovery}\n<<: *b\n").autodiscovery,
            Some(false)
        );
        // A key the mapping states itself beats a merged one, wherever the
        // merge is written, and the earlier mapping of a merged list wins.
        assert_eq!(
            card("use: autodiscovery\n<<: {use: no_autodiscovery}\n").autodiscovery,
            Some(true)
        );
        assert_eq!(
            card("<<: [{use: no_autodiscovery}, {use: autodiscovery}]\n").autodiscovery,
            Some(false)
        );
        assert_eq!(card("<<: 3\nuse: autodiscovery\n"), Card::default());
    }

    #[test]
    fn a_key_that_is_not_a_scalar_spoils_the_frontmatter() {
        assert_eq!(
            card("? [a, b]\n: 1\nuse: no_autodiscovery\n"),
            Card::default()
        );
        assert_eq!(card("!custom {use: no_autodiscovery}\n"), Card::default());
    }

    #[test]
    fn frontmatter_that_is_not_a_mapping_contributes_nothing() {
        assert_eq!(card("- a\n- b\n"), Card::default());
        assert_eq!(card("use: [autodiscovery\n"), Card::default());
        assert_eq!(card("just a string\n"), Card::default());
    }
}
