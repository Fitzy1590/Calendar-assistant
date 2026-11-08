//! Browser mode: run Calendar Assistant in the person's normal web browser when WebView2 can't be used
//! on this PC (removed or blocked by a "debloat" tool, for example).
//!
//! The app's pages are built into this program. We serve them only to this PC (127.0.0.1) and open the
//! default browser at them. A fixed port is used so the browser keeps the app's saved data between
//! launches. The page pings `/__alive` while it's open; about three minutes after the last tab closes,
//! this process exits by itself.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use include_dir::{include_dir, Dir};
use tiny_http::{Header, Method, Response, Server, StatusCode};

/// The built web app (`npm run build` writes ../dist before the Rust build, as part of `tauri build`).
static DIST: Dir<'static> = include_dir!("$CARGO_MANIFEST_DIR/../dist");

/// Fixed ports keep the browser's saved data (it's tied to the address) across launches.
pub const PORTS: [u16; 4] = [47821, 47822, 47823, 47824];
/// How long to keep running after the page stops checking in.
const IDLE_EXIT: Duration = Duration::from_secs(180);
/// Grace period for the browser to open and load the page the first time.
const FIRST_LOAD: Duration = Duration::from_secs(120);

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn content_type(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "wasm" => "application/wasm",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn header(k: &str, v: &str) -> Header {
    Header::from_bytes(k.as_bytes(), v.as_bytes()).expect("valid header")
}

/// The file for a request path; unknown paths get the app's start page (it routes itself).
pub fn lookup(path: &str) -> Option<(&'static [u8], &'static str)> {
    let clean = path
        .split(['?', '#'])
        .next()
        .unwrap_or("/")
        .trim_start_matches('/');
    // never let ".." or a drive letter reach the lookup (the files are built in, but be strict anyway)
    if clean
        .split('/')
        .any(|seg| seg == ".." || seg.contains(':') || seg.contains('\\'))
    {
        return None;
    }
    let file = if clean.is_empty() {
        "index.html"
    } else {
        clean
    };
    if let Some(f) = DIST.get_file(file) {
        return Some((f.contents(), content_type(file)));
    }
    if !file.contains('.') {
        return DIST
            .get_file("index.html")
            .map(|f| (f.contents(), content_type("index.html")));
    }
    None
}

/// Is a copy of browser mode already serving on this port?
fn already_running(port: u16) -> bool {
    use std::io::{Read, Write};
    use std::net::TcpStream;
    let Ok(mut s) =
        TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), Duration::from_millis(400))
    else {
        return false;
    };
    let _ = s.set_read_timeout(Some(Duration::from_millis(800)));
    let _ = s.write_all(b"GET /__whoami HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n");
    let mut buf = String::new();
    let _ = s.take(4096).read_to_string(&mut buf);
    buf.contains("calendar-assistant")
}

pub fn url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/?mode=browser")
}

/// Start (or reuse) browser mode and open it. `on_fix` runs when the page asks to repair WebView2;
/// it returns true if the normal app was started instead (then this process exits).
pub fn run(open_browser: impl Fn(&str), on_fix: impl Fn() -> bool) {
    for port in PORTS {
        if already_running(port) {
            open_browser(&url(port));
            return;
        }
        if let Ok(server) = Server::http(("127.0.0.1", port)) {
            open_browser(&url(port));
            serve(server, port, on_fix);
            return;
        }
    }
    eprintln!("browser mode: no free port");
}

fn serve(server: Server, port: u16, on_fix: impl Fn() -> bool) {
    let started = now();
    let last_ping = Arc::new(AtomicU64::new(0));
    let origin = format!("http://127.0.0.1:{port}");
    loop {
        let idle = match last_ping.load(Ordering::Relaxed) {
            0 => now().saturating_sub(started) > FIRST_LOAD.as_secs() + IDLE_EXIT.as_secs(),
            t => now().saturating_sub(t) > IDLE_EXIT.as_secs(),
        };
        if idle {
            return;
        }
        let req = match server.recv_timeout(Duration::from_secs(5)) {
            Ok(Some(r)) => r,
            Ok(None) => continue,
            Err(_) => return,
        };
        let path = req.url().to_string();
        // only this PC, and only pages from this server, may use the action endpoints
        let same_origin = req
            .headers()
            .iter()
            .find(|h| h.field.equiv("Origin"))
            .map(|h| h.value.as_str() == origin)
            .unwrap_or(false);
        let res = match (req.method(), path.as_str()) {
            (_, "/__whoami") => Response::from_string("calendar-assistant").boxed(),
            (_, p) if p.starts_with("/__alive") => {
                last_ping.store(now(), Ordering::Relaxed);
                Response::from_string("ok")
                    .with_header(header("Cache-Control", "no-store"))
                    .boxed()
            }
            (Method::Post, "/__fix-webview") if same_origin => {
                let _ = req.respond(Response::from_string("started"));
                if on_fix() {
                    return; // the normal app is running now
                }
                continue;
            }
            (Method::Get, p) | (Method::Head, p) => match lookup(p) {
                Some((bytes, ct)) => {
                    let cache = if ct.starts_with("text/html") {
                        "no-store"
                    } else {
                        "public, max-age=31536000, immutable"
                    };
                    Response::from_data(bytes)
                        .with_header(header("Content-Type", ct))
                        .with_header(header("Cache-Control", cache))
                        .with_header(header("X-Content-Type-Options", "nosniff"))
                        .boxed()
                }
                None => Response::from_string("Not found")
                    .with_status_code(StatusCode(404))
                    .boxed(),
            },
            _ => Response::from_string("Not allowed")
                .with_status_code(StatusCode(405))
                .boxed(),
        };
        let _ = req.respond(res);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serves_built_files_and_falls_back_to_the_start_page() {
        let (_, ct) = lookup("/").expect("index");
        assert!(ct.starts_with("text/html"));
        assert!(lookup("/settings").is_some()); // app route -> start page
        assert!(lookup("/missing.js").is_none());
        assert!(lookup("/../Cargo.toml").is_none());
        assert!(lookup("/C:/Windows/win.ini").is_none());
    }
}
