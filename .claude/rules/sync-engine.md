---
paths: ["src/lib/sync/**", "src/lib/sync.ts", "server/crdt-relay.mjs", "server/sync-server.mjs"]
---

# Sync engine rules

- One Yjs doc (`crdtEngine.ts`): a `Y.Map` per collection, a nested `Y.Map` per record, field-level merge. Same collections as `allLocalChanges()`.
- Never in the doc: mail, bank statement rows, API keys, tokens, per-device settings. Add a collection = `SYNC_COLLECTIONS`, `COLLECTIONS` (sqliteStorage.ts), `backup.ts`, `sync.ts`.
- The store stays the UI's source of truth. Bind with `store.subscribe` (store -> doc) and `applyRemote` (doc -> store); never mutate records.
- While `settings.sync.p2p` is on, the per-record relay data path and Drive sync are off (they would revert merged fields). Commands, presence and RSVP replies still use `sync.ts`.
- Transport: y-webrtc (signaling `/signal`) + relay `/crdt`. Room = hash of the pairing code; the code never leaves the device.
- Prove a sync bug with a failing test first (`crdtEngine.test.ts` pattern: two `Y.Doc`s). Scripts go in `temp/`, not committed.
