//! Android: finance runs in the Windows app only, but the commands exist so the app links.

use serde_json::Value;

fn nope<T>() -> Result<T, String> {
    Err("Finance runs in the Windows app.".into())
}

#[tauri::command]
pub async fn vault_open() -> Result<(), String> {
    nope()
}

#[tauri::command]
pub fn vault_close() -> Result<(), String> {
    nope()
}

#[tauri::command]
pub async fn vault_list(_table: String) -> Result<Vec<Value>, String> {
    nope()
}

#[tauri::command]
pub async fn vault_put(_table: String, _id: String, _data: Value) -> Result<(), String> {
    nope()
}

#[tauri::command]
pub async fn vault_put_many(_table: String, _rows: Vec<(String, Value)>) -> Result<(), String> {
    nope()
}

#[tauri::command]
pub async fn vault_delete(_table: String, _id: String) -> Result<(), String> {
    nope()
}

#[tauri::command]
pub async fn vault_erase() -> Result<(), String> {
    nope()
}
