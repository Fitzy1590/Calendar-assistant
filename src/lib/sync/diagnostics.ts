import { format } from "date-fns";
import { useStore } from "../../store";
import { platformName } from "../platform";
import { saveFile } from "../backup";
import { SYNC_COLLECTIONS, doc } from "./crdtEngine";
import { useP2p } from "./p2pStatus";
import * as Y from "yjs";

/**
 * On-demand sync diagnostics. OFF by default: while off, `logDiag` returns at once (no memory, no disk).
 * Nothing is ever written to disk by this module; "Export" builds one text file with secrets replaced by [REDACTED].
 */
const KEY = "sync-diag";
const MAX_LINES = 500;
let on = false;
try {
  on = globalThis.localStorage?.getItem(KEY) === "1";
} catch {
  /* storage unavailable: stays off */
}
const lines: string[] = [];

export const diagEnabled = () => on;
export function setDiag(v: boolean) {
  on = v;
  if (!v) lines.length = 0;
  try {
    globalThis.localStorage?.setItem(KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}
export function logDiag(event: string, detail?: unknown) {
  if (!on) return;
  lines.push(`${new Date().toISOString()} ${event}${detail === undefined ? "" : " " + JSON.stringify(redact(detail))}`);
  if (lines.length > MAX_LINES) lines.shift();
}

const SECRET_KEY = /key|token|secret|password|passkey|pairing|cookie|swid|espn_s2|authorization|bearer|serverurl/i;
const SECRET_TEXT = /(ya29\.[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+|sk-ant-[\w-]+|Bearer\s+\S+|AIza[\w-]{20,})/g;
export function redact(v: unknown): unknown {
  if (typeof v === "string") return v.replace(SECRET_TEXT, "[REDACTED]");
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET_KEY.test(k) ? (x ? "[REDACTED]" : x) : redact(x)]));
  return v;
}

export function buildDiagnostic(): string {
  const s = useStore.getState();
  const head = {
    when: new Date().toISOString(),
    app: typeof __APP_VERSION__ === "undefined" ? "dev" : __APP_VERSION__,
    platform: platformName(),
    userAgent: navigator.userAgent,
    online: navigator.onLine,
    sync: redact(s.settings.sync),
    status: useP2p.getState(),
    documentBytes: Y.encodeStateAsUpdate(doc).length,
    records: Object.fromEntries(SYNC_COLLECTIONS.map((c) => [c, Object.keys(s[c]).length])), // counts only, never contents
    diagnosticsRecording: on,
  };
  return `Calendar Assistant sync diagnostics\n${JSON.stringify(head, null, 2)}\n\n--- log (${lines.length} lines) ---\n${lines.join("\n")}\n`;
}

export const exportDiagnostic = () =>
  saveFile(`sync-diagnostics-${format(new Date(), "yyyy-MM-dd-HHmm")}.txt`, buildDiagnostic(), "text/plain");
