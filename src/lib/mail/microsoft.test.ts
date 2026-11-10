import { describe, expect, it, vi } from "vitest";
import { graphApi } from "./microsoft";

const res = (status: number, body: unknown = {}) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response;

describe("graphApi", () => {
  it("adds the bearer token and returns the JSON", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { value: [1] }));
    expect(await graphApi(async () => "tok", f)("https://g/x")).toEqual({ value: [1] });
    expect((f.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok" });
  });
  it("retries once after a 401 with a fresh token, then gives up with a clear error", async () => {
    let n = 0;
    const f = vi
      .fn()
      .mockResolvedValueOnce(res(401))
      .mockResolvedValueOnce(res(200, { ok: true }));
    const cleared = vi.fn();
    expect(await graphApi(async () => "t" + ++n, f, cleared)("https://g/x")).toEqual({ ok: true });
    expect(cleared).toHaveBeenCalledOnce();
    const f2 = vi.fn().mockResolvedValue(res(401));
    await expect(graphApi(async () => "t", f2)("https://g/x")).rejects.toThrow("Graph 401");
  });
  it("returns null for 204 and 410, throws for other errors", async () => {
    expect(await graphApi(async () => "t", vi.fn().mockResolvedValue(res(410)))("https://g/x")).toBeNull();
    await expect(graphApi(async () => "t", vi.fn().mockResolvedValue(res(429, { error: "slow" })))("https://g/x")).rejects.toThrow(
      "Graph 429",
    );
  });
});

import { explainMicrosoftError } from "./microsoft";

describe("explainMicrosoftError", () => {
  it("turns the common setup errors into the fix", () => {
    expect(explainMicrosoftError("AADSTS7000218: The request body must contain client_assertion")).toMatch(/Allow public client flows/);
    expect(explainMicrosoftError("AADSTS50011: The redirect URI does not match")).toMatch(/Mobile and desktop/);
    expect(explainMicrosoftError("AADSTS700016: Application not found")).toMatch(/client\) ID/);
    expect(explainMicrosoftError("AADSTS50020: user account does not exist")).toMatch(/personal Microsoft accounts/);
  });
  it("leaves other messages alone", () => {
    expect(explainMicrosoftError("Outlook sign-in timed out. Try again.")).toBe("Outlook sign-in timed out. Try again.");
    expect(explainMicrosoftError("AADSTS99999: something new")).toBe("AADSTS99999: something new");
  });
});

import { parseTokenResponse } from "./microsoft";

describe("parseTokenResponse", () => {
  it("returns the tokens on success", () => {
    expect(parseTokenResponse(200, JSON.stringify({ access_token: "a", expires_in: 3600, refresh_token: "r" }))).toMatchObject({
      access_token: "a",
      refresh_token: "r",
    });
  });
  it("throws the description Microsoft gives, or a bare invalid_grant, or the status", () => {
    expect(() => parseTokenResponse(400, JSON.stringify({ error: "invalid_request", error_description: "AADSTS90023: x" }))).toThrow(
      "AADSTS90023",
    );
    expect(() => parseTokenResponse(400, JSON.stringify({ error: "invalid_grant", error_description: "long" }))).toThrow("invalid_grant");
    expect(() => parseTokenResponse(502, "<html>")).toThrow("Microsoft 502");
  });
});
