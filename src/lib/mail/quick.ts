import type { MailMessage, MailSettings } from "./types";

/** The quick "not like this" choices on an important email or alert. Pure. */

export type ImportantKey = keyof MailSettings["important"];

/** Which "what counts as important" switch made this email important, if one did. */
export function importanceSource(m: Pick<MailMessage, "bucket" | "reasons" | "override" | "notify">): ImportantKey | null {
  if (m.reasons.some((r) => /Your contacts|Contacts/i.test(r))) return "contacts";
  if (m.bucket === "urgent" || m.bucket === "action") return "actionUrgent";
  if (m.bucket === "financial") return "financial";
  return null;
}

export const SOURCE_LABEL: Record<ImportantKey, string> = {
  actionUrgent: "action required and urgent",
  contacts: "from my contacts",
  financial: "bills and bank notices",
  everything: "all personal mail",
};

/** "Not important for this type": turn off the switch that made it important. */
export function stopImportant(settings: MailSettings["important"], key: ImportantKey): MailSettings["important"] {
  return { ...settings, [key]: false };
}
