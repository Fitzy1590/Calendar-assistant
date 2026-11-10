//! Pure checks for the direct-download updater (no Tauri types, so they test on their own).

/// Installers may only come from this project's GitHub releases.
pub const PREFIX: &str = "https://github.com/Fitzy1590/Calendar-assistant/releases/download/";

fn valid_name(n: &str) -> bool {
    n.len() < 100
        && n.ends_with("-setup.exe")
        && n.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
}

pub fn file_name(url: &str) -> Option<&str> {
    url.rsplit('/').next().filter(|n| valid_name(n))
}

pub fn valid_url(url: &str) -> bool {
    url.starts_with(PREFIX)
        && !url.contains("..")
        && !url.contains('?')
        && !url.contains('#')
        && file_name(url).is_some()
}

/// GitHub's `sha256:<64 hex>` (or bare hex) as lower-case hex.
pub fn parse_digest(s: &str) -> Option<String> {
    let h = s
        .trim()
        .strip_prefix("sha256:")
        .unwrap_or(s.trim())
        .to_ascii_lowercase();
    (h.len() == 64 && h.bytes().all(|b| b.is_ascii_hexdigit())).then_some(h)
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_this_projects_release_installers_are_allowed() {
        let ok = "https://github.com/Fitzy1590/Calendar-assistant/releases/download/v0.2.0/Calendar-Assistant_0.2.0_x64-setup.exe";
        assert!(valid_url(ok));
        assert_eq!(
            file_name(ok),
            Some("Calendar-Assistant_0.2.0_x64-setup.exe")
        );
        for bad in [
            "http://github.com/Fitzy1590/Calendar-assistant/releases/download/v1/a-setup.exe",
            "https://evil.example/Fitzy1590/Calendar-assistant/releases/download/v1/a-setup.exe",
            "https://github.com/Other/Calendar-assistant/releases/download/v1/a-setup.exe",
            "https://github.com/Fitzy1590/Calendar-assistant/releases/download/v1/a.msi",
            "https://github.com/Fitzy1590/Calendar-assistant/releases/download/../x/a-setup.exe",
            "https://github.com/Fitzy1590/Calendar-assistant/releases/download/v1/a-setup.exe?x=1",
            "https://github.com/Fitzy1590/Calendar-assistant/releases/download/v1/a b-setup.exe",
            "https://github.com/Fitzy1590/Calendar-assistant/releases/download/v1/",
        ] {
            assert!(!valid_url(bad), "{bad}");
        }
    }

    #[test]
    fn digests_parse_and_reject_junk() {
        let h = "A".repeat(64);
        assert_eq!(parse_digest(&format!("sha256:{h}")), Some("a".repeat(64)));
        assert_eq!(parse_digest(&h), Some("a".repeat(64)));
        assert_eq!(parse_digest("sha256:abc"), None);
        assert_eq!(parse_digest(&"g".repeat(64)), None);
        assert_eq!(parse_digest(""), None);
    }

    #[test]
    fn hex_is_lowercase_and_padded() {
        assert_eq!(hex(&[0, 15, 255]), "000fff");
    }
}
