//! Keep sign-in tokens in the Windows Credential Manager instead of plain files.
//!
//! One Credential Manager entry holds only about 1,280 characters, and a Microsoft refresh token can be longer, so a
//! value is split into chunks (`<key>#0`, `<key>#1`, …) plus a count (`<key>#n`). The JavaScript side
//! (`src/lib/secureStore.ts`) falls back to this device's localStorage when these commands report an error
//! (any platform other than Windows).

use std::collections::HashMap;

const SERVICE: &str = "com.fitzy.calendarassistant";
const CHUNK: usize = 900; // characters per entry, safely under the limit

/// Where the entries live. Windows: Credential Manager. Tests: a map.
trait Backend {
    fn get(&self, name: &str) -> Result<Option<String>, String>;
    fn set(&mut self, name: &str, value: &str) -> Result<(), String>;
    fn delete(&mut self, name: &str) -> Result<(), String>;
}

fn split(value: &str) -> Vec<String> {
    let chars: Vec<char> = value.chars().collect();
    chars.chunks(CHUNK).map(|c| c.iter().collect()).collect()
}

fn count_of(b: &dyn Backend, key: &str) -> Result<usize, String> {
    Ok(b.get(&format!("{key}#n"))?
        .and_then(|s| s.parse().ok())
        .unwrap_or(0))
}

fn put(b: &mut dyn Backend, key: &str, value: &str) -> Result<(), String> {
    let old = count_of(b, key)?;
    let chunks = split(value);
    for (i, c) in chunks.iter().enumerate() {
        b.set(&format!("{key}#{i}"), c)?;
    }
    b.set(&format!("{key}#n"), &chunks.len().to_string())?;
    for i in chunks.len()..old {
        b.delete(&format!("{key}#{i}"))?; // the new value is shorter: drop the leftovers
    }
    Ok(())
}

fn read(b: &dyn Backend, key: &str) -> Result<Option<String>, String> {
    let n = count_of(b, key)?;
    if n == 0 {
        return Ok(None);
    }
    let mut out = String::new();
    for i in 0..n {
        match b.get(&format!("{key}#{i}"))? {
            Some(c) => out.push_str(&c),
            None => return Ok(None), // damaged: treat as missing so the person signs in again
        }
    }
    Ok(Some(out))
}

fn remove(b: &mut dyn Backend, key: &str) -> Result<(), String> {
    let n = count_of(b, key)?;
    for i in 0..n {
        b.delete(&format!("{key}#{i}"))?;
    }
    b.delete(&format!("{key}#n"))
}

#[cfg(windows)]
struct Windows;

#[cfg(windows)]
impl Backend for Windows {
    fn get(&self, name: &str) -> Result<Option<String>, String> {
        let e = keyring::Entry::new(SERVICE, name).map_err(|e| e.to_string())?;
        match e.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    fn set(&mut self, name: &str, value: &str) -> Result<(), String> {
        keyring::Entry::new(SERVICE, name)
            .and_then(|e| e.set_password(value))
            .map_err(|e| e.to_string())
    }
    fn delete(&mut self, name: &str) -> Result<(), String> {
        match keyring::Entry::new(SERVICE, name).and_then(|e| e.delete_credential()) {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[tauri::command]
pub fn secure_store_get(key: String) -> Result<Option<String>, String> {
    #[cfg(windows)]
    return read(&Windows, &key);
    #[cfg(not(windows))]
    {
        let _ = key;
        Err("secure store is only available on Windows".into())
    }
}

#[tauri::command]
pub fn secure_store_set(key: String, value: String) -> Result<(), String> {
    #[cfg(windows)]
    return put(&mut Windows, &key, &value);
    #[cfg(not(windows))]
    {
        let _ = (key, value);
        Err("secure store is only available on Windows".into())
    }
}

#[tauri::command]
pub fn secure_store_delete(key: String) -> Result<(), String> {
    #[cfg(windows)]
    return remove(&mut Windows, &key);
    #[cfg(not(windows))]
    {
        let _ = key;
        Err("secure store is only available on Windows".into())
    }
}

#[cfg(test)]
#[derive(Default)]
struct Mem(HashMap<String, String>);

#[cfg(test)]
impl Backend for Mem {
    fn get(&self, name: &str) -> Result<Option<String>, String> {
        Ok(self.0.get(name).cloned())
    }
    fn set(&mut self, name: &str, value: &str) -> Result<(), String> {
        assert!(
            value.chars().count() <= 1280,
            "entry too big for Credential Manager"
        );
        self.0.insert(name.into(), value.into());
        Ok(())
    }
    fn delete(&mut self, name: &str) -> Result<(), String> {
        self.0.remove(name);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_long_token_round_trips_in_small_entries() {
        let mut m = Mem::default();
        let token: String = (0..2600)
            .map(|i| char::from(b'a' + (i % 26) as u8))
            .collect();
        put(&mut m, "ms-refresh:acc", &token).unwrap();
        assert_eq!(
            read(&m, "ms-refresh:acc").unwrap().as_deref(),
            Some(token.as_str())
        );
        assert_eq!(m.0.get("ms-refresh:acc#n").map(String::as_str), Some("3"));
    }

    #[test]
    fn missing_and_empty_are_none() {
        let m = Mem::default();
        assert_eq!(read(&m, "nope").unwrap(), None);
    }

    #[test]
    fn a_shorter_value_leaves_no_old_chunks_behind() {
        let mut m = Mem::default();
        put(&mut m, "k", &"x".repeat(2000)).unwrap();
        put(&mut m, "k", "short").unwrap();
        assert_eq!(read(&m, "k").unwrap().as_deref(), Some("short"));
        assert!(
            m.0.keys().all(|k| k == "k#0" || k == "k#n"),
            "{:?}",
            m.0.keys()
        );
    }

    #[test]
    fn delete_removes_every_entry() {
        let mut m = Mem::default();
        put(&mut m, "k", &"y".repeat(2000)).unwrap();
        remove(&mut m, "k").unwrap();
        assert!(m.0.is_empty());
        assert_eq!(read(&m, "k").unwrap(), None);
    }

    #[test]
    fn a_damaged_value_reads_as_missing() {
        let mut m = Mem::default();
        put(&mut m, "k", &"z".repeat(2000)).unwrap();
        m.0.remove("k#1");
        assert_eq!(read(&m, "k").unwrap(), None);
    }

    #[test]
    fn splitting_counts_characters_not_bytes() {
        let v: String = "é".repeat(1000);
        let parts = split(&v);
        assert_eq!(parts.len(), 2);
        assert_eq!(parts.concat(), v);
    }
}
