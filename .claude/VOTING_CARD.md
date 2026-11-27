# Visual voting card: Calendar Assistant UI/UX upgrade

Full visual version: `VOTING_CARD.html` (project root). Vote by replying 1, 2, 3 or a tweak.

## Conflicts with the current repo (read first)
- **No Yjs / Wi-Fi P2P exists.** Sync is last-writer-wins (relay or Drive). The sync pill shows real state. Adding Yjs is a core library swap: separate approval.
- **Option A breaks `.claude/rules/calendar-ui.md`** (no glass, glow or gradients). If chosen, that rule is updated and A ships as a new **Glass** theme beside the existing 11 (AA contrast still tested).
- **No Tailwind.** Tokens live in `src/styles.css`; I extend them instead of adding Tailwind.

## Options
| | Option | Palette | Gain | Cost |
|---|---|---|---|---|
| [x] | **1 A: Material Glass HUD + Bento (recommended)** (voted) | `#0B0E14` obsidian, glass `rgba(255,255,255,.05)` + 1px `.1` border + blur 16, cyan `#00F2FE`, mint `#10B981`, amber `#F59E0B`, red `#EF4444`, violet `#7C3AED`, sapphire `#3B82F6` | Dense, clear sync badge, most distinctive | Overrides no-glass rule; blur cost on low-end Android (solid fallback); dark only |
| [ ] | **2 B: Material 3 adaptive surfaces** | `#FEF7FF` surface, `#6750A4` primary, `#E8DEF8` tonal card, `#006A6A`, `#B3261E` | Familiar on Android, accessible, fits rules | Least distinctive; seed-based tonal theming needs theme-engine work |
| [ ] | **3 C: Minimalist editorial monochrome** | `#000` / `#FFF`, 0px corners, 2px rules, monospace | AAA contrast, fastest | No colour for priority/category (needs patterns/labels); long monospace text |

## Shared across all options
9 passes: Spacing, Color, Icons, Copy, Type, Layout, Details, Visuals, Motion (0 ms snapping, reduced motion honoured). 4/8/16/24/32 spacing tokens, 44 px touch targets, header with date range, search, sync pill and 1-tap add, Month/Week/Day/Agenda restyle, Bento Tasks and Home. Windows first (CLAUDE.md focus); shared code stays Android-safe.

## Vote
Selected: **Option A**
