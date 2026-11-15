//! Path arithmetic over root-relative paths.
//!
//! A path in this crate is a string of components joined by `/`, relative to
//! the namespace root, and the root itself is the empty string. The canonical
//! implementation does the same arithmetic with `pathlib`, whose behavior is
//! restated here so no answer depends on an operating system.

/// The suffix every card's file name carries.
pub(crate) const SUFFIX: &str = ".hmd";

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

/// `name` with its suffix replaced by `.hmd`, or with `.hmd` added when it has
/// none, as `PurePath.with_suffix(".hmd")` does.
///
/// A name has a suffix when something other than dots stands before its last
/// dot, so `v1.2` becomes `v1.hmd` and `.notes` becomes `.notes.hmd`.
pub(crate) fn with_hmd_suffix(name: &str) -> String {
    let stem = match name.rfind('.') {
        Some(dot) if !name[..dot].trim_matches('.').is_empty() => &name[..dot],
        _ => name,
    };
    format!("{stem}{SUFFIX}")
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

/// The components of a card's path with the `.hmd` suffix removed.
pub(crate) fn page_parts(path: &str) -> Vec<&str> {
    let mut parts = split(path);
    if let Some(last) = parts.last_mut() {
        *last = last.strip_suffix(SUFFIX).unwrap_or(last);
    }
    parts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_suffix_is_replaced_and_a_missing_one_is_added() {
        assert_eq!(with_hmd_suffix("tokens"), "tokens.hmd");
        assert_eq!(with_hmd_suffix("v1.2"), "v1.hmd");
        assert_eq!(with_hmd_suffix("notes.md"), "notes.hmd");
        assert_eq!(with_hmd_suffix(".notes"), ".notes.hmd");
        assert_eq!(with_hmd_suffix("notes."), "notes.hmd");
        assert_eq!(with_hmd_suffix(".."), "...hmd");
        assert_eq!(with_hmd_suffix("..a.b"), "..a.hmd");
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
        assert_eq!(parent("specs/auth/login.hmd"), ["specs", "auth"]);
        assert!(parent("login.hmd").is_empty());
    }
}
