import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { allMessages, approxSize, clearAccount, deleteMessages, evictOver, getMessage, putMessages, resetCacheConnection } from "./cache";
import type { MailMessage } from "./types";

const msg = (id: string, p: Partial<MailMessage> = {}): MailMessage => ({
  id,
  accountId: "a",
  providerId: id,
  threadId: "t",
  subject: id,
  from: { address: "x@y.com" },
  to: [],
  cc: [],
  receivedAt: Number(id.replace(/\D/g, "")) || 0,
  isRead: false,
  preview: "p",
  folder: "inbox",
  headers: {},
  bucket: "inbox",
  important: false,
  reasons: [],
  ...p,
});

beforeEach(async () => {
  await clearAccount("a");
  await clearAccount("b");
  resetCacheConnection();
});

describe("mail cache", () => {
  it("stores messages newest first and finds one by id", async () => {
    await putMessages([msg("a:1"), msg("a:3"), msg("a:2")], true);
    expect((await allMessages()).map((m) => m.id)).toEqual(["a:3", "a:2", "a:1"]);
    expect((await getMessage("a:2"))?.subject).toBe("a:2");
  });
  it("drops the text when text caching is off but keeps the preview", async () => {
    await putMessages([msg("a:1", { text: "secret body" })], false);
    const m = await getMessage("a:1");
    expect(m?.text).toBeUndefined();
    expect(m?.preview).toBe("p");
  });
  it("keeps the text when caching is on", async () => {
    await putMessages([msg("a:1", { text: "body" })], true);
    expect((await getMessage("a:1"))?.text).toBe("body");
  });
  it("updates in place and deletes by id", async () => {
    await putMessages([msg("a:1")], true);
    await putMessages([msg("a:1", { isRead: true })], true);
    expect((await allMessages()).length).toBe(1);
    expect((await getMessage("a:1"))?.isRead).toBe(true);
    await deleteMessages(["a:1"]);
    expect(await getMessage("a:1")).toBeUndefined();
  });
  it("removes only one account's mail on disconnect", async () => {
    await putMessages([msg("a:1"), msg("b:2", { accountId: "b" })], true);
    await clearAccount("a");
    expect((await allMessages()).map((m) => m.id)).toEqual(["b:2"]);
  });
  it("evicts the oldest first when over the cap", async () => {
    await putMessages([msg("a:1"), msg("a:2"), msg("a:3")], true);
    const one = (await approxSize()) / 3;
    const removed = await evictOver(one * 2 + 5);
    expect(removed).toBe(1);
    expect((await allMessages()).map((m) => m.id)).toEqual(["a:3", "a:2"]);
  });
});
