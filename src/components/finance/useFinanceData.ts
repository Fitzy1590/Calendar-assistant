import { useCallback, useEffect, useState } from "react";
import { deleteRow, isLocked, listRows, openVault, putRow, type Table } from "../../lib/finance/vault";
import type { BudgetRow, FinAccount, Schedule } from "../../lib/finance/types";
import type { SubRecord } from "../../lib/finance/subscriptionTracker";

export type FinanceStatus = "loading" | "ready" | "locked" | "error";

/** Loads the encrypted vault into memory for the Finance page. Nothing is cached anywhere else. */
export function useFinanceData(enabled: boolean) {
  const [status, setStatus] = useState<FinanceStatus>("loading");
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<FinAccount[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [subs, setSubs] = useState<SubRecord[]>([]);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);

  const reload = useCallback(async () => {
    try {
      await openVault();
      const [a, s, u, b] = await Promise.all([
        listRows<FinAccount>("accounts"),
        listRows<Schedule>("schedules"),
        listRows<SubRecord>("subscriptions"),
        listRows<BudgetRow>("budgets"),
      ]);
      setAccounts(a);
      setSchedules(s);
      setSubs(u);
      setBudgets(b);
      setStatus("ready");
    } catch (e) {
      setError(String(e).replace(/^vault_locked:\s*/, ""));
      setStatus(isLocked(e) ? "locked" : "error");
    }
  }, []);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  const save = async <R extends { id: string }>(t: Table, row: R) => {
    await putRow(t, row.id, row);
    await reload();
  };
  const remove = async (t: Table, id: string) => {
    await deleteRow(t, id);
    await reload();
  };

  return { status, error, accounts, schedules, subs, budgets, reload, save, remove };
}
