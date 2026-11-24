//! The `from <ref> import <names>` statement of the `import` frontmatter key.
//!
//! A statement names a directory and either binds cards from it by name or,
//! with `*`, adds the directory to the places a bare reference is looked up.
//! The directory is absolute (`/shared`) or relative (`./shared`,
//! `../shared`), never bare: a bare one would have to be resolved by the rules
//! the import itself feeds.

use crate::text;

/// One name an import statement binds.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Binding {
    /// The name of the card in the imported directory.
    pub name: String,
    /// The name the importing card refers to it by: the alias after `as`, or
    /// `name` when the statement gives none.
    pub local: String,
}

/// One parsed `from <ref> import <names>` statement.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Import {
    /// The directory imported from, as written: `/shared`, `./shared` or
    /// `../shared`.
    pub directory: String,
    /// Whether the statement is `import *`, which adds the directory to the
    /// places a bare reference is looked up.
    pub wildcard: bool,
    /// The names the statement binds, in the order written; empty for a
    /// wildcard.
    pub bindings: Vec<Binding>,
}

impl Import {
    /// Parses one statement, or returns `None` when it is malformed.
    pub fn parse(statement: &str) -> Option<Import> {
        let statement = text::strip(statement);

        // `from`, whitespace, a directory, whitespace, `import`, whitespace,
        // and the names, which may not hold a newline.
        let rest = statement.strip_prefix("from")?;
        let rest = skip_space(rest)?;
        let split = rest.find(text::is_space)?;
        let (directory, rest) = rest.split_at(split);
        let rest = skip_space(rest)?;
        let rest = rest.strip_prefix("import")?;
        let names = skip_space(rest)?;
        if names.is_empty() || names.contains('\n') {
            return None;
        }

        let qualified = ["/", "./", "../"]
            .iter()
            .any(|prefix| directory.starts_with(prefix));
        if !qualified {
            return None;
        }

        if names == "*" {
            return Some(Import {
                directory: directory.to_owned(),
                wildcard: true,
                bindings: Vec::new(),
            });
        }

        let bindings = names.split(',').map(binding).collect::<Option<Vec<_>>>()?;
        Some(Import {
            directory: directory.to_owned(),
            wildcard: false,
            bindings,
        })
    }
}

/// Whether `c` is `WS` in the import grammar: a space or a tab.
fn is_ws(c: char) -> bool {
    c == ' ' || c == '\t'
}

/// `text` without its leading spaces and tabs, or `None` when it has none.
fn skip_space(text: &str) -> Option<&str> {
    let rest = text.trim_start_matches(is_ws);
    (rest.len() < text.len()).then_some(rest)
}

/// Whether `name` is an import-name: a segment with no whitespace in it, so
/// no `/`, no reserved character, and no `:`.
fn is_import_name(name: &str) -> bool {
    !name.is_empty()
        && !name
            .chars()
            .any(|c| text::is_space(c) || matches!(c, '/' | '[' | ']' | '|' | '#' | '^' | ':'))
}

/// Reads `<name>` or `<name> as <alias>`, with spaces or tabs between the
/// words and on either side.
fn binding(part: &str) -> Option<Binding> {
    let words: Vec<&str> = part.split(is_ws).filter(|w| !w.is_empty()).collect();
    let (name, local) = match words[..] {
        // A `*` among names is refused; it stands only as the whole list.
        [name] if name != "*" => (name, name),
        [name, "as", alias] => (name, alias),
        _ => return None,
    };
    if !is_import_name(name) || !is_import_name(local) {
        return None;
    }
    Some(Binding {
        name: name.to_owned(),
        local: local.to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pairs(import: &Import) -> Vec<(&str, &str)> {
        import
            .bindings
            .iter()
            .map(|b| (b.name.as_str(), b.local.as_str()))
            .collect()
    }

    #[test]
    fn a_named_import_binds_each_name_to_itself() {
        let import = Import::parse("from ../shared import tokens, glossary").unwrap();
        assert_eq!(import.directory, "../shared");
        assert!(!import.wildcard);
        assert_eq!(
            pairs(&import),
            [("tokens", "tokens"), ("glossary", "glossary")]
        );
    }

    #[test]
    fn as_binds_an_alias() {
        let import = Import::parse("  from /shared   import tokens as shared-tokens , x ").unwrap();
        assert_eq!(import.directory, "/shared");
        assert_eq!(pairs(&import), [("tokens", "shared-tokens"), ("x", "x")]);
    }

    #[test]
    fn a_star_imports_the_directory() {
        let import = Import::parse("from ./lib import *").unwrap();
        assert!(import.wildcard);
        assert!(import.bindings.is_empty());
    }

    #[test]
    fn a_bare_directory_is_refused() {
        assert_eq!(Import::parse("from shared import tokens"), None);
        assert_eq!(Import::parse("from .shared import tokens"), None);
    }

    #[test]
    fn a_malformed_statement_is_refused() {
        for statement in [
            "",
            "import tokens",
            "from ./a",
            "from ./a import",
            "from ./a import a,",
            "from ./a import a, *",
            "from ./a import a b",
            "from ./a import a as",
            "from ./a import a/b",
            "from ./a import a as b/c",
            "from ./a import a\nb",
            "from./a import a",
            "from ./a importa",
        ] {
            assert_eq!(Import::parse(statement), None, "{statement:?} was accepted");
        }
    }

    #[test]
    fn ws_is_spaces_and_tabs_only() {
        let import = Import::parse("from\t./a\timport\ta,b , c\t,\td\tas\te").unwrap();
        assert_eq!(
            pairs(&import),
            [("a", "a"), ("b", "b"), ("c", "c"), ("d", "e")]
        );
        for statement in [
            "from\u{a0}./a import a",
            "from ./a import\u{a0}a",
            "from ./a import a,\u{a0}b",
            "from ./a import a\u{a0}as b",
            "from ./a import x:y",
            "from ./a import a as x#y",
            "From ./a import a",
            "from ./a Import a",
            "from ./a import a AS b",
        ] {
            assert_eq!(Import::parse(statement), None, "{statement:?} was accepted");
        }
    }

    #[test]
    fn a_name_may_be_the_word_as() {
        let import = Import::parse("from ./a import as as b").unwrap();
        assert_eq!(pairs(&import), [("as", "b")]);
    }
}
