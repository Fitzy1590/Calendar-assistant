import { addDays } from "date-fns";
import { useEffect, useState } from "react";
import { project } from "../../lib/finance/cashflowEngine";
import type { DayFlag, FinAccount, Schedule } from "../../lib/finance/types";
import { listRows, openVault, vaultAvailable } from "../../lib/finance/vault";
import { todayYmd, ymd, fromYmd } from "../../lib/util";
import { useStore } from "../../store";

/** Low-balance and overdraft days for the calendar. Flags only, never amounts, so a shared screen shows nothing private. */
export function useCashflowFlags(days = 90): Map<string, DayFlag> {
  const { enabled, bufferCents } = useStore((s) => s.settings.finance);
  const [flags, setFlags] = useState<Map<string, DayFlag>>(new Map());
  useEffect(() => {
    if (!enabled || !vaultAvailable()) return;
    let live = true;
    void (async () => {
      try {
        await openVault();
        const [a, s] = await Promise.all([listRows<FinAccount>("accounts"), listRows<Schedule>("schedules")]);
        const today = todayYmd();
        const out = new Map<string, DayFlag>();
        for (const d of project(a, s, today, ymd(addDays(fromYmd(today), days - 1)), bufferCents))
          if (d.flags[0]) out.set(d.date, d.flags[0]);
        if (live) setFlags(out);
      } catch {
        if (live) setFlags(new Map()); // locked or unavailable: show nothing
      }
    })();
    return () => {
      live = false;
    };
  }, [enabled, bufferCents, days]);
  return flags;
}
