import { describe, expect, it } from "vitest";
import { buildDiagnostic, diagEnabled, logDiag, redact, setDiag } from "./diagnostics";
import { useStore } from "../../store";

describe("sync diagnostics", () => {
  it("is off by default and records nothing while off", () => {
    expect(diagEnabled()).toBe(false);
    logDiag("peers", { n: 1 });
    expect(buildDiagnostic()).toContain("log (0 lines)");
  });

  it("redacts keys, tokens, cookies and the pairing code", () => {
    const out = JSON.stringify(
      redact({
        apiKey: "sk-ant-abc123",
        ESPN_S2: "cookie",
        SWID: "{x}",
        pairingCode: "my-secret-code",
        note: "Bearer abc.def and ya29.tok-123",
        ok: "fine",
      }),
    );
    for (const secret of ["sk-ant-abc123", "cookie", "{x}", "my-secret-code", "abc.def", "ya29.tok-123"]) expect(out).not.toContain(secret);
    expect(out).toContain("fine");
  });

  it("exports counts and status but never the pairing code, server address or record text", () => {
    useStore.getState().updateSettings((s) => {
      s.sync.pairingCode = "pairing-secret-77";
      s.sync.serverUrl = "http://home.example:8787";
    });
    useStore.getState().upsert("tasks", { title: "Private dentist visit" } as never);
    setDiag(true);
    logDiag("relay open", { serverUrl: "http://home.example:8787", token: "ya29.abcdef" });
    const text = buildDiagnostic();
    setDiag(false);
    expect(text).toContain("relay open");
    expect(text).toMatch(/"tasks": \d+/);
    for (const leak of ["pairing-secret-77", "home.example", "Private dentist visit", "ya29.abcdef"]) expect(text).not.toContain(leak);
  });
});
