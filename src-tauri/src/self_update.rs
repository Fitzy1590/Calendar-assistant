//! Direct-download updater for Windows builds that have no signed-update key yet: fetch the installer from this
//! project's GitHub release, check it against the SHA-256 GitHub publishes for that file, run it, and quit so
//! it can replace the app. Builds with an update key use Tauri's signed updater instead (see src/lib/updates.ts).

use crate::self_update_core::{file_name, hex, parse_digest, valid_url};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};
use tauri_plugin_http::reqwest;

#[derive(Clone, serde::Serialize)]
struct Progress {
    received: u64,
    total: Option<u64>,
}

#[tauri::command]
pub async fn install_update_direct(
    app: AppHandle,
    url: String,
    sha256: String,
) -> Result<(), String> {
    if !valid_url(&url) {
        return Err(
            "That download isn't from the Calendar Assistant releases, so it was not installed."
                .into(),
        );
    }
    let want = parse_digest(&sha256)
        .ok_or("GitHub didn't publish a checksum for this file, so it can't be checked.")?;

    let mut resp = reqwest::Client::new()
        .get(&url)
        .header("User-Agent", "CalendarAssistant-updater")
        .send()
        .await
        .map_err(|e| format!("Couldn't download the update: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!(
            "GitHub answered {} for the download.",
            resp.status()
        ));
    }
    let total = resp.content_length();
    let (mut hasher, mut data, mut received, mut last) = (Sha256::new(), Vec::new(), 0u64, 0u64);
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("The download was interrupted: {e}"))?
    {
        hasher.update(&chunk);
        data.extend_from_slice(&chunk);
        received += chunk.len() as u64;
        if received - last >= 256 * 1024 || Some(received) == total {
            last = received;
            let _ = app.emit("update-progress", Progress { received, total });
        }
    }
    if hex(&hasher.finalize()) != want {
        return Err("The download didn't match GitHub's checksum, so it was not installed.".into());
    }

    let name = file_name(&url).ok_or("Bad file name.")?;
    let dir = std::env::temp_dir().join("CalendarAssistant-update");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Couldn't save the update: {e}"))?;
    let path = dir.join(name);
    std::fs::write(&path, &data).map_err(|e| format!("Couldn't save the update: {e}"))?;
    run_installer(&path)?;
    // let the installer replace the files; it starts the app again when it finishes
    app.exit(0);
    Ok(())
}

#[cfg(windows)]
fn run_installer(path: &std::path::Path) -> Result<(), String> {
    // /P passive (progress bar, no questions), /UPDATE keep settings, /R start the app again afterwards
    std::process::Command::new(path)
        .args(["/P", "/UPDATE", "/R"])
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Couldn't start the installer: {e}"))
}

#[cfg(not(windows))]
fn run_installer(_path: &std::path::Path) -> Result<(), String> {
    Err("Direct updates run in the Windows app.".into())
}
