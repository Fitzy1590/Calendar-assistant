//! Android: other email accounts aren't offered on the phone, but the commands exist so the app links.

fn nope<T>() -> Result<T, String> {
    Err("Other email accounts run in the Windows app.".into())
}

#[tauri::command]
pub async fn imap_test(_req: serde_json::Value) -> Result<(), String> {
    nope()
}

#[tauri::command]
pub async fn imap_sync(_req: serde_json::Value) -> Result<serde_json::Value, String> {
    nope()
}

#[tauri::command]
pub async fn imap_body(_req: serde_json::Value) -> Result<serde_json::Value, String> {
    nope()
}
