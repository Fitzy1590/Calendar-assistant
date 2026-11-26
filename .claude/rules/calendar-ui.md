---
paths: ["src/components/**/*.tsx", "src/pages/**/*.tsx", "src/views/**/*.tsx", "src/styles.css"]
---

# Calendar UI rules

## Look (no AI slop) and design tokens
- Use the tokens in `src/styles.css` (`--accent`, `--surface*`, `--text*`, `--font-*`, spacing). No new hex colours, no inline colour styles.
- No gradients on text, glassmorphism, glow shadows, emoji as icons, or decorative blobs. Flat surfaces, 1px borders, one accent.
- Copy is plain and specific ("3 events clash on Tue"), not marketing ("Supercharge your day ✨"). Sentence case.
- Reuse `components/ui.tsx` (`Modal`, `Toggle`, `Seg`, `PageHead`, `Field`) before writing a new primitive.
- Check both themes and 412 px width before finishing.
- Sync panel exception (voted 2026-11-26): `.sync-hud` in `styles.css` may use its own dark HUD palette and glass look. Nowhere else.

## Keyboard
- Anything clickable is a `<button>` or `<a>`. A `<div onClick>` needs `role`, `tabIndex={0}` and Enter/Space handling; prefer a button.
- Date grids (`MiniCalendar`, month view, date pickers) use a roving `tabIndex`: ←/→ day, ↑/↓ week, PgUp/PgDn month,
  Home/End start/end of week. Only the focused/selected day has `tabIndex={0}`.
- Time grids (day/week view): each slot is focusable; Enter creates an event at that slot's time; ↑/↓ moves 30 min.
- Modals trap focus, close on Esc, and return focus to the opener.
- Never remove focus outlines. `:focus-visible` = `2px solid var(--accent)`, offset 2px (already global; don't override with `outline: none`).

## ARIA
- Month grid: `role="grid"` + `aria-label="November 2026"`; rows `role="row"`; days `role="gridcell"` with
  `aria-label="Tuesday 10 November, 2 events"` and `aria-selected` / `aria-current="date"` for today.
- Event chips (`.ev`, `.pill`): `aria-label` = title, time range, location.
- Icon-only buttons always have `aria-label`. Decorative icons get `aria-hidden="true"`.
- Toasts `role="status"`; assistant replies `aria-live="polite"`; errors `role="alert"`.
- Toggles expose `aria-pressed` or `role="switch"` + `aria-checked`.

## Dates
- Format with date-fns and the user's `clock24` setting (`fmtTime` in `lib/util.ts`). Never hand-build date strings.
- Draw calendars from `calendarEvents()` (`lib/birthdays.ts`) and expand recurrence with `lib/recurrence.ts`.

## Inbox and mail UI
- Message lists are one `role="listbox"` with `role="option"` rows and a roving `tabIndex`: ↑/↓ or j/k move, Enter opens, Esc returns to the list, Home/End jump. Never a `<div onClick>` per row.
- Each row's `aria-label` = sender, subject, time, unread/priority state. New mail is announced in a polite live region ("3 new messages"), never by moving focus.
- Mail HTML is rendered only after sanitising (`lib/mail/html.ts`) and only inside the sandboxed frame (`RichBody`): no scripts, ever. Remote pictures follow the person's setting (Always show / Trusted senders / Blocked; the owner chose Always show) with a Show pictures bar whenever some are held back. Links are web, mail and phone only and open via `openUrl`. Plain text is always one tap away (Rich / Plain).
- Folder drag-and-drop always has a keyboard equivalent (a "Move to…" menu). Drop targets are labelled.
- AI draft panels: the draft is editable text in a labelled textarea; "Send" is a separate, explicit button. Voice dictation shows a live transcript and a visible stop control.
- Mail colour: by message type, calm. Colour sits on the folder tabs, the small type label on each row and the open message's pill only; rows stay neutral. Use the `--k-*` tokens (`.k-urgent`, `.k-action`, …) which are tuned per light/dark theme for AA text contrast; never a literal colour. This is the one place more than one hue is allowed (owner's vote, Nov 2026).
- Themes come only from tokens (`[data-theme]`, `[data-density]`, `--accent`). Every theme meets WCAG AA text contrast; the high-contrast theme meets AAA.
