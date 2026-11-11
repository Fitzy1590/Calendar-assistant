import { describe, expect, it } from "vitest";
import { pollMsToken, requestMsDeviceCode, type MsPost } from "./microsoftDevice";

const code = { deviceCode: "d", userCode: "ABCD", url: "u", expiresAt: 100_000, interval: 5 };

describe("Microsoft device code", () => {
  it("reads the code response", async () => {
    const post: MsPost = async () => ({
      status: 200,
      json: { device_code: "dc", user_code: "XYZ", verification_uri: "https://microsoft.com/devicelogin", expires_in: 900, interval: 5 },
    });
    const c = await requestMsDeviceCode(post, "id", "s", 1000);
    expect(c).toMatchObject({ deviceCode: "dc", userCode: "XYZ", expiresAt: 901_000, interval: 5 });
  });
  it("explains a refused request", async () => {
    const post: MsPost = async () => ({ status: 400, json: { error_description: "AADSTS700016: no app" } });
    await expect(requestMsDeviceCode(post, "id", "s")).rejects.toThrow("AADSTS700016");
  });
  it("waits through pending and slow_down, then returns tokens", async () => {
    const answers = [{ error: "authorization_pending" }, { error: "slow_down" }, { access_token: "a", refresh_token: "r", expires_in: 60 }];
    const sleeps: number[] = [];
    const post: MsPost = async () => {
      const j = answers.shift()!;
      return { status: j.access_token ? 200 : 400, json: j };
    };
    const t = await pollMsToken(
      post,
      async (ms) => void sleeps.push(ms),
      "id",
      code,
      undefined,
      () => 0,
    );
    expect(t).toEqual({ access: "a", refresh: "r", expiresIn: 60 });
    expect(sleeps).toEqual([5000, 5000, 10000]);
  });
  it("stops when declined, cancelled or expired", async () => {
    const declined: MsPost = async () => ({ status: 400, json: { error: "authorization_declined" } });
    await expect(
      pollMsToken(
        declined,
        async () => {},
        "id",
        code,
        undefined,
        () => 0,
      ),
    ).rejects.toThrow("cancelled");
    const flag = { cancelled: true };
    await expect(
      pollMsToken(
        declined,
        async () => {},
        "id",
        code,
        flag,
        () => 0,
      ),
    ).rejects.toThrow("cancelled");
    const expired: MsPost = async () => ({ status: 400, json: { error: "expired_token" } });
    await expect(
      pollMsToken(
        expired,
        async () => {},
        "id",
        code,
        undefined,
        () => 0,
      ),
    ).rejects.toThrow("expired");
  });
});
