# Releasing

Every push builds a Windows installer and an Android APK (Actions tab → the run → **Artifacts**).

## Publish a release

Either:

* **From GitHub:** Actions → **build** → **Run workflow** → type the version (e.g. `0.2.0`) → **Run workflow**.
* **From a terminal:**
  ```bash
  git tag v0.2.0
  git push origin v0.2.0
  ```

The `build` workflow stamps that version into the app, builds both, and publishes a GitHub Release with
the installer, the APK, install notes (`docs/release-notes.md`) and a list of changes since the last tag.
Use a new, higher version each time (`v0.2.1`, `v0.3.0` …).

## In-app updates

* **Windows** checks for a new release when it starts (and every 12 hours), shows what's new, and installs
  with **Update and restart**, or by itself if *Install updates automatically* is on. Settings → Updates
  has **Check for updates now**.
* **Android** checks the same way and downloads the new APK; Android asks you to confirm the install.
* Updates come from the newest GitHub Release, so publish a new version tag to ship one.

### Update key (one-time, needed for Windows self-updates)

Windows only installs an update whose signature matches the public key built into the app, so nobody else
can push an update to it. Create the key pair on your own computer:

```bash
npx tauri signer generate -w calendar-assistant-updater.key
```

It asks for a password, writes the private key to `calendar-assistant-updater.key` and the public key to
`calendar-assistant-updater.key.pub`. Then in GitHub → **Settings → Secrets and variables → Actions**:

| Where | Name | Value |
|---|---|---|
| Secrets | `TAURI_SIGNING_PRIVATE_KEY` | the whole contents of `calendar-assistant-updater.key` |
| Secrets | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password you chose |
| Variables | `TAURI_UPDATER_PUBKEY` | the whole contents of `calendar-assistant-updater.key.pub` |

Keep the private key file and password safe and out of the repository. If you lose them, installed apps
can't verify new updates and everyone has to reinstall once from the Releases page.

Releases made before the key exists still work: the app tells you a new version is out and opens the
Releases page instead of installing it.

## Android signing key (one-time, recommended)

Android only installs an update over an existing app if both were signed with the **same key**. Without a
key the workflow signs with a throwaway test key, so each test build must be uninstalled before the next.

1. Create a key on your own computer (needs Java; Android Studio includes it). Keep the file and passwords safe:
   losing them means users must uninstall to get updates.
   ```bash
   keytool -genkeypair -v -keystore calendar-assistant.jks -alias calendar-assistant \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Turn it into text: `base64 -w0 calendar-assistant.jks` (macOS: `base64 -i calendar-assistant.jks`;
   Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("calendar-assistant.jks"))`).
3. In GitHub: **Settings → Secrets and variables → Actions → New repository secret**, add:
   - `ANDROID_KEYSTORE_BASE64` — the text from step 2
   - `ANDROID_KEYSTORE_PASSWORD` — the keystore password
   - `ANDROID_KEY_ALIAS` — `calendar-assistant`

Never commit the `.jks` file.

## Windows code signing (optional)

Unsigned installers show a SmartScreen warning. A code-signing certificate (or Azure Trusted Signing)
removes it; see Tauri's "Windows code signing" guide. Nothing else in the release process changes.

## Windows-only release

Actions → build → Run workflow, enter the version, and tick **Windows-only release (skip_android)**. The Android
job is skipped, the release gets the Windows installers only, and its notes say the APK is not included.
Phones that check for updates are sent to the release page instead of an APK.

## "What's new" window

After an update, Windows shows a one-time "What's new" window from `src/lib/whatsNew.ts`. **Add an entry there (newest
first, at most 3 plain-English points) before every release**, or the window has nothing to say for that version.
It is bundled with the app, so it works offline; new installs never see it.
