import { describe, expect, it } from "vitest";
import { guessImap } from "./imapPresets";
import { imapProvider, mapImap, testImap, type ImapInvoke } from "./imap";

const native = (uid: number, over: any = {}) => ({
  uid,
  from: { name: "Sam", address: "sam@example.com" },
  to: [{ address: "me@bigpond.com" }],
  cc: [],
  subject: "Hello",
  date_ms: 1700000000000,
  seen: false,
  preview: "Hi there",
  headers: { "list-id": "<x.y>" },
  ...over,
});
const creds = async () => ({ host: "imap.telstra.com", port: 993, user: "me@bigpond.com", password: "pw" });

describe("IMAP adapter", () => {
  it("maps the native result and passes what's already cached", async () => {
    let seen: any;
    const invoke: ImapInvoke = async (cmd, args) => {
      seen = { cmd, args };
      return { uid_validity: 7, reset: false, messages: [native(5)], seen: [[3, true]], removed: [2] } as never;
    };
    const p = imapProvider({ invoke, creds, known: async () => [2, 3] });
    const r = await p.sync({ id: "imap-1", deltaLink: "7" });
    expect(seen.cmd).toBe("imap_sync");
    expect(seen.args.req).toMatchObject({ host: "imap.telstra.com", known_uids: [2, 3], known_validity: 7, since_days: 30 });
    expect(r.upserts[0]).toMatchObject({ id: "imap-1:5", providerId: "5", subject: "Hello", isRead: false, importance: "normal" });
    expect(r.removedIds).toEqual(["imap-1:2"]);
    expect(r.readStates).toEqual([{ id: "imap-1:3", isRead: true }]);
    expect(r.deltaLink).toBe("7");
    expect(r.initial).toBe(false);
  });
  it("is initial on the first sync and after a UIDVALIDITY reset", async () => {
    const mk =
      (reset: boolean): ImapInvoke =>
      async () =>
        ({ uid_validity: 9, reset, messages: [], seen: [], removed: [] }) as never;
    expect((await imapProvider({ invoke: mk(false), creds, known: async () => [] }).sync({ id: "a" })).initial).toBe(true);
    expect((await imapProvider({ invoke: mk(true), creds, known: async () => [1] }).sync({ id: "a", deltaLink: "8" })).initial).toBe(true);
  });
  it("fetches a body by UID", async () => {
    const invoke: ImapInvoke = async (cmd, args) =>
      cmd === "imap_body" && (args.req as any).uid === 12 ? ({ text: "Amount due" } as never) : ({} as never);
    expect(await imapProvider({ invoke, creds, known: async () => [] }).bodyText("12")).toBe("Amount due");
  });
  it("handles a message with no subject or sender", () => {
    const m = mapImap(native(1, { subject: "", from: undefined }), "a");
    expect(m.subject).toBe("(no subject)");
    expect(m.from.address).toBe("");
  });
  it("test connection passes the error through", async () => {
    const invoke: ImapInvoke = async () => {
      throw "LOGIN failed: wrong password";
    };
    await expect(testImap(invoke, { host: "h", port: 993, user: "u", password: "p" })).rejects.toBe("LOGIN failed: wrong password");
  });
});

describe("server presets", () => {
  it("knows Telstra / Bigpond", () => {
    for (const a of ["me@bigpond.com", "ME@bigpond.net.au", "x@telstra.com"]) {
      expect(guessImap(a)).toMatchObject({ host: "imap.telstra.com", port: 993 });
    }
  });
  it("points Gmail and Outlook at their own buttons", () => {
    expect(guessImap("a@gmail.com").useInstead).toBe("gmail");
    expect(guessImap("a@hotmail.com").useInstead).toBe("outlook");
  });
  it("guesses imap.<domain> for unknown providers", () => {
    expect(guessImap("a@mycompany.com.au")).toMatchObject({ host: "imap.mycompany.com.au", port: 993 });
    expect(guessImap("").host).toBe("");
  });
});
