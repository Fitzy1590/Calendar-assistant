# Releasing

Every push builds a Windows installer and an Android APK (Actions tab → the run → **Artifacts**).

## Publish a release

```bash
git tag v0.2.0
git push origin v0.2.0
```

The `build` workflow stamps that version into the app, builds both, and publishes a GitHub Release with
the installer, the APK, install notes (`docs/release-notes.md`) and a list of changes since the last tag.
Use a new, higher version each time (`v0.2.1`, `v0.3.0` …).

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
