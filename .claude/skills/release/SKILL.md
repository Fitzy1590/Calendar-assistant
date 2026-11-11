---
name: release
description: Cut a Calendar Assistant release (Windows + Android) from main. Use only when the user asks to release or publish. Covers pre-checks, the version, the workflow run, verifying the assets and notifying.
---

# Release runbook

Only when the user has said "release" (or "merge and release") in this conversation.

1. `git status` clean, branch up to date. Run `npx tsc --noEmit`, `npm test`, `npx prettier --check "src/**/*.{ts,tsx}"`, `npm run build`. If Rust changed: `rustfmt --edition 2021 --check src-tauri/src/*.rs`.
2. `src/lib/whatsNew.ts` has an entry for the new version (newest first, at most 3 points). `FEATURE_PROGRESS.md` and `README.md` match what users see.
3. Wait for the GitHub `build` run on the PR head to pass (push and pull_request runs). Never skip or quarantine a failing test.
4. Merge the PR (merge commit), then run workflow `build.yml` on `main` with input `release_version` = the new version (higher than the last tag; check `list_releases`).
5. Wait about 13 minutes. Confirm the release has the Windows `.exe` and `.msi` and the Android `.apk`. If a job failed on a download timeout, re-run failed jobs once.
6. Notify the user with the release link. Tell them an installed Windows app updates itself on its next start (direct installer path with GitHub's SHA-256 until a signing key exists).
7. After a release, show mock screenshots of what shipped (Playwright, 1280 px and 412 px, sample data, dev server on :1420).

Never commit temporary version bumps made for screenshots (`git checkout package.json`).
