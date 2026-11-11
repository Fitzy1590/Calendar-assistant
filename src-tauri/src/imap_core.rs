//! Read-only IMAP for the mail module: connect over TLS, list the Inbox, summarise messages. No Tauri types here,
//! so it can be tested on its own (copy this file into a scratch crate with `imap`, `native-tls`, `mailparse`,
//! `serde`). The password is passed in by the caller (it comes from the OS secure store) and is never logged.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};

#[derive(Deserialize, Clone)]
pub struct Conn {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct SyncReq {
    #[serde(flatten)]
    pub conn: Conn,
    pub since_days: u32,
    pub known_uids: Vec<u32>,
    pub known_validity: Option<u32>,
}

#[derive(Deserialize)]
pub struct BodyReq {
    #[serde(flatten)]
    pub conn: Conn,
    pub uid: u32,
}

#[derive(Serialize, Debug, PartialEq, Clone)]
pub struct Addr {
    pub name: Option<String>,
    pub address: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct Summary {
    pub uid: u32,
    pub from: Option<Addr>,
    pub to: Vec<Addr>,
    pub cc: Vec<Addr>,
    pub subject: String,
    pub date_ms: i64,
    pub seen: bool,
    pub preview: String,
    pub headers: BTreeMap<String, String>,
    pub importance: Option<String>,
}

#[derive(Serialize)]
pub struct SyncOut {
    pub uid_validity: u32,
    pub reset: bool,
    pub messages: Vec<Summary>,
    pub seen: Vec<(u32, bool)>,
    pub removed: Vec<u32>,
}

/* ---------- pure parts ---------- */

#[derive(Debug, PartialEq)]
pub struct Plan {
    pub new: Vec<u32>,     // not seen before, newest first, at most `cap`
    pub removed: Vec<u32>, // known, in the window's range, but gone from the Inbox
    pub keep: Vec<u32>,    // known and still there: only their flags are refreshed
}

pub fn plan(known: &[u32], current: &[u32], cap: usize) -> Plan {
    let have: HashSet<u32> = known.iter().copied().collect();
    let now: HashSet<u32> = current.iter().copied().collect();
    let mut new: Vec<u32> = current
        .iter()
        .copied()
        .filter(|u| !have.contains(u))
        .collect();
    new.sort_unstable_by(|a, b| b.cmp(a));
    new.truncate(cap);
    // Mail older than the search window drops out of `current` without being deleted; only call a message
    // removed when it is newer than the oldest one still in the window.
    let floor = current.iter().copied().min();
    let mut removed: Vec<u32> = match floor {
        Some(f) => known
            .iter()
            .copied()
            .filter(|u| *u >= f && !now.contains(u))
            .collect(),
        None => vec![],
    };
    removed.sort_unstable();
    let mut keep: Vec<u32> = known.iter().copied().filter(|u| now.contains(u)).collect();
    keep.sort_unstable();
    Plan { new, removed, keep }
}

/// `1-Nov-2026`: the date form IMAP's SEARCH SINCE wants.
pub fn imap_date(epoch_secs: i64) -> String {
    const MONTHS: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    let z = epoch_secs.div_euclid(86_400) + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + if month <= 2 { 1 } else { 0 };
    format!("{}-{}-{}", day, MONTHS[(month - 1) as usize], year)
}

pub fn uid_set(uids: &[u32]) -> String {
    uids.iter()
        .map(|u| u.to_string())
        .collect::<Vec<_>>()
        .join(",")
}

fn squash(s: &str, max_chars: usize) -> String {
    s.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(max_chars)
        .collect()
}

/// Tags out, scripts and styles dropped, a few entities decoded. Text only, so nothing in it can run.
pub fn strip_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let lower = html.to_ascii_lowercase();
    let bytes = html.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'<' {
            let rest = &lower[i..];
            let skip_to = ["script", "style", "head"].iter().find_map(|t| {
                if rest.starts_with(&format!("<{}", t)) {
                    rest.find(&format!("</{}", t)).map(|p| i + p)
                } else {
                    None
                }
            });
            if let Some(p) = skip_to {
                i = p;
            }
            match html[i..].find('>') {
                Some(end) => {
                    let tag = &lower[i..i + end];
                    if tag.starts_with("<br")
                        || tag.starts_with("</p")
                        || tag.starts_with("</div")
                        || tag.starts_with("</tr")
                        || tag.starts_with("</li")
                    {
                        out.push('\n');
                    }
                    i += end + 1;
                }
                None => break,
            }
        } else {
            let ch = html[i..].chars().next().unwrap();
            out.push(ch);
            i += ch.len_utf8();
        }
    }
    out.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

/// Readable text of a message (possibly cut short): the plain part if there is one, else the HTML turned into text.
pub fn readable(raw: &[u8]) -> String {
    let Ok(mail) = mailparse::parse_mail(raw) else {
        return String::from_utf8_lossy(raw).to_string();
    };
    let (mut plain, mut html) = (Vec::new(), Vec::new());
    let mut stack = vec![&mail];
    while let Some(p) = stack.pop() {
        if p.subparts.is_empty() {
            let ct = p.ctype.mimetype.to_ascii_lowercase();
            if ct == "text/plain" {
                plain.push(p.get_body().unwrap_or_default());
            } else if ct == "text/html" {
                html.push(p.get_body().unwrap_or_default());
            }
        }
        for sp in p.subparts.iter().rev() {
            stack.push(sp);
        }
    }
    if !plain.is_empty() {
        plain.join("\n")
    } else if !html.is_empty() {
        strip_html(&html.join("\n"))
    } else {
        String::new()
    }
}

fn addrs(h: &mailparse::MailHeader) -> Vec<Addr> {
    let mut out = Vec::new();
    let Ok(list) = mailparse::addrparse_header(h) else {
        return out;
    };
    for a in list.iter() {
        match a {
            mailparse::MailAddr::Single(s) => out.push(Addr {
                name: s.display_name.clone().filter(|n| !n.is_empty()),
                address: s.addr.to_lowercase(),
            }),
            mailparse::MailAddr::Group(g) => {
                for s in &g.addrs {
                    out.push(Addr {
                        name: s.display_name.clone().filter(|n| !n.is_empty()),
                        address: s.addr.to_lowercase(),
                    });
                }
            }
        }
    }
    out
}

/// Turn one fetched message (its headers, and the start of its text) into what the app shows.
pub fn summarize(uid: u32, seen: bool, header: &[u8], text: &[u8], fallback_ms: i64) -> Summary {
    let (hs, _) = mailparse::parse_headers(header).unwrap_or((Vec::new(), 0));
    let get = |k: &str| hs.iter().find(|h| h.get_key_ref().eq_ignore_ascii_case(k));
    let val = |k: &str| get(k).map(|h| h.get_value());
    let mut headers = BTreeMap::new();
    for k in [
        "list-unsubscribe",
        "list-id",
        "precedence",
        "auto-submitted",
        "message-id",
        "references",
        "in-reply-to",
    ] {
        if let Some(v) = val(k) {
            headers.insert(k.to_string(), v);
        }
    }
    let prio = val("x-priority").unwrap_or_default();
    let imp = val("importance").unwrap_or_default().to_ascii_lowercase();
    let importance = match (prio.trim().chars().next(), imp.as_str()) {
        (Some('1') | Some('2'), _) | (_, "high") => Some("high".to_string()),
        (Some('4') | Some('5'), _) | (_, "low") => Some("low".to_string()),
        _ => None,
    };
    let mut full = header.to_vec();
    if !full.ends_with(b"\r\n\r\n") {
        full.extend_from_slice(b"\r\n\r\n");
    }
    full.extend_from_slice(text);
    Summary {
        uid,
        from: get("from").map(addrs).and_then(|v| v.into_iter().next()),
        to: get("to").map(addrs).unwrap_or_default(),
        cc: get("cc").map(addrs).unwrap_or_default(),
        subject: val("subject").unwrap_or_default(),
        date_ms: val("date")
            .and_then(|d| mailparse::dateparse(&d).ok())
            .map(|s| s * 1000)
            .unwrap_or(fallback_ms),
        seen,
        preview: squash(&readable(&full), 400),
        headers,
        importance,
    }
}

/* ---------- network ---------- */

type Session = imap::Session<native_tls::TlsStream<std::net::TcpStream>>;

fn open(c: &Conn) -> Result<Session, String> {
    let tls = native_tls::TlsConnector::builder()
        .build()
        .map_err(|e| format!("Couldn't start a secure connection: {e}"))?;
    let client = imap::connect((c.host.as_str(), c.port), c.host.as_str(), &tls)
        .map_err(|e| format!("Couldn't connect to {}:{}: {e}", c.host, c.port))?;
    client
        .login(c.user.as_str(), c.password.as_str())
        .map_err(|e| format!("LOGIN failed: {}", e.0))
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn test(c: &Conn) -> Result<(), String> {
    let mut s = open(c)?;
    s.select("INBOX")
        .map_err(|e| format!("Couldn't open the Inbox: {e}"))?;
    let _ = s.logout();
    Ok(())
}

pub fn sync(r: &SyncReq) -> Result<SyncOut, String> {
    let mut s = open(&r.conn)?;
    let inbox = s
        .select("INBOX")
        .map_err(|e| format!("Couldn't open the Inbox: {e}"))?;
    let validity = inbox.uid_validity.unwrap_or(0);
    let reset = r.known_validity.map(|v| v != validity).unwrap_or(false);
    let known: Vec<u32> = if reset { vec![] } else { r.known_uids.clone() };
    let since = imap_date(now_secs() - i64::from(r.since_days) * 86_400);
    let current: Vec<u32> = s
        .uid_search(format!("SINCE {since}"))
        .map_err(|e| format!("Search failed: {e}"))?
        .into_iter()
        .collect();
    let p = plan(&known, &current, 200);

    let mut messages = Vec::new();
    for chunk in p.new.chunks(40) {
        let fetched = s
            .uid_fetch(
                uid_set(chunk),
                "(UID FLAGS BODY.PEEK[HEADER] BODY.PEEK[TEXT]<0.3000>)",
            )
            .map_err(|e| format!("Fetch failed: {e}"))?;
        for f in fetched.iter() {
            let Some(uid) = f.uid else { continue };
            let seen = f
                .flags()
                .iter()
                .any(|x| matches!(x, imap::types::Flag::Seen));
            messages.push(summarize(
                uid,
                seen,
                f.header().unwrap_or_default(),
                f.text().unwrap_or_default(),
                now_secs() * 1000,
            ));
        }
    }
    messages.sort_by(|a, b| b.date_ms.cmp(&a.date_ms));

    let mut seen = Vec::new();
    for chunk in p.keep.chunks(200) {
        let fetched = s
            .uid_fetch(uid_set(chunk), "(UID FLAGS)")
            .map_err(|e| format!("Fetch failed: {e}"))?;
        for f in fetched.iter() {
            if let Some(uid) = f.uid {
                seen.push((
                    uid,
                    f.flags()
                        .iter()
                        .any(|x| matches!(x, imap::types::Flag::Seen)),
                ));
            }
        }
    }
    let _ = s.logout();
    let removed = if reset {
        r.known_uids.clone()
    } else {
        p.removed
    };
    Ok(SyncOut {
        uid_validity: validity,
        reset,
        messages,
        seen,
        removed,
    })
}

pub fn body(r: &BodyReq) -> Result<String, String> {
    let mut s = open(&r.conn)?;
    s.select("INBOX")
        .map_err(|e| format!("Couldn't open the Inbox: {e}"))?;
    let fetched = s
        .uid_fetch(r.uid.to_string(), "BODY.PEEK[]")
        .map_err(|e| format!("Fetch failed: {e}"))?;
    let text = fetched
        .iter()
        .next()
        .and_then(|f| f.body())
        .map(readable)
        .unwrap_or_default();
    let _ = s.logout();
    Ok(text.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plan_finds_new_removed_and_kept() {
        let p = plan(&[1, 2, 3, 4], &[2, 3, 5, 6], 200);
        assert_eq!(p.new, vec![6, 5]);
        assert_eq!(p.keep, vec![2, 3]);
        // 1 is older than the oldest in the window (2): it just slid out, so it is not "removed"; 4 was deleted
        assert_eq!(p.removed, vec![4]);
    }

    #[test]
    fn plan_caps_new_mail_to_the_newest() {
        let cur: Vec<u32> = (1..=300).collect();
        let p = plan(&[], &cur, 200);
        assert_eq!(p.new.len(), 200);
        assert_eq!(p.new[0], 300);
    }

    #[test]
    fn plan_with_an_empty_window_removes_nothing() {
        let p = plan(&[1, 2], &[], 200);
        assert!(p.removed.is_empty() && p.new.is_empty() && p.keep.is_empty());
    }

    #[test]
    fn dates_are_in_imap_form() {
        assert_eq!(imap_date(0), "1-Jan-1970");
        assert_eq!(imap_date(1_700_000_000), "14-Nov-2023");
        assert_eq!(imap_date(1_709_164_800), "29-Feb-2024"); // leap day
        assert_eq!(imap_date(1_793_491_200), "1-Nov-2026");
    }

    #[test]
    fn uid_sets_join_with_commas() {
        assert_eq!(uid_set(&[4, 9, 12]), "4,9,12");
    }

    #[test]
    fn summarises_a_plain_message() {
        let h = b"From: \"Energy Co\" <Bills@EnergyCo.com>\r\nTo: me@bigpond.com, Pat <pat@x.org>\r\nSubject: =?UTF-8?B?Q2Fmw6k=?= bill\r\nDate: Tue, 14 Nov 2023 22:13:20 +0000\r\nList-Unsubscribe: <mailto:u@x.com>\r\nX-Priority: 1\r\n\r\n";
        let t = b"Amount due:   $40.00\r\nPay by 20 Nov.";
        let s = summarize(7, false, h, t, 0);
        assert_eq!(s.uid, 7);
        assert_eq!(
            s.from,
            Some(Addr {
                name: Some("Energy Co".into()),
                address: "bills@energyco.com".into()
            })
        );
        assert_eq!(s.to.len(), 2);
        assert_eq!(s.subject, "Café bill");
        assert_eq!(s.date_ms, 1_700_000_000_000);
        assert_eq!(s.preview, "Amount due: $40.00 Pay by 20 Nov.");
        assert_eq!(s.importance.as_deref(), Some("high"));
        assert_eq!(
            s.headers.get("list-unsubscribe").map(String::as_str),
            Some("<mailto:u@x.com>")
        );
        assert!(!s.seen);
    }

    #[test]
    fn prefers_the_plain_part_of_a_multipart_message_even_when_cut_short() {
        let h = b"From: a@b.com\r\nSubject: Hi\r\nContent-Type: multipart/alternative; boundary=\"XX\"\r\n\r\n";
        let t = b"--XX\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHello there\r\n--XX\r\nContent-Type: text/html\r\n\r\n<p>Hello <b>there</b></p>\r\n--XX";
        assert_eq!(summarize(1, true, h, t, 5).preview, "Hello there");
    }

    #[test]
    fn html_only_mail_becomes_text() {
        let h = b"From: a@b.com\r\nSubject: Hi\r\nContent-Type: text/html; charset=utf-8\r\n\r\n";
        let t = b"<html><head><style>p{color:red}</style></head><body><p>Total &amp; due</p><script>alert(1)</script><p>$12</p></body></html>";
        let p = summarize(1, false, h, t, 0).preview;
        assert_eq!(p, "Total & due $12");
    }

    #[test]
    fn missing_headers_do_not_panic_and_use_the_fallback_date() {
        let s = summarize(3, true, b"Subject: only\r\n\r\n", b"", 123);
        assert_eq!(s.subject, "only");
        assert!(s.from.is_none() && s.to.is_empty());
        assert_eq!(s.date_ms, 123);
        let g = summarize(4, true, b"", b"", 9);
        assert_eq!(g.subject, "");
    }

    #[test]
    fn full_body_is_readable_text() {
        let raw =
            b"From: a@b.com\r\nSubject: x\r\nContent-Type: text/plain\r\n\r\nAmount due $12\r\n";
        assert_eq!(readable(raw).trim(), "Amount due $12");
    }
}
