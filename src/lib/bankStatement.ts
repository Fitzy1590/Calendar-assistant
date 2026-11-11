/** Reads a bank statement export (CSV, OFX/QFX or QIF) into plain transactions. Runs on this device; nothing is uploaded. Pure. */

export interface Txn {
  date: string; // yyyy-MM-dd
  amount: number; // negative = money out
  description: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const valid = (y: number, m: number, d: number) => y > 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
const iso = (y: number, m: number, d: number) => (valid(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null);
const year = (y: number) => (y < 100 ? 2000 + y : y);

/** Dates the way banks write them. Day comes first (Australian style) unless that can't be right. */
export function parseDate(s: string): string | null {
  const t = s.trim().replace(/^"|"$/g, "");
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{4})(\d{2})(\d{2})/); // OFX: 20261110120000
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.'](\d{2,4})$/);
  if (m) {
    const [a, b, y] = [+m[1], +m[2], year(+m[3])];
    return b > 12 && a <= 12 ? iso(y, a, b) : iso(y, b, a);
  }
  m = t.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{2,4})$/);
  if (m) {
    const mon = MONTHS.indexOf(m[2].toLowerCase());
    return mon < 0 ? null : iso(year(+m[3]), mon + 1, +m[1]);
  }
  return null;
}

/** "-$1,234.50", "(12.99)", "12.99 DR", "12.99-". */
export function parseAmount(s: string): number | null {
  let t = s.trim().replace(/^"|"$/g, "");
  if (!t) return null;
  const negative = /^\(.*\)$/.test(t) || /-/.test(t) || /\bDR\b/i.test(t);
  t = t.replace(/[^0-9.]/g, "");
  if (!t || !/^\d*\.?\d+$/.test(t)) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

/** One CSV line into fields, with quotes and doubled quotes handled. */
export function splitCsvLine(line: string, sep = ","): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') ((cur += '"'), i++);
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) (out.push(cur), (cur = ""));
    else cur += ch;
  }
  out.push(cur);
  return out.map((f) => f.trim());
}

const isMoney = (s: string) => /^[-+($]*\s*\$?\s*[\d,]*\.?\d+\)?\s*(DR|CR)?-?$/i.test(s.trim()) && /\d/.test(s);

export function parseCsv(text: string): Txn[] {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = [",", ";", "\t"].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const rows = lines.map((l) => splitCsvLine(l, sep));
  const head = rows[0].map((h) => h.toLowerCase());
  const hasHeader = !rows[0].some((f) => parseDate(f));
  const body = hasHeader ? rows.slice(1) : rows;
  const width = Math.max(...body.map((r) => r.length), 0);
  const share = (col: number, test: (s: string) => boolean) =>
    body.filter((r) => r[col] !== undefined && r[col] !== "" && test(r[col])).length / Math.max(1, body.length);
  const cols = Array.from({ length: width }, (_, i) => i);
  const find = (...names: string[]) => (hasHeader ? head.findIndex((h) => names.some((n) => h.includes(n))) : -1);

  let dateCol = find("date");
  if (dateCol < 0) dateCol = cols.find((c) => share(c, (s) => !!parseDate(s)) > 0.8) ?? -1;
  if (dateCol < 0) return [];

  const debitCol = find("debit", "withdrawal", "money out", "paid out");
  const creditCol = find("credit", "deposit", "money in", "paid in");
  let amountCol = find("amount");
  if (amountCol < 0 && debitCol < 0) amountCol = cols.find((c) => c !== dateCol && share(c, isMoney) > 0.8) ?? -1; // first money column (balance comes later)

  let descCol = find("description", "narrative", "details", "transaction", "merchant", "payee", "particulars", "memo");
  if (descCol < 0 || descCol === dateCol) {
    const texty = cols.filter((c) => c !== dateCol && c !== amountCol && share(c, (s) => /[A-Za-z]{3}/.test(s)) > 0.5);
    const avg = (c: number) => body.reduce((n, r) => n + (r[c]?.length ?? 0), 0);
    descCol = texty.sort((a, b) => avg(b) - avg(a))[0] ?? -1;
  }
  if (descCol < 0) return [];

  const out: Txn[] = [];
  for (const r of body) {
    const date = parseDate(r[dateCol] ?? "");
    if (!date) continue;
    let amount: number | null = null;
    if (debitCol >= 0 || creditCol >= 0) {
      const d = debitCol >= 0 ? parseAmount(r[debitCol] ?? "") : null;
      const c = creditCol >= 0 ? parseAmount(r[creditCol] ?? "") : null;
      if (d) amount = -Math.abs(d);
      else if (c) amount = Math.abs(c);
    }
    if (amount === null && amountCol >= 0) amount = parseAmount(r[amountCol] ?? "");
    const description = (r[descCol] ?? "").replace(/\s+/g, " ").trim();
    if (amount === null || !description) continue;
    out.push({ date, amount, description });
  }
  return out;
}

/** OFX / QFX (the "Money" or "Quicken" download most banks offer). */
export function parseOfx(text: string): Txn[] {
  const out: Txn[] = [];
  const tag = (block: string, name: string) => block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"))?.[1]?.trim() ?? "";
  for (const block of text.split(/<STMTTRN>/i).slice(1)) {
    const date = parseDate(tag(block, "DTPOSTED"));
    const amount = parseFloat(tag(block, "TRNAMT"));
    const description = [tag(block, "NAME"), tag(block, "MEMO")].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (date && Number.isFinite(amount) && description) out.push({ date, amount, description });
  }
  return out;
}

/** QIF: records end with ^; D = date, T = amount, P = payee, M = memo. */
export function parseQif(text: string): Txn[] {
  const out: Txn[] = [];
  for (const rec of text.split(/^\^\s*$/m)) {
    let date: string | null = null;
    let amount: number | null = null;
    const desc: string[] = [];
    for (const line of rec.split(/\r?\n/)) {
      const v = line.slice(1).trim();
      if (line[0] === "D") date = parseDate(v.replace(/'/g, "/").replace(/\s/g, ""));
      else if (line[0] === "T" || line[0] === "U") amount = parseAmount(v);
      else if (line[0] === "P" || line[0] === "M") desc.push(v);
    }
    if (date && amount !== null && desc.length) out.push({ date, amount, description: desc.join(" ").replace(/\s+/g, " ").trim() });
  }
  return out;
}

/** Works out the format from the file's contents (the name is only a hint). */
export function parseStatement(text: string, fileName = ""): Txn[] {
  if (/<OFX>|<STMTTRN>/i.test(text)) return parseOfx(text);
  if (/\.qif$/i.test(fileName) || /^!Type:/m.test(text)) return parseQif(text);
  return parseCsv(text);
}
