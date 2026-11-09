# Email module: technical spec

Status: approved feature set (your vote), not yet built. Stages and checks: `FEATURE_PROGRESS.md` §0 Email. Windows first.
Follows the repo's real layout (npm, `src/lib/`, `src/pages/`), not `pnpm`/`src/adapters/`/`src/views/`.

## 0. Decisions from the vote

| Area | Decision |
|---|---|
| Providers | Gmail API + Microsoft Graph (Outlook/Hotmail). Gmail first. **No IMAP/SMTP** in v1 (needs native Rust; revisit later). |
| New mail | Polling every 1-5 min (`settings.mail.pollMins`, default 3). No push. |
| Thread scan | Summarise the whole thread; trim/redact on device first; **ask before the first send** of each thread to an AI. |
| AI | "Ask Claude" and "Ask Gemini" side by side; tones Professional / Brief / Friendly / Assertive; **draft only, never auto-send**; voice dictation. |
| Sorting | Automatic buckets + your own rules + drag-and-drop. |
| Calendar | Email → event, email → task, and an automatic "Add to calendar?" hint. |
| Themes | Whole app: palettes + accent colour + density (Compact / Comfortable / Spacious). |
| Scope | Repo layout; Windows first (no phone sign-in; mail stays on the PC, not on the relay). |
| Cache | You ticked both "metadata only" and "full text". Resolved as: **metadata always; message text cached too** (`settings.mail.cacheText`, default on), bounded by `cacheMaxMB` (default 300). Turn it off for metadata-only. |
| Storage | App-wide **storage checker** that prompts to clean up when usage is high (§6). |

## 1. Accounts, OAuth and secure storage

Files: `lib/mail/accounts.ts`, `gmail.ts`, `graph.ts`; `lib/secureStore.ts`; Rust `secure_store_{get,set,delete}` commands.

**Account model** (`settings.mail.accounts[]`, no secrets): `{ id, provider: "gmail" | "graph", address, name, enabled, syncState: { historyId? | deltaLinks? , lastSyncAt }, status: "ok" | "needs-reconnect" | "error" }`.

**Gmail.** Auth code + PKCE over loopback (existing `google.ts`, desktop client ID/secret from settings). Refactor `google.ts` from one global token to **per account** (`google-refresh:<accountId>`); Calendar/Drive keep working on the default account.
- Scope: `gmail.modify` (read, label/move/trash, send, drafts; no permanent delete). Replaces `gmail.readonly` for mail; the old scan keeps working.
- Initial sync: `messages.list?q=in:inbox newer_than:30d`, then metadata batch. Incremental: `users.history.list(startHistoryId)`; on 404 (expired) do a fresh initial sync.
- Gotcha: a Google client in "Testing" status expires refresh tokens after ~7 days. Publish it as "In production" (an unverified-app warning is fine for personal use). Verify in the Google Cloud console.

**Microsoft Graph.** New `lib/mail/microsoft.ts`: auth code + PKCE over loopback (same `tauri-plugin-oauth` pattern), public client (no secret), redirect `http://localhost`.
- Endpoints: `login.microsoftonline.com/common/oauth2/v2.0/{authorize,token}`. Scopes: `offline_access User.Read Mail.ReadWrite Mail.Send`.
- Sync: per folder `GET /me/mailFolders/{id}/messages/delta` (store `@odata.deltaLink`). Thread = `conversationId`.
- Settings gets `microsoftClientId` (exists); the popup scan in `email.ts` stays for the Import dialog.

**Tokens.** Access token in memory only, refreshed 60 s before expiry. Refresh token in the OS secure store: Windows Credential Manager through the Rust `keyring` crate (`secure_store_*`), wrapper `secureStore.ts` falls back to device-only localStorage in browser mode and shows a one-line notice. `invalid_grant` → `status: "needs-reconnect"`, banner "Reconnect <address>", cached mail kept. Disconnect revokes the token, deletes the secret and that account's cache. Tokens are never logged, never in backups, never in error reports (`errors.ts` redacts `ya29.`, `eyJ`, `Bearer`).

**Send.** Gmail `messages.send` (raw RFC 2822, reply threading with `In-Reply-To`, `References`, `threadId`); Graph `POST /me/messages/{id}/reply` or `createReply` then `send`. Only called from the Send button.

## 2. Thread context extraction

File: `lib/mail/thread.ts` (pure, unit-tested).

```ts
interface MailMessage { id; threadId; accountId; from: Addr; to: Addr[]; cc: Addr[]; subject; date: string /*ISO*/;
  text: string; html?: string; headers: Record<string, string>; labels: string[]; attachments: { name; mime; size }[] }
interface ThreadContext { threadId; subject; me: string; participants: { addr; name; role: "me" | "them" }[];
  messages: { from; date; text }[]; truncated: boolean; approxTokens: number }
```

Pipeline per message (all local, in this order):
1. **Headers**: keep From/To/Cc/Subject/Date/Message-ID/In-Reply-To/References; read `List-Unsubscribe`, `List-Id`, `Auto-Submitted`, `Precedence` for classification only.
2. **Body**: prefer `text/plain`; else HTML → text with a sanitising parser (`DOMParser`, drop script/style/tracking pixels, keep links as text).
3. **Strip**: quoted replies (`>` lines, "On … wrote:", Outlook "From:/Sent:/To:/Subject:" blocks), signatures (`-- `, "Sent from my …"), legal footers, unsubscribe footers.
4. **Redact**: card-like digit runs, IBAN/TFN-style IDs, one-time codes (4-8 digits near "code"/"OTP"/"PIN"), passwords near "password", URLs reduced to their domain. Redaction is reversible in memory only (so a draft can still say the person's own details).
5. **Budget** (`maxContextTokens`, default 6000, ≈ chars/4): newest 3 messages in full (≤1500 tokens each); older ones cut to their first 400 characters; drop oldest first; set `truncated`.
6. **Confirm**: the first time a thread goes to an AI, show the exact payload (provider name, N messages, ~tokens) with Send / Cancel. "Don't ask again for this provider" is a setting.

**Summary** (LLM, JSON out, cached by `threadId + lastMessageId` in the mail cache): `{ summary, asks: string[], commitments: { who, what, due? }[], deadlines: { text, iso? }[], tone, relationship, suggestedIntent }`. Deadlines are also parsed locally with `nlp.ts parseWhen` so the date is right even if the model's `iso` is not.

## 3. AI drafting and voice dictation

Files: `lib/mail/drafts.ts`, `components/mail/AssistPanel.tsx`.

- **Claude**: through the existing client and model settings in `lib/assistant.ts` (same key, fallbacks, error handling).
- **Gemini**: new `settings.mail.ai.geminiKey` (device-only, blanked in backups) and `geminiModel` (default `gemini-2.5-flash`; confirm the current model name when building). `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, header `x-goog-api-key`, body `{ systemInstruction, contents:[{role:"user",parts:[{text}]}], generationConfig:{ temperature:0.4, maxOutputTokens:900 } }`, via `lib/http.ts`.
- Both run in parallel on the same prompt; results shown as two editable draft cards; "Use this" copies into the reply box. Cancel aborts both.

**Prompt (system)**: "You draft email replies for {me}. Write in {tone}, first person, matching {me}'s language. Use only facts in the thread and in {instruction}. Never invent dates, amounts or promises; if something is missing write [CHECK: what]. Output only the reply body, no subject, no signature."
**Prompt (user)**: `THREAD SUMMARY: {summary JSON}\nTHREAD (newest last):\n{ThreadContext.messages}\nTASK: {instruction or "Reply appropriately."}\nTONE: {Professional|Brief|Friendly|Assertive}`.
Placeholders `[CHECK: …]` are highlighted and block Send until edited.

**Voice**: reuse `lib/wake.ts` `dictate(onText, onFinal)`, `stopDictation()`, `voiceReady()`. Note: in the installed Windows app `browserSpeechAvailable()` is false by design, so dictation there is **Picovoice Cheetah (needs the existing Picovoice key)**; browser mode uses Web Speech. If neither is available show `unsupportedMessage()`. UI: mic button toggles dictation into the instruction box or the draft (insert at cursor); live interim text in grey; visible Stop; `aria-live="polite"` for the transcript.

## 4. Sorting, rules, folders

File: `lib/mail/classify.ts` (pure, unit-tested). **Local heuristics first; no LLM needed.**

| Bucket | Signals |
|---|---|
| Spam | Provider's own spam label/Junk folder only; never reclassified by us. |
| Subscriptions | `List-Unsubscribe`/`List-Id`, `Precedence: bulk`, known newsletter senders. |
| Financial | Receipt/invoice/statement/payment words, bank and payment-processor domains. |
| Social | Known social/notification domains, `noreply` senders with mentions/likes patterns. |
| Action Required | Question to me, "please/could you/by <date>", a deadline from `parseWhen`, direct To (not Cc/list). |
| Urgent | Action Required + (today/tomorrow/ASAP/overdue) or a VIP sender. |

Order: user rules → Spam → Subscriptions → Financial → Social → Urgent → Action Required → Inbox. A message has one bucket; an optional LLM refinement for ambiguous ones is a later setting (off).

**Rules**: `settings.mail.rules[] = { id, field: "from" | "domain" | "subject" | "list-id", op: "is" | "contains", value, folderId, stop }`. **Folders**: `settings.mail.folders[] = { id, name, builtin }` (built-ins = the buckets). Folders are **local virtual folders** in v1 (assignments in the mail cache); optional mirror to Gmail labels / Graph categories later. Drag-and-drop and a keyboard "Move to…" menu write a one-off assignment; "Always do this for <sender>" creates a rule.

## 5. Calendar and task actions

File: `lib/mail/actions.ts`; adds to `lib/actions.ts` (the one command surface).

- **Email → event**: `extract()` from `email.ts` + `parseWhen` on subject/body → preview (title, start/end, location, attendees from To/Cc) → confirm → `store.upsert("events", …)`; conflicts via `planner.conflictsFor`. Attendees become `Attendee` records (status pending, no invites sent).
- **Email → task**: title from subject or the action sentence, `due` from the first deadline, link back to the message (`notes: "From <sender> – <subject>"`).
- **Automatic hint**: a "Add to calendar?" chip when `parseWhen` finds a date+time and an event-like word (meeting, call, appointment, dinner, flight…). Local only; dismissible per message; never creates anything by itself.
- Use `calendarEvents()` for any drawing; never mutate store records.

## 6. Cache, polling and storage checker

**Cache**: IndexedDB `calendar-assistant-mail` (`lib/mail/cache.ts`): stores `messages` (metadata always; `text` only if `cacheText`), `summaries`, `folderAssignments`, `syncState`. Not a store collection, not synced, excluded from backups. Eviction: oldest first when over `cacheMaxMB`.

**Polling** (`lib/mail/poll.ts`): every `pollMins` while the app is open, on focus, and on open; one run at a time; backoff on 429/5xx; failures shown per account. New mail → notification via `platform.notify` (respects the existing reminder-notification setting).

**Storage checker** (`lib/storage.ts`, app-wide): every launch and hourly, estimate usage (`navigator.storage.estimate()` plus localStorage size). Warn at 80% of quota or 500 MB (whichever first) with a dialog: "Storage is getting full" and **safe** cleanup choices with sizes: clear mail text older than N days, clear mail summaries, delete old daily snapshots (keep the newest 3), clear news/price caches. **Never deletes events, tasks, notes, contacts, shopping, accounts or settings**, and never without the person pressing the button. Snooze 7 days.

## 7. Theme system

Extends the existing tokens (`styles.css` `[data-theme]`, `[data-density]`, `--accent`; settings `theme`, `accent`, `density`, `fontScale`).
- `ThemeName` adds `"oled" | "forest" | "contrast"` to `paper | ink | slate | sand | system` (and optional `"cyberpunk"` is **not** included: not voted). `density` becomes `"compact" | "comfortable" | "spacious"`.
- Each theme defines the full token set (`--bg --surface --surface-2 --text --muted --border --accent-ink --ok --warn --bad`). `oled` = true black surfaces; `contrast` = AAA text, 2 px borders, thicker focus ring; `forest` = dark green neutrals. All pass AA (contrast tested in a unit test over the token table).
- Accent colour picker: free colour + a contrast check that picks the readable foreground (`--accent-ink`).
- Density sets `--row-h`, `--pad`, `--gap`; mail rows read them (Compact ≈ 28 px, Comfortable 40, Spacious 56).
- Persistence: already in `settings` (per device); `theme`, `accent`, `density` can join `SHARED_KEYS` if you want them the same on phone and PC (ask before changing).
- "system" keeps mapping light/dark to `paper`/`ink`.

## 8. Security and privacy rules (apply to every stage)

- HTML mail sanitised (add pinned `dompurify`), scripts/forms/iframes removed, remote images and tracking pixels blocked until allowed, links shown with their real domain.
- No mail content, addresses or tokens in logs, crash reports or the feedback form; the autofix layer never touches mail data.
- A thread reaches an AI only after the confirm step; keys are device-only and blanked in backups.
- Drafts and sends are separate: the Send button is the only code path that calls a send API (unit-tested: no other caller).
- Disconnecting an account removes its tokens and its cache.

## 9. Testing approach

Pure modules (`thread.ts`, `classify.ts`, `actions.ts` parsing, theme contrast, storage thresholds) get Vitest tests next to the code. Provider adapters take an injected API function (like `googleSync.ts`) and are tested against fakes of the Gmail and Graph APIs, including history/delta, expired tokens, 429s and `invalid_grant`. UI gets Playwright checks at 1280 px and 412 px, keyboard-only walkthroughs and axe-core. Rust `secure_store` is checked standalone with `cargo test` where possible and by the Windows CI job.
