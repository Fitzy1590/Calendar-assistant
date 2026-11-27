---
paths: ["src-tauri/**", "src/lib/platform.ts"]
---

# Tauri on Windows

- Current focus is Windows (WebView2). Keep CSS to what WebView2 supports (`backdrop-filter`, `:is`, `:has` are fine); no Android-only branches.
- Platform checks only via `lib/platform.ts`. Rust can't build in the Linux sandbox: `rustfmt --edition 2021`, pure modules via a scratch crate, and the GitHub `build` run decides.
- Don't touch `tauri.conf.json` signing/updater keys or the release logic in `build.yml` unless asked.
