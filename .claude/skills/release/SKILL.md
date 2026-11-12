---
name: release
description: Release runbook for Calendar Assistant — publish a new Windows + Android version through the GitHub build workflow. Load when asked to release, ship, publish, cut a version, bump the version, or when a release build or in-app update fails.
---

# Release runbook

Background and one-time key setup: `docs/RELEASING.md`. Workflow: `.github/workflows/build.yml`.

## 1. Before releasing
1. The work is merged to `main`. Never release from a feature branch.
2. Pick the version: higher than the newest GitHub Release (`get_latest_release`). Patch for fixes, minor for features.
3. Add an entry at the top of `WHATS_NEW` in `src/lib/whatsNew.ts`: that `version`, a short `title`, at most 3
   plain-English `points`. Without it the post-update window is empty.
4. Do **not** edit `version` in `package.json`, `tauri.conf.json` or `Cargo.toml`. CI stamps it
   (`scripts/set-version.mjs`).
5. Run the checks: `npx tsc --noEmit`, `npm test`, `npm run build`, `npx prettier --check "src/**/*.{ts,tsx}"`.
6. `FEATURE_PROGRESS.md` and the README match what is shipping. Commit and get it onto `main`.

## 2. Publish (ask the user first: a release is public and cannot be taken back cleanly)
Any one of these starts a release build:
- Push a branch named `release/vX.Y.Z` from `main` (the way that works from a cloud session).
- Push a tag `vX.Y.Z`.
- Actions → build → Run workflow → enter `X.Y.Z` (tick `skip_android` for a Windows-only release).

## 3. Watch the run
Jobs: `check` → `windows` + `android` → `release`. Read failures with the GitHub Actions tools (job logs).
- `check` fails: a type, format, test or build error. Fix on `main`, then release again with the **same** version only
  if no Release was published; otherwise use the next patch number.
- `windows` fails at signing: `TAURI_SIGNING_PRIVATE_KEY` / password secrets or `TAURI_UPDATER_PUBKEY` variable are
  wrong or missing. Unsigned releases still work (the app self-updates by SHA-256).
- `android` fails at signing: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`. Without
  them a test key is used and users must uninstall before installing.
- Never read, print or commit key files (`*.key`, `*.jks`, `*.p12`). Secrets are set by the user in GitHub settings.

## 4. After it publishes
1. Confirm the Release has the `-setup.exe`, the `.msi`, `latest.json` and (unless skipped) the `.apk`.
2. Tell the user the version and link the Release.
3. Show mock screenshots of the new feature (Playwright against `npm run dev`, 1280 px and 412 px).
4. Note anything not verifiable here (real Windows update, real Android install) so the user can check it.
