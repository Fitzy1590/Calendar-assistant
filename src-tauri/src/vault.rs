//! Tauri commands for the encrypted finance vault. Logic and tests live in `vault_core.rs`.
//! The key stays in Rust: it is read from the Windows Credential Manager and never sent to the web view.

use crate::{secure_store, vault_core};
use rusqlite::Connection;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

const KEY_NAME: &str = "finance-vault-key";
static VAULT: Mutex<Option<Connection>> = Mutex::new(None);

struct Cred;
impl vault_core::KeyStore for Cred {
    fn get(&self) -> Result<Option<String>, String> {
        secure_store::get_secret(KEY_NAME)
    }
    fn set(&mut self, hex: &str) -> Result<(), String> {
        secure_store::set_secret(KEY_NAME, hex)
    }
    fn clear(&mut self) -> Result<(), String> {
        secure_store::delete_secret(KEY_NAME)
    }
}

fn path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("finance.vault"))
}

fn lock() -> Result<std::sync::MutexGuard<'static, Option<Connection>>, String> {
    VAULT
        .lock()
        .map_err(|_| "finance vault is busy".to_string())
}

fn with<T>(f: impl FnOnce(&Connection) -> Result<T, String>) -> Result<T, String> {
    let g = lock()?;
    match g.as_ref() {
        Some(c) => f(c),
        None => Err("vault_closed: open the finance vault first".into()),
    }
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

/// Opens the vault, creating it (and its key) the first time. Errors starting `vault_locked` mean the file exists
/// but this PC has no working key; nothing is overwritten.
#[tauri::command]
pub async fn vault_open(app: tauri::AppHandle) -> Result<(), String> {
    let p = path(&app)?;
    blocking(move || {
        let mut g = lock()?;
        if g.is_none() {
            *g = Some(vault_core::open_or_create(&p, &mut Cred)?);
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub fn vault_close() -> Result<(), String> {
    *lock()? = None;
    Ok(())
}

#[tauri::command]
pub async fn vault_list(table: String) -> Result<Vec<Value>, String> {
    blocking(move || with(|c| vault_core::list(c, &table))).await
}

#[tauri::command]
pub async fn vault_put(table: String, id: String, data: Value) -> Result<(), String> {
    blocking(move || with(|c| vault_core::put(c, &table, &id, &data))).await
}

#[tauri::command]
pub async fn vault_put_many(table: String, rows: Vec<(String, Value)>) -> Result<(), String> {
    blocking(move || with(|c| vault_core::put_many(c, &table, &rows))).await
}

#[tauri::command]
pub async fn vault_delete(table: String, id: String) -> Result<(), String> {
    blocking(move || with(|c| vault_core::remove(c, &table, &id))).await
}

/// Deletes the finance file and its key. The UI asks the person to confirm first.
#[tauri::command]
pub async fn vault_erase(app: tauri::AppHandle) -> Result<(), String> {
    let p = path(&app)?;
    blocking(move || {
        *lock()? = None;
        vault_core::erase(&p, &mut Cred)
    })
    .await
}
