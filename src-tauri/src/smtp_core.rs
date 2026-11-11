//! Sending mail over SMTP for accounts that use a password (Bigpond/Telstra, Yahoo, iCloud…). No Tauri types here, so it
//! can be tested on its own. The password is passed in by the caller (from the OS secure store) and is never logged.

use base64::Engine;
use lettre::message::{header::ContentType, Attachment, Mailbox, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};
use serde::Deserialize;

#[derive(Deserialize, Clone, Debug)]
pub struct Person {
    pub name: Option<String>,
    pub address: String,
}

#[derive(Deserialize, Clone, Debug)]
pub struct File {
    pub name: String,
    pub mime: String,
    pub data: String, // base64
}

#[derive(Deserialize, Clone, Debug)]
pub struct SendReq {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub from: Person,
    pub to: Vec<Person>,
    pub cc: Vec<Person>,
    pub bcc: Vec<Person>,
    pub subject: String,
    pub body: String,
    pub in_reply_to: Option<String>,
    pub references: Option<String>,
    pub attachments: Vec<File>,
}

fn mailbox(p: &Person) -> Result<Mailbox, String> {
    let addr = p
        .address
        .trim()
        .parse()
        .map_err(|_| format!("“{}” isn't a valid email address.", p.address))?;
    Ok(Mailbox::new(p.name.clone().filter(|n| !n.is_empty()), addr))
}

/// The message itself: headers (with threading), a plain-text body, and any attachments.
pub fn build_message(r: &SendReq) -> Result<Message, String> {
    if r.to.is_empty() && r.cc.is_empty() && r.bcc.is_empty() {
        return Err("Add at least one recipient.".into());
    }
    let mut b = Message::builder()
        .from(mailbox(&r.from)?)
        .subject(r.subject.clone());
    for p in &r.to {
        b = b.to(mailbox(p)?);
    }
    for p in &r.cc {
        b = b.cc(mailbox(p)?);
    }
    for p in &r.bcc {
        b = b.bcc(mailbox(p)?);
    }
    if let Some(v) = r.in_reply_to.as_ref().filter(|v| !v.is_empty()) {
        b = b.in_reply_to(v.clone());
    }
    if let Some(v) = r.references.as_ref().filter(|v| !v.is_empty()) {
        b = b.references(v.clone());
    }
    let result = if r.attachments.is_empty() {
        b.body(r.body.clone())
    } else {
        let mut parts = MultiPart::mixed().singlepart(SinglePart::plain(r.body.clone()));
        for f in &r.attachments {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(f.data.trim())
                .map_err(|_| format!("Couldn't read the attachment “{}”.", f.name))?;
            let ct = ContentType::parse(&f.mime)
                .unwrap_or_else(|_| ContentType::parse("application/octet-stream").unwrap());
            parts = parts.singlepart(Attachment::new(f.name.clone()).body(bytes, ct));
        }
        b.multipart(parts)
    };
    result.map_err(|e| format!("Couldn't build the message: {e}"))
}

/// Port 465 uses TLS from the first byte; anything else (587) starts plain and upgrades with STARTTLS.
pub fn send(r: &SendReq) -> Result<(), String> {
    let email = build_message(r)?;
    let creds = Credentials::new(r.user.clone(), r.password.clone());
    let builder = if r.port == 465 {
        SmtpTransport::relay(&r.host)
    } else {
        SmtpTransport::starttls_relay(&r.host)
    };
    let mailer = builder
        .map_err(|e| format!("Couldn't set up the outgoing server {}: {e}", r.host))?
        .port(r.port)
        .credentials(creds)
        .build();
    mailer.send(&email).map(|_| ()).map_err(|e| {
        let m = e.to_string();
        if m.to_lowercase().contains("auth") || m.contains("535") {
            format!("LOGIN failed: the outgoing server refused the address or password ({m})")
        } else {
            format!("Couldn't send through {}:{}: {m}", r.host, r.port)
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req() -> SendReq {
        SendReq {
            host: "smtp.telstra.com".into(),
            port: 465,
            user: "me@bigpond.com".into(),
            password: "x".into(),
            from: Person {
                name: Some("Luke".into()),
                address: "me@bigpond.com".into(),
            },
            to: vec![Person {
                name: Some("Sam Rivera".into()),
                address: "sam@x.com".into(),
            }],
            cc: vec![],
            bcc: vec![],
            subject: "Re: Booking café".into(),
            body: "Hello\nWorld".into(),
            in_reply_to: Some("<orig@x.com>".into()),
            references: Some("<a@x.com> <orig@x.com>".into()),
            attachments: vec![],
        }
    }

    fn text(m: &Message) -> String {
        String::from_utf8_lossy(&m.formatted()).to_string()
    }

    #[test]
    fn builds_a_threaded_message() {
        let s = text(&build_message(&req()).unwrap());
        assert!(s.contains("<sam@x.com>") && s.contains("Sam Rivera"), "{s}");
        assert!(s.contains("In-Reply-To: <orig@x.com>"));
        assert!(s.contains("References: <a@x.com> <orig@x.com>"));
        assert!(
            s.contains("Subject: Re: Booking =?utf-8?"),
            "non-ASCII subject is encoded: {s}"
        );
        assert!(s.contains("Hello"));
    }

    #[test]
    fn adds_attachments() {
        let mut r = req();
        r.attachments = vec![File {
            name: "quote.pdf".into(),
            mime: "application/pdf".into(),
            data: base64::engine::general_purpose::STANDARD.encode(b"PDFDATA"),
        }];
        let s = text(&build_message(&r).unwrap());
        assert!(s.contains("multipart/mixed"));
        assert!(s.contains("quote.pdf"));
    }

    #[test]
    fn refuses_no_recipients_and_bad_addresses() {
        let mut r = req();
        r.to.clear();
        assert!(build_message(&r).unwrap_err().contains("recipient"));
        let mut r = req();
        r.to[0].address = "nope".into();
        assert!(build_message(&r).unwrap_err().contains("valid"));
        let mut r = req();
        r.attachments = vec![File {
            name: "a".into(),
            mime: "x".into(),
            data: "!!!".into(),
        }];
        assert!(build_message(&r).unwrap_err().contains("attachment"));
    }
}
