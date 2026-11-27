---
paths: ["src/lib/finance/**", "src/components/finance/**", "src/pages/Finance.tsx", "src-tauri/src/vault*.rs", "src-tauri/src/finance*.rs"]
---

# Finance engine rules (Broke-Assistant). Spec: `SPEC.md` § Finance module

Applies only after the vote picks Option A (encrypted store). Record the vote in `SPEC.md` first.

## Data and storage
- Financial rows (`accounts`, `transactions`, `subscriptions`, `budgets`, `savings_goals`, `schedules`) live **only** in the encrypted vault in Rust. Never a plain `.db`/`.sqlite`, never `localStorage`, IndexedDB, Zustand `persist`, `settings`, or a `CalEvent`/`Reminder`/`Task` field.
- Finance is **not** a store collection: not in `partialize`, `backup.ts COLLECTIONS`, `sync.ts allLocalChanges`, Drive sync, the relay or backups. Amounts never go on synced records; calendar overlays are computed at render time.
- Key: 32 random bytes (`ring::rand::SystemRandom`) kept in the OS credential store through the existing `keyring` crate (`secure_store.rs`). Never in settings, logs, errors or the repo. Wrap key buffers in `zeroize::Zeroizing` and drop them as soon as the connection is open or closed.
- Locked vault (key missing, wrong, or a restored backup on another PC) shows a plain "Finance data can't be opened on this device" state. Never silently create a new empty vault over an unreadable one.

## Zero egress
- Nothing under `src/lib/finance/` or `src/components/finance/` imports `lib/http.ts`, `fetch`, `XMLHttpRequest`, `WebSocket`, `sync`, `google`, `assistant`, or `mail/ai`. A Vitest guard greps for these.
- Finance text never reaches Claude/Gemini or the assistant tools. `runClaude` has no finance tool. Voice/local intents may read only totals the user asks for on screen.
- Notifications are local (`platform.notify`) and are built in a local-only scheduler, not synced `Reminder` records.
- Logs and error reports: amounts, merchants, account names and balances are redacted by `errors.ts`.

## Cash flow (`lib/finance/cashflowEngine.ts`, pure)
- Projected balance(t) = opening balance + income(t) - bills(t), per account and combined. Dates are local `yyyy-MM-dd` via date-fns; recurrence by its own small expander (`dueDates`; monthly clamps the 31st to month end, which `lib/recurrence.ts` would skip). Money is **integer minor units** (cents), never floats.
- Weekend rule: a payday on Sat/Sun moves to the preceding Friday; a bill on Sat/Sun moves to the following Monday. Keep the original date on the item (`due`) and the shifted one (`effective`).
- Low-balance flag when projected < `settings.finance.bufferCents` (default 25000); overdraft flag when < 0.

## Subscriptions (`subscriptionTracker.ts`) and budgets (`budgetCalculator.ts`)
- Reuse `lib/subscriptions.ts` detection and its `priceChange`; add only the 3 % rule (current > previous x 1.03, integer maths) and the 3-day-ahead trial/renewal alerts.
- Budgets: 50/30/20 and zero-based envelopes, monthly rollover, pace = spent / (budget x elapsed share of the month): under 1.0 Under pace, over 1.0 Over pace.

## UI (`components/finance/FinanceDashboard.tsx`)
- Bento grid on existing theme tokens (the Obsidian look is the existing Glass/Midnight themes); no new hex colours, no gradients or emoji icons. Currency uses `--font-num`. Touch targets 44 px, no transitions. Follow `calendar-ui.md`; chart colours and colour-blind-safe status marks (icon + text, not colour alone).
- Windows app only: browser mode and the plain browser build show "Finance needs the Windows app".

## Tests and checks
- Vitest next to each module: weekend shifts (both directions, month ends), overdraft day, 3 % boundary (exactly 1.03 is not a hike), pace gauge, 50/30/20 rounding (sums to the income), no-egress guard.
- Rust vault logic in a `*_core.rs` with no Tauri types, checked standalone with `cargo test`; the GitHub `build` run compiles the rest. Filter build output: `npm run build 2>&1 | head -50`.
