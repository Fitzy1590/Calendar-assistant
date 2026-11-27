import { notify } from "../platform";
import { todayYmd } from "../util";
import { fmtCents } from "./money";
import { dueAlerts, type SubRecord } from "./subscriptionTracker";
import { listRows, openVault, putRow, vaultAvailable } from "./vault";

/** Local reminders 3 days before a trial ends or a yearly plan renews. Runs only here; nothing is synced or sent. */
export async function runFinanceAlerts(): Promise<number> {
  if (!vaultAvailable()) return 0;
  await openVault();
  const rows = await listRows<SubRecord>("subscriptions");
  let shown = 0;
  for (const r of rows) {
    const fresh = dueAlerts([r], todayYmd()).filter((a) => !(r.notified ?? []).includes(a.id));
    for (const a of fresh) {
      await notify(
        a.kind === "trial" ? `${a.name} trial ends ${a.date}` : `${a.name} renews ${a.date}`,
        `${fmtCents(a.cents)}. Cancel or change it before then if you don't want it.`,
      );
      shown++;
    }
    if (fresh.length) await putRow("subscriptions", r.id, { ...r, notified: [...(r.notified ?? []), ...fresh.map((a) => a.id)] });
  }
  return shown;
}
