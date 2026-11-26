---
paths: ["src/components/P2pSyncPanel.tsx", "src-tauri/**"]
---

# Tauri and sync UI

- Follow `calendar-ui.md`. The dark HUD look exists only in `.sync-hud` (voted); the rest of the app keeps its themes.
- 44 px touch targets, 8 px grid, `transition: none` in the panel, mono font for status values.
- Platform checks via `lib/platform.ts`. Rust: `rustfmt --edition 2021`; CI `build` decides (no webkit here).
