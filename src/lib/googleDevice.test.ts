import { describe, expect, it } from "vitest";
import { pollForToken, refreshAccess, requestDeviceCode, type DeviceCode, type Post } from "./googleDevice";

const creds = { clientId: "id", clientSecret: "secret" };
const code = (over: Partial<DeviceCode> = {}): DeviceCode => ({
  deviceCode: "dc",
  userCode: "ABCD-EFGH",
  url: "https://www.google.com/device",
  expiresAt: 10_000_000,
  interval: 5,
  ...over,
});
/** A fake Google: replies from a script, one per call, and a clock that advances as the code sleeps. */
function script(replies: { ok: boolean; json: any }[]) {
  let i = 0;
  let t = 0;
  const calls: { url: string; form: Record<string, string> }[] = [];
  const post: Post = async (url, form) => {
    calls.push({ url, form });
    return replies[Math.min(i++, replies.length - 1)];
  };
  const waits: number[] = [];
  const sleep = async (ms: number) => {
    waits.push(ms);
    t += ms;
  };
  return { post, sleep, waits, calls, now: () => t };
}
const pending = { ok: false, json: { error: "authorization_pending" } };
const win = { ok: true, json: { access_token: "AT", refresh_token: "RT", expires_in: 3599 } };

describe("device code sign-in", () => {
  it("asks only for the Drive app folder permission and reads the code", async () => {
    const s = script([
      {
        ok: true,
        json: {
          device_code: "dc",
          user_code: "ABCD-EFGH",
          verification_url: "https://www.google.com/device",
          expires_in: 1800,
          interval: 5,
        },
      },
    ]);
    const c = await requestDeviceCode(s.post, "cid", 1000);
    expect(s.calls[0].form).toEqual({ client_id: "cid", scope: "https://www.googleapis.com/auth/drive.file" });
    expect(c).toMatchObject({ userCode: "ABCD-EFGH", expiresAt: 1000 + 1800_000, interval: 5 });
  });
  it("explains a wrong client type", async () => {
    const s = script([{ ok: false, json: { error: "invalid_client" } }]);
    await expect(requestDeviceCode(s.post, "bad")).rejects.toThrow("TVs and Limited Input");
  });
  it("keeps checking while pending, then returns the tokens", async () => {
    const s = script([pending, pending, win]);
    const t = await pollForToken(s.post, s.sleep, creds, code(), undefined, s.now);
    expect(t).toEqual({ access: "AT", refresh: "RT", expiresIn: 3599 });
    expect(s.waits).toEqual([5000, 5000, 5000]);
    expect(s.calls[2].form).toMatchObject({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: "dc",
      client_secret: "secret",
    });
  });
  it("checks less often when Google says slow down", async () => {
    const s = script([{ ok: false, json: { error: "slow_down" } }, pending, win]);
    await pollForToken(s.post, s.sleep, creds, code(), undefined, s.now);
    expect(s.waits).toEqual([5000, 10000, 10000]);
  });
  it("stops when refused, expired, or cancelled", async () => {
    await expect(
      pollForToken(
        script([{ ok: false, json: { error: "access_denied" } }]).post,
        async () => {},
        creds,
        code(),
        undefined,
        () => 0,
      ),
    ).rejects.toThrow("cancelled on the Google page");
    await expect(
      pollForToken(
        script([{ ok: false, json: { error: "expired_token" } }]).post,
        async () => {},
        creds,
        code(),
        undefined,
        () => 0,
      ),
    ).rejects.toThrow("expired");
    const flag = { cancelled: false };
    const s = script([pending]);
    const p = pollForToken(s.post, async () => void (flag.cancelled = true), creds, code(), flag, s.now);
    await expect(p).rejects.toThrow("cancelled");
  });
  it("gives up when the code runs out of time", async () => {
    const s = script([pending]);
    await expect(pollForToken(s.post, s.sleep, creds, code({ expiresAt: 12_000 }), undefined, s.now)).rejects.toThrow("expired");
    expect(s.calls.length).toBeLessThan(5);
  });
  it("refreshes, and reports a revoked sign-in as invalid_grant", async () => {
    expect((await refreshAccess(script([win]).post, creds, "RT")).access).toBe("AT");
    await expect(refreshAccess(script([{ ok: false, json: { error: "invalid_grant" } }]).post, creds, "RT")).rejects.toThrow(
      "invalid_grant",
    );
  });
});
