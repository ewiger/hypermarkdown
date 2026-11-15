//! Path arithmetic over root-relative paths.
//!
//! A path in this crate is a string of components joined by `/`, relative to
//! the namespace root, and the root itself is the empty string. The canonical
//! implementation does the same arithmetic with `pathlib`, whose behavior is
//! restated here so no answer depends on an operating system.

/// The extension of a HyperMarkdown card, and of the folder note whose
/// frontmatter a subtree inherits.
pub(crate) const SUFFIX: &str = ".hmd";

/// The card extensions in priority order: where two files compete for one
/// name, the earlier extension wins (HMD-0029).
pub(crate) const CARD_SUFFIXES: [&str; 3] = [".hmd", ".md", ".markdown"];

/// The card extension `name` ends in, if any.
pub(crate) fn card_suffix(name: &str) -> Option<&'static str> {
    CARD_SUFFIXES
        .into_iter()
        .find(|suffix| name.ends_with(suffix))
}

/// The stem of a folder note, the card a directory's own name resolves to.
pub(crate) const INDEX_STEM: &str = "index";

/// The non-empty components of `path`.
pub(crate) fn split(path: &str) -> Vec<&str> {
    path.split('/').filter(|part| !part.is_empty()).collect()
}

/// The components of the directory holding the card at `path`.
pub(crate) fn parent(path: &str) -> Vec<&str> {
    let mut parts = split(path);
    parts.pop();
    parts
}

/// `parts` with every `.` dropped and every `..` cancelled against the
/// component before it, or `None` when a `..` climbs above the root.
///
/// Nothing here follows a symbolic link, so a link cannot carry a reference out
/// of the namespace.
pub(crate) fn normalize<'a>(parts: impl IntoIterator<Item = &'a str>) -> Option<Vec<&'a str>> {
    let mut out = Vec::new();
    for part in parts {
        match part {
            "" | "." => {}
            ".." => {
                out.pop()?;
            }
            _ => out.push(part),
        }
    }
    Some(out)
}

/// The components of a card's path with its card extension removed.
pub(crate) fn page_parts(path: &str) -> Vec<&str> {
    let mut parts = split(path);
    if let Some(last) = parts.last_mut()
        && let Some(suffix) = card_suffix(last)
    {
        *last = &last[..last.len() - suffix.len()];
    }
    parts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_card_extension_is_found_at_the_end_of_a_name() {
        assert_eq!(card_suffix("tokens.hmd"), Some(".hmd"));
        assert_eq!(card_suffix("notes.md"), Some(".md"));
        assert_eq!(card_suffix("notes.markdown"), Some(".markdown"));
        assert_eq!(card_suffix("v1.2"), None);
        assert_eq!(card_suffix("image.png"), None);
    }

    #[test]
    fn dots_collapse_and_a_climb_above_the_root_is_none() {
        assert_eq!(normalize(["a", ".", "b", "..", "c"]), Some(vec!["a", "c"]));
        assert_eq!(normalize(["a", "..", ".."]), None);
        assert_eq!(normalize(["..", "a"]), None);
        assert_eq!(normalize(["a", ".."]), Some(vec![]));
    }

    #[test]
    fn a_page_is_named_by_its_path_without_the_suffix() {
        assert_eq!(
            page_parts("specs/auth/login.hmd"),
            ["specs", "auth", "login"]
        );
        assert_eq!(page_parts("v1.2.hmd"), ["v1.2"]);
        assert_eq!(page_parts("notes/guide.md"), ["notes", "guide"]);
        assert_eq!(parent("specs/auth/login.hmd"), ["specs", "auth"]);
        assert!(parent("login.hmd").is_empty());
    }
}
