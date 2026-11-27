# Voting card: Secure Calendar Finance & Budget Module

Visual version: `VOTING_CARD.html` (sample data). Reply 1 for Option A, 2 for Option B, or type a tweak. Earlier card (20 themes) moved to `docs/voting-cards/`.

- [ ] **1 Option A [RECOMMENDED PRIVACY SUITE]**: SQLCipher AES-256 local encryption + OS keychain storage + zero-egress network isolation + predictive cash flow calendar + subscription auditor + Obsidian Bento UI
  - Justification: complete Rocket Money style budgeting and calendar cash flow projections with 100% on-device data and zero external sharing.
- [ ] **2 Option B**: unencrypted local SQLite database (no SQLCipher). Breaks the "never store plain SQLite with financial records" rule.

## Differences from the brief (details in `SPEC.md` "Conflicts to decide")
| Brief | Finding | Plan |
|---|---|---|
| CSP `connect-src 'self' ws://127.0.0.1:*` | Blocks every existing service; text contains "[suspicious link removed]" | Allowlist hosts the app uses; isolation enforced in code + test |
| `tauri-plugin-sql` + SQLCipher | [UNCERTAIN] plugin supports `PRAGMA key` | Own Rust vault on `rusqlite` + SQLCipher; fallback AES-256-GCM blob |
| PBKDF2 64,000 iterations | Random 256-bit key needs no KDF | Raw key in Credential Manager; optional passphrase mode |
| Yjs, Tailwind | Not in repo; finance never syncs | Skipped |
| Palette hex, JetBrains Mono | Obsidian = Glass theme; one font family since 2026-11-27 | Theme tokens, `--font-num` |
| Store transactions | CLAUDE.md: "Statement rows are never stored" | Option A changes that rule in Phase 2 |
| macOS/Linux keychains | Windows only | Windows Credential Manager |

## Vote (record here)
Not yet voted.
