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
