import { format, parseISO } from "date-fns";

export const uid = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, "").slice(0, 16);

export const ymd = (d: Date) => format(d, "yyyy-MM-dd");
export const localIso = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");
export const fromYmd = (s: string) => parseISO(s.length === 10 ? s + "T00:00" : s);
export const todayYmd = () => ymd(new Date());

export function fmtTime(d: Date, clock24: boolean) {
  return format(d, clock24 ? "HH:mm" : "h:mm a");
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function pairingCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("").replace(/(.{5})/, "$1-");
}
