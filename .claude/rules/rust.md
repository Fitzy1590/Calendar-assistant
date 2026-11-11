---
paths: ["src-tauri/**/*.rs", "src-tauri/Cargo.toml"]
---

# Rust (Tauri backend) rules

- The Tauri crate can't be built in the Linux sandbox (no WebView2/webkit). Keep logic in modules with no Tauri types (`*_core.rs`), copy them into a scratch crate and `cargo test` there; the GitHub `build` run (Windows + Android) compiles the rest.
- Commands are `async` and do blocking work in `tauri::async_runtime::spawn_blocking`; never block the UI thread.
- Android: anything needing OpenSSL, IMAP or SMTP stays behind `#[cfg(not(target_os = "android"))]` with a stub in `imap_stub.rs` so the app still links.
- Secrets (mail passwords, tokens) arrive as arguments from the OS secure store and are never logged, formatted into errors or written to disk.
- Restrict what a command can reach (the Microsoft token command posts only to Microsoft's token URL; the updater only fetches this repo's release installers).
- Run `rustfmt --edition 2021 src-tauri/src/*.rs` before committing.
