//! Encrypted finance vault (SQLCipher, AES-256). No Tauri types, so it is tested standalone with `cargo test`.
//!
//! The file is encrypted with a random 256-bit key kept in the OS credential store (see `vault.rs`), passed to
//! SQLCipher as a raw key so no password hashing is involved. Rows are JSON in a fixed set of tables; the UI never
//! sends SQL. Key buffers are `Zeroizing` and dropped as soon as the connection is open.

use rusqlite::{params, Connection};
use serde_json::Value;
use std::path::Path;
use zeroize::Zeroizing;

/// The only tables the UI can touch. Names are interpolated into SQL, so this list is the whole attack surface.
pub const TABLES: [&str; 6] = [
    "accounts",
    "transactions",
    "subscriptions",
    "budgets",
    "savings_goals",
    "schedules",
];

pub const SCHEMA_VERSION: &str = "1";
const LOCKED: &str = "vault_locked";

/// Where the key lives. Windows: Credential Manager. Tests: memory.
pub trait KeyStore {
    fn get(&self) -> Result<Option<String>, String>;
    fn set(&mut self, hex: &str) -> Result<(), String>;
    fn clear(&mut self) -> Result<(), String>;
}

/// 32 bytes from the OS generator, as 64 hex characters.
pub fn new_key_hex() -> Result<Zeroizing<String>, String> {
    let rng = ring::rand::SystemRandom::new();
    let mut bytes = Zeroizing::new([0u8; 32]);
    ring::rand::SecureRandom::fill(&rng, &mut bytes[..])
        .map_err(|_| "the system random generator failed".to_string())?;
    let mut s = Zeroizing::new(String::with_capacity(64));
    for b in bytes.iter() {
        s.push_str(&format!("{b:02x}"));
    }
    Ok(s)
}

fn valid_key(k: &str) -> bool {
    k.len() == 64 && k.bytes().all(|b| b.is_ascii_hexdigit())
}

fn table(name: &str) -> Result<&'static str, String> {
    TABLES
        .iter()
        .copied()
        .find(|t| *t == name)
        .ok_or_else(|| format!("unknown finance table: {name}"))
}

fn open_with(path: &Path, hex: &str) -> Result<Connection, String> {
    if !valid_key(hex) {
        return Err(format!("{LOCKED}: the saved key is damaged"));
    }
    let conn = Connection::open(path).map_err(|e| format!("can't open the finance file: {e}"))?;
    conn.execute_batch("PRAGMA cipher_memory_security = ON;")
        .map_err(|e| e.to_string())?;
    let pragma = Zeroizing::new(format!("PRAGMA key = \"x'{hex}'\";"));
    conn.execute_batch(&pragma).map_err(|e| e.to_string())?;
    // A wrong key only shows on the first read.
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| {
        r.get::<_, i64>(0)
    })
    .map_err(|_| format!("{LOCKED}: this finance file can't be opened with the key on this PC"))?;
    for t in TABLES {
        conn.execute_batch(&format!(
            "CREATE TABLE IF NOT EXISTS {t} (id TEXT PRIMARY KEY, data TEXT NOT NULL);"
        ))
        .map_err(|e| e.to_string())?;
    }
    conn.execute_batch("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);")
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO meta (k, v) VALUES ('schema_version', ?1)",
        params![SCHEMA_VERSION],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

/// Open the vault, or create it the first time. Never creates a new vault over a file it can't open:
/// a missing or wrong key is reported as `vault_locked` and the file is left alone.
pub fn open_or_create(path: &Path, ks: &mut dyn KeyStore) -> Result<Connection, String> {
    match ks.get()? {
        Some(k) => {
            let k = Zeroizing::new(k);
            open_with(path, &k)
        }
        None if path.exists() => Err(format!(
            "{LOCKED}: the key for this finance file isn't on this PC (restored backup or another Windows user?)"
        )),
        None => {
            let k = new_key_hex()?;
            ks.set(&k)?; // save the key first, so a crash can't leave a file nobody can open
            open_with(path, &k)
        }
    }
}

pub fn list(conn: &Connection, t: &str) -> Result<Vec<Value>, String> {
    let t = table(t)?;
    let mut st = conn
        .prepare(&format!("SELECT data FROM {t} ORDER BY id"))
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(serde_json::from_str(&r.map_err(|e| e.to_string())?).map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn put(conn: &Connection, t: &str, id: &str, data: &Value) -> Result<(), String> {
    let t = table(t)?;
    conn.execute(
        &format!("INSERT INTO {t} (id, data) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET data = excluded.data"),
        params![id, data.to_string()],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

/// All rows or none (one transaction), for statement imports.
pub fn put_many(conn: &Connection, t: &str, rows: &[(String, Value)]) -> Result<(), String> {
    let t = table(t)?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for (id, data) in rows {
        tx.execute(
            &format!("INSERT INTO {t} (id, data) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET data = excluded.data"),
            params![id, data.to_string()],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

pub fn remove(conn: &Connection, t: &str, id: &str) -> Result<(), String> {
    let t = table(t)?;
    conn.execute(&format!("DELETE FROM {t} WHERE id = ?1"), params![id])
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Delete the file and the saved key. The caller drops its connection first and has asked the person to confirm.
pub fn erase(path: &Path, ks: &mut dyn KeyStore) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("can't delete the finance file: {e}")),
    }
    ks.clear()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[derive(Default)]
    struct Mem(Option<String>);
    impl KeyStore for Mem {
        fn get(&self) -> Result<Option<String>, String> {
            Ok(self.0.clone())
        }
        fn set(&mut self, hex: &str) -> Result<(), String> {
            self.0 = Some(hex.to_string());
            Ok(())
        }
        fn clear(&mut self) -> Result<(), String> {
            self.0 = None;
            Ok(())
        }
    }

    fn tmp() -> std::path::PathBuf {
        static N: AtomicUsize = AtomicUsize::new(0);
        let p = std::env::temp_dir().join(format!(
            "vault-test-{}-{}.vault",
            std::process::id(),
            N.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = std::fs::remove_file(&p);
        p
    }

    #[test]
    fn keys_are_64_hex_and_different() {
        let a = new_key_hex().unwrap();
        let b = new_key_hex().unwrap();
        assert!(valid_key(&a) && valid_key(&b));
        assert_ne!(*a, *b);
    }

    #[test]
    fn creates_stores_the_key_and_round_trips() {
        let p = tmp();
        let mut ks = Mem::default();
        {
            let c = open_or_create(&p, &mut ks).unwrap();
            assert!(ks.0.is_some());
            put(
                &c,
                "accounts",
                "a1",
                &json!({"name": "Everyday", "openingCents": 142000}),
            )
            .unwrap();
            put(
                &c,
                "accounts",
                "a1",
                &json!({"name": "Everyday", "openingCents": 5}),
            )
            .unwrap(); // replaces
        }
        let c = open_or_create(&p, &mut ks).unwrap();
        let rows = list(&c, "accounts").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["openingCents"], 5);
        remove(&c, "accounts", "a1").unwrap();
        assert!(list(&c, "accounts").unwrap().is_empty());
        let _ = std::fs::remove_file(&p);
    }

    #[test]
    fn the_file_is_not_plain_sqlite_and_hides_its_contents() {
        let p = tmp();
        let mut ks = Mem::default();
        {
            let c = open_or_create(&p, &mut ks).unwrap();
            put(
                &c,
                "transactions",
                "t1",
                &json!({"memo": "SECRET-MERCHANT-XYZ", "cents": -1234}),
            )
            .unwrap();
        }
        let bytes = std::fs::read(&p).unwrap();
        assert!(!bytes.starts_with(b"SQLite format 3"));
        assert!(!bytes.windows(19).any(|w| w == b"SECRET-MERCHANT-XYZ"));
        let _ = std::fs::remove_file(&p);
    }

    #[test]
    fn a_wrong_or_missing_key_locks_and_leaves_the_file_alone() {
        let p = tmp();
        let mut ks = Mem::default();
        drop(open_or_create(&p, &mut ks).unwrap());
        let before = std::fs::read(&p).unwrap();

        let mut wrong = Mem(Some(new_key_hex().unwrap().to_string()));
        let e = open_or_create(&p, &mut wrong).unwrap_err();
        assert!(e.starts_with("vault_locked"), "{e}");

        let mut none = Mem::default();
        let e = open_or_create(&p, &mut none).unwrap_err();
        assert!(e.starts_with("vault_locked"), "{e}");
        assert!(
            none.0.is_none(),
            "must not mint a key for a file it can't open"
        );

        assert_eq!(before, std::fs::read(&p).unwrap());
        let _ = std::fs::remove_file(&p);
    }

    #[test]
    fn a_damaged_key_is_refused() {
        let p = tmp();
        let mut ks = Mem(Some("not-hex".into()));
        assert!(open_or_create(&p, &mut ks)
            .unwrap_err()
            .starts_with("vault_locked"));
        assert!(!p.exists());
    }

    #[test]
    fn only_known_tables_are_reachable() {
        let p = tmp();
        let c = open_or_create(&p, &mut Mem::default()).unwrap();
        assert!(list(&c, "meta").is_err());
        assert!(list(&c, "accounts; DROP TABLE accounts").is_err());
        assert!(put(&c, "sqlite_master", "x", &json!({})).is_err());
        let _ = std::fs::remove_file(&p);
    }

    #[test]
    fn put_many_is_all_or_nothing_and_erase_removes_file_and_key() {
        let p = tmp();
        let mut ks = Mem::default();
        let c = open_or_create(&p, &mut ks).unwrap();
        let rows: Vec<(String, Value)> = (0..50)
            .map(|i| (format!("t{i}"), json!({"i": i})))
            .collect();
        put_many(&c, "transactions", &rows).unwrap();
        assert_eq!(list(&c, "transactions").unwrap().len(), 50);
        assert!(put_many(&c, "nope", &rows).is_err());
        drop(c);
        erase(&p, &mut ks).unwrap();
        assert!(!p.exists() && ks.0.is_none());
        erase(&p, &mut ks).unwrap(); // already gone is fine
    }
}
