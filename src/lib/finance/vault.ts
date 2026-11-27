import { isAndroid, isTauri } from "../platform";

/** Client for the encrypted finance vault (Rust `vault.rs`). The key never reaches this side. */

export type Table = "accounts" | "transactions" | "subscriptions" | "budgets" | "savings_goals" | "schedules";

export const vaultAvailable = () => isTauri() && !isAndroid();

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/** The error text, with "vault_locked: …" meaning a file exists that this PC can't open. */
export const isLocked = (e: unknown) => String(e).includes("vault_locked");

export const openVault = () => call<void>("vault_open");
export const closeVault = () => call<void>("vault_close");
export const listRows = <T>(t: Table) => call<T[]>("vault_list", { table: t });
export const putRow = (t: Table, id: string, data: object) => call<void>("vault_put", { table: t, id, data });
export const putRows = (t: Table, rows: { id: string }[]) => call<void>("vault_put_many", { table: t, rows: rows.map((r) => [r.id, r]) });
export const deleteRow = (t: Table, id: string) => call<void>("vault_delete", { table: t, id });
export const eraseVault = () => call<void>("vault_erase");
