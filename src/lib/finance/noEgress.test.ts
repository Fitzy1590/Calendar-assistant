import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Finance code must never reach the network, sync, backups or the AI assistant (`.claude/rules/finance-engine.md`). */

const ROOTS = ["src/lib/finance", "src/components/finance", "src/pages/Finance.tsx"];
const BANNED_IMPORT =
  /from\s+["'][^"']*\/(http|sync|google|googleAuto|googleSync|googleDevice|driveSync|driveSyncApp|assistant|geminiAssistant|geminiSchema|email|invites|backup|diagnostics|mail\/(ai|compose|send|gmail|graph|imap|microsoft))["']/;
const BANNED_CALL =
  /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*[(.]|new\s+(WebSocket|EventSource|XMLHttpRequest)\b|localStorage|indexedDB/;

function files(p: string): string[] {
  let s;
  try {
    s = statSync(p);
  } catch {
    return [];
  }
  if (s.isFile()) return /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
  return readdirSync(p).flatMap((f) => files(join(p, f)));
}

describe("finance has no outside reach", () => {
  const all = ROOTS.flatMap((r) => files(join(process.cwd(), r)));
  it("finds the finance sources", () => expect(all.length).toBeGreaterThan(3));
  for (const f of all) {
    it(f.replace(process.cwd() + "/", ""), () => {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(BANNED_IMPORT);
      expect(src).not.toMatch(BANNED_CALL);
    });
  }
});
