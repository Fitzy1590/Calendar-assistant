//! Tauri commands for the IMAP mail adapter. The blocking network work runs off the UI thread.

use crate::imap_core::{self, BodyReq, Conn, SyncOut, SyncReq};

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn imap_test(req: Conn) -> Result<(), String> {
    blocking(move || imap_core::test(&req)).await
}

#[tauri::command]
pub async fn imap_sync(req: SyncReq) -> Result<SyncOut, String> {
    blocking(move || imap_core::sync(&req)).await
}

#[derive(serde::Serialize)]
pub struct BodyOut {
    text: String,
}

#[tauri::command]
pub async fn imap_body(req: BodyReq) -> Result<BodyOut, String> {
    blocking(move || imap_core::body(&req).map(|text| BodyOut { text })).await
}
