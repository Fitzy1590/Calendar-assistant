//! What happens when the app can't start or crashes on the native side.
//!
//! Release builds have no console window, so without this a startup failure just makes the window
//! flash and vanish. Instead we:
//!   1. save a crash report to %LOCALAPPDATA%\com.fitzy.calendarassistant\crash-reports\
//!   2. show a plain-English Windows message: what went wrong, and buttons to get the fix,
//!      report the problem (a prefilled GitHub issue), or close.

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const REPO: &str = "Fitzy1590/Calendar-assistant";
const APP_ID: &str = "com.fitzy.calendarassistant";
/// Microsoft's Evergreen WebView2 Runtime download page.
pub const WEBVIEW2_URL: &str = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

pub enum Problem {
    /// The WebView2 runtime is missing or can't be found.
    MissingWebView2(String),
    /// Tauri failed while building the window or running setup.
    Startup(String),
    /// A Rust panic anywhere in the native code.
    Panic(String),
}

struct Explained {
    title: &'static str,
    text: String,
    fix_label: &'static str,
    fix_url: String,
    detail: String,
}

fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

fn explain(p: &Problem) -> Explained {
    let releases = format!("https://github.com/{REPO}/releases/latest");
    match p {
        Problem::MissingWebView2(d) => Explained {
            title: "Calendar Assistant can't start",
            text: "This PC is missing Microsoft Edge WebView2 Runtime, a free Windows component that \
                   Calendar Assistant uses to draw its window.\n\nInstall it from Microsoft (it takes a \
                   minute or two), then open Calendar Assistant again."
                .into(),
            fix_label: "Download WebView2 from Microsoft",
            fix_url: WEBVIEW2_URL.into(),
            detail: d.clone(),
        },
        Problem::Startup(d) if looks_like_webview(d) => Explained {
            title: "Calendar Assistant can't start",
            text: "Microsoft Edge WebView2 Runtime on this PC isn't working properly, so Calendar \
                   Assistant can't open its window.\n\nReinstalling WebView2 from Microsoft usually \
                   fixes this. Then open Calendar Assistant again."
                .into(),
            fix_label: "Download WebView2 from Microsoft",
            fix_url: WEBVIEW2_URL.into(),
            detail: d.clone(),
        },
        Problem::Startup(d) => Explained {
            title: "Calendar Assistant can't start",
            text: format!(
                "Calendar Assistant couldn't open its window.\n\nWhat Windows reported: {}\n\nInstalling \
                 the latest version usually fixes this. Your calendar and notes are kept.",
                short(d)
            ),
            fix_label: "Get the latest version",
            fix_url: releases,
            detail: d.clone(),
        },
        Problem::Panic(d) => Explained {
            title: "Calendar Assistant has to close",
            text: format!(
                "Calendar Assistant hit an unexpected problem and has to close.\n\nWhat went wrong: {}\n\n\
                 Your calendar and notes are saved. Installing the latest version may fix it; reporting \
                 it helps get it fixed.",
                short(d)
            ),
            fix_label: "Get the latest version",
            fix_url: releases,
            detail: d.clone(),
        },
    }
}

pub fn looks_like_webview(d: &str) -> bool {
    let d = d.to_lowercase();
    d.contains("webview2")
        || d.contains("webview")
        || d.contains("0x80070002")
        || d.contains("corewebview")
}

fn short(d: &str) -> String {
    let first = d.lines().next().unwrap_or(d).trim();
    if first.chars().count() > 220 {
        first.chars().take(217).collect::<String>() + "…"
    } else {
        first.to_string()
    }
}

fn windows_version() -> String {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        if let Ok(out) = std::process::Command::new("cmd")
            .args(["/C", "ver"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            return String::from_utf8_lossy(&out.stdout).trim().to_string();
        }
    }
    std::env::consts::OS.to_string()
}

pub fn report_dir() -> Option<PathBuf> {
    let base = std::env::var_os("LOCALAPPDATA").or_else(|| std::env::var_os("HOME"))?;
    Some(PathBuf::from(base).join(APP_ID).join("crash-reports"))
}

/// Save the report; returns its path so the dialog can mention it.
fn save_report(e: &Explained) -> Option<PathBuf> {
    let dir = report_dir()?;
    fs::create_dir_all(&dir).ok()?;
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let path = dir.join(format!("crash-{secs}.txt"));
    let mut f = fs::File::create(&path).ok()?;
    let _ = writeln!(
        f,
        "Calendar Assistant {}\n{}\nTime (unix): {secs}\n\n{}\n\n{}\n\nDetails:\n{}",
        version(),
        windows_version(),
        e.title,
        e.text,
        e.detail
    );
    Some(path)
}

fn issue_url(e: &Explained) -> String {
    let title = format!("Crash: {}", short(&e.detail));
    let body = format!(
        "**What happened**\n{}\n\n**App version:** {}\n**Windows:** {}\n\n**Details**\n```\n{}\n```\n\n\
         _Opened from the crash dialog. Add anything you were doing when it happened._",
        e.title,
        version(),
        windows_version(),
        e.detail.chars().take(3000).collect::<String>()
    );
    format!(
        "https://github.com/{REPO}/issues/new?labels=bug&title={}&body={}",
        encode(&title),
        encode(&body)
    )
}

fn encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

pub fn open(url: &str) {
    #[cfg(windows)]
    {
        // ShellExecute hands the link to the default browser. (`explorer.exe <url>` falls back to
        // opening a File Explorer window when it can't resolve a browser, which looked like the app
        // "opening Explorer" instead of itself.)
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        let wide = |s: &str| {
            s.encode_utf16()
                .chain(std::iter::once(0))
                .collect::<Vec<u16>>()
        };
        let (verb, target) = (wide("open"), wide(url));
        let code = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                verb.as_ptr(),
                target.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                SW_SHOWNORMAL,
            )
        } as usize;
        if code <= 32 {
            // no default browser registered: try Edge, then Internet Explorer's launcher, never Explorer
            for exe in ["msedge.exe", "chrome.exe", "firefox.exe"] {
                if std::process::Command::new("cmd")
                    .args(["/C", "start", "", exe, url])
                    .spawn()
                    .is_ok()
                {
                    break;
                }
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = url;
    }
}

pub const YES: i32 = 6;
pub const NO: i32 = 7;

#[derive(Clone, Copy)]
pub enum Buttons {
    YesNoCancel,
    YesNo,
    Ok,
}

/// A Windows message box. Returns YES (6), NO (7) or anything else for Cancel / OK / closed.
#[cfg(windows)]
pub fn ask_with(title: &str, text: &str, buttons: Buttons, error: bool) -> i32 {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, MB_ICONERROR, MB_ICONINFORMATION, MB_OK, MB_SETFOREGROUND, MB_TOPMOST,
        MB_YESNO, MB_YESNOCANCEL,
    };
    let wide = |s: &str| {
        s.encode_utf16()
            .chain(std::iter::once(0))
            .collect::<Vec<u16>>()
    };
    let (t, c) = (wide(text), wide(title));
    let b = match buttons {
        Buttons::YesNoCancel => MB_YESNOCANCEL,
        Buttons::YesNo => MB_YESNO,
        Buttons::Ok => MB_OK,
    };
    let icon = if error {
        MB_ICONERROR
    } else {
        MB_ICONINFORMATION
    };
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            t.as_ptr(),
            c.as_ptr(),
            b | icon | MB_TOPMOST | MB_SETFOREGROUND,
        )
    }
}

#[cfg(not(windows))]
pub fn ask_with(title: &str, text: &str, _buttons: Buttons, _error: bool) -> i32 {
    eprintln!("{title}\n{text}");
    2
}

fn ask(title: &str, text: &str) -> i32 {
    ask_with(title, text, Buttons::YesNoCancel, true)
}

/// Tell the person what went wrong and offer the fix. Blocks until they choose.
pub fn report(p: Problem) {
    let e = explain(&p);
    let saved = save_report(&e);
    let mut text = e.text.clone();
    text.push_str(&format!(
        "\n\n• Yes: {}\n• No: Report the problem (opens GitHub with the details filled in)\n• Cancel: Close",
        e.fix_label
    ));
    if let Some(p) = &saved {
        text.push_str(&format!(
            "\n\nA crash report was saved to:\n{}",
            p.display()
        ));
    }
    match ask(e.title, &text) {
        YES => open(&e.fix_url),
        NO => open(&issue_url(&e)),
        _ => {}
    }
}

/// Catch Rust panics (otherwise invisible in a windowed app) and explain them.
pub fn install_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        let msg = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "unknown error".to_string()
        };
        let at = info
            .location()
            .map(|l| format!(" (at {}:{})", l.file(), l.line()))
            .unwrap_or_default();
        // The window is built inside Tauri's setup, so a WebView2 failure arrives here as a panic.
        // Give it the WebView2 options (repair, or open in the browser) instead of a generic crash box.
        #[cfg(windows)]
        if looks_like_webview(&msg) {
            crate::webview_unavailable(&msg);
            return;
        }
        report(Problem::Panic(format!("{msg}{at}")));
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn webview_problems_point_to_the_webview2_download() {
        let e = explain(&Problem::Startup(
            "failed to create webview: WebView2 error 0x80070002".into(),
        ));
        assert_eq!(e.fix_url, WEBVIEW2_URL);
        let e = explain(&Problem::Startup("tray icon failed".into()));
        assert!(e.fix_url.contains("/releases/latest"));
    }

    #[test]
    fn encodes_issue_text() {
        assert_eq!(encode("a b&c"), "a%20b%26c");
    }
}
