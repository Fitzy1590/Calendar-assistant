# Voting card: local-first 2-way sync

Full visual card with mock screenshots: `VOTING_CARD.html` (project root). Nothing is built yet.

## Audit (evidence in `SPEC.md` §10)

- [ESTABLISHED] Real-time 2-way sync already exists: WebSocket relay + offline queue (`src/lib/sync.ts`, `server/sync-server.mjs`) and serverless Drive sync (`driveSync.ts`).
- [ESTABLISHED] Real gap: merge is last-writer-wins per record, so concurrent edits to different fields of one task lose one edit. Yjs fixes this.
- [ESTABLISHED] Storage is Zustand `persist` (localStorage). No SQLite, Yjs or y-webrtc dependency exists yet.
- [PLAUSIBLE] Option B duplicates Drive sync and the relay.
- [UNCERTAIN] Android WebView may hide LAN addresses from WebRTC; "<10 ms" and "0 ms cold start" are unmeasured targets.
- [CONFLICT] HUD glassmorphism look vs `.claude/rules/calendar-ui.md`. Theme swap needs your yes.

## Vote 1: build option

- [ ] **1 Option A [recommended]**: SQLite + Yjs + Wi-Fi WebRTC/P2P (relay fallback) + real-time 2-way sync + Tauri 2 (Windows shipped, Android compatible)
- [ ] **2 Option B**: cloud-only polling (redundant with Drive sync and relay)

## Vote 2 (Option A refinements, defaults = your spec)

- Storage: [ ] SQLite now (as specified) / [ ] Yjs first, SQLite later
- Transport: [ ] y-webrtc via relay signaling (as specified) / [ ] LAN WebSocket + relay
- HUD look: [ ] whole app / [ ] sync panel only / [ ] existing tokens

Reply `1`, `2`, or a custom tweak.
