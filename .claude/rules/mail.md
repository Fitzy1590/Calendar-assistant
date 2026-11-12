---
paths: ["src/lib/mail/**", "src/pages/Email.tsx", "src/components/mail/**", "src-tauri/src/imap_*.rs", "src-tauri/src/secure_store.rs"]
---

# Email module rules

Design: `SPEC.md`. Stages and what is left: `FEATURE_PROGRESS.md` section 0. Sign-in setup: `docs/EMAIL_SETUP.md`.

## Where things are
- `provider.ts` is the interface every adapter implements; `providers.ts` picks one per account.
- Adapters: `graph.ts` (Outlook), `gmail.ts`, `imap.ts` + Rust `src-tauri/src/imap_core.rs` (any IMAP mailbox).
- `accounts.ts` (add/remove), `microsoft.ts` (sign-in), `classify.ts` (buckets + importance), `rules.ts` (user rules,
  suggestions), `bills.ts` (amount/due date), `cache.ts` (IndexedDB), `engine.ts` (sync, alerts, bills, summary).
- Planned: `thread.ts`, `drafts.ts` (Claude/Gemini). Page `src/pages/Email.tsx`, parts in `src/components/mail/`.

## Hard rules
- Mail is **not** a store collection. Bodies live in IndexedDB on this device only: never synced, never in backups.
- Account metadata goes in `settings.mail`. **Tokens and passwords only in the OS secure store** (`lib/secureStore.ts`),
  never in settings, logs, errors or test fixtures.
- Never mutate a thread or message object; build new ones.
- Sanitise HTML before rendering it. Plain text is the default.
- AI drafts are draft-only: nothing is sent without an explicit Send press. Only the Send button may reach a send API.
- Trim and redact a thread locally before it goes to Claude or Gemini.
- Adapters are tested against fakes (fake Gmail, fake Graph, fake native IMAP layer). Add the case there; do not call
  real mail servers from tests.
- A new adapter implements `provider.ts` in full and is registered in `providers.ts`; no provider checks elsewhere.
