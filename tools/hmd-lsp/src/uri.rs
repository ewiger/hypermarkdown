//! `file:` URIs and the paths they name.
//!
//! A client names a document by URI, and the resolver names a card by path.
//! Only the `file` scheme has a path: a document under any other scheme, such
//! as an untitled buffer, belongs to no vault.
//!
//! Each function takes the platform as an argument, so the Windows form is
//! tested on every platform.

use std::path::{Path, PathBuf};

/// Whether the server is running on Windows.
pub const WINDOWS: bool = cfg!(windows);

/// The path a `file:` URI names, or `None` when `uri` is not one.
///
/// `windows` selects the Windows form: `file:///C:/a/b` is `C:\a\b`, and
/// `file://server/share/a` is `\\server\share\a`.
pub fn to_path(uri: &str, windows: bool) -> Option<PathBuf> {
    let rest = strip_scheme(uri)?;
    let rest = rest.strip_prefix("//").unwrap_or(rest);
    let (authority, path) = match rest.find('/') {
        Some(slash) => rest.split_at(slash),
        None => (rest, ""),
    };
    let path = decode(path)?;
    let local = authority.is_empty() || authority.eq_ignore_ascii_case("localhost");
    if !windows {
        return local.then(|| PathBuf::from(path));
    }
    let path = path.replace('/', "\\");
    if !local {
        return Some(PathBuf::from(format!("\\\\{authority}{path}")));
    }
    // `\C:\a` is `C:\a`. A client may send the drive letter in either case.
    let path = path.strip_prefix('\\').unwrap_or(&path);
    Some(PathBuf::from(path))
}

/// The `file:` URI of an absolute path, or `None` when the path is not valid
/// Unicode.
pub fn from_path(path: &Path, windows: bool) -> Option<String> {
    let path = path.to_str()?;
    if !windows {
        return Some(format!("file://{}", encode(path)));
    }
    let path = path.replace('\\', "/");
    Some(match path.strip_prefix("//") {
        // A share: the server is the authority.
        Some(share) => format!("file://{}", encode(share)),
        None => format!("file:///{}", encode(&path)),
    })
}

/// `uri` without `file:`, compared without case as a scheme is.
fn strip_scheme(uri: &str) -> Option<&str> {
    let scheme = uri.get(..5)?;
    scheme.eq_ignore_ascii_case("file:").then(|| &uri[5..])
}

/// Decodes the percent escapes of a URI path. `None` when an escape is
/// malformed or the result is not UTF-8.
fn decode(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut at = 0;
    while at < bytes.len() {
        if bytes[at] == b'%' {
            let hex = text.get(at + 1..at + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            at += 3;
        } else {
            out.push(bytes[at]);
            at += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// Encodes a path for a URI: every byte except an unreserved character, `/`
/// and `:` becomes a percent escape.
fn encode(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    for byte in path.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' | b':' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_unix_path_round_trips() {
        let path = Path::new("/home/a b/ünï.hmd");
        let uri = from_path(path, false).unwrap();
        assert_eq!(uri, "file:///home/a%20b/%C3%BCn%C3%AF.hmd");
        assert_eq!(to_path(&uri, false).unwrap(), path);
    }

    #[test]
    fn a_windows_drive_path_round_trips() {
        let uri = from_path(Path::new("C:\\vault\\a b.hmd"), true).unwrap();
        assert_eq!(uri, "file:///C:/vault/a%20b.hmd");
        assert_eq!(
            to_path(&uri, true).unwrap(),
            PathBuf::from("C:\\vault\\a b.hmd")
        );
    }

    #[test]
    fn an_escaped_colon_after_the_drive_letter_is_read() {
        assert_eq!(
            to_path("file:///c%3A/vault/a.hmd", true).unwrap(),
            PathBuf::from("c:\\vault\\a.hmd")
        );
    }

    #[test]
    fn a_windows_share_round_trips() {
        let uri = from_path(Path::new("\\\\server\\share\\a.hmd"), true).unwrap();
        assert_eq!(uri, "file://server/share/a.hmd");
        assert_eq!(
            to_path(&uri, true).unwrap(),
            PathBuf::from("\\\\server\\share\\a.hmd")
        );
    }

    #[test]
    fn localhost_is_this_machine() {
        assert_eq!(
            to_path("file://localhost/a/b.hmd", false).unwrap(),
            PathBuf::from("/a/b.hmd")
        );
    }

    #[test]
    fn another_scheme_has_no_path() {
        assert_eq!(to_path("untitled:Untitled-1", false), None);
        assert_eq!(to_path("vscode-vfs://github/a/b.hmd", false), None);
    }

    #[test]
    fn a_remote_authority_has_no_path_outside_windows() {
        assert_eq!(to_path("file://server/share/a.hmd", false), None);
    }

    #[test]
    fn a_malformed_escape_has_no_path() {
        assert_eq!(to_path("file:///a%2", false), None);
        assert_eq!(to_path("file:///a%zz", false), None);
    }
}
