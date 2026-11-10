import { describe, expect, it } from "vitest";
import { decodeWords, parseAddrList, unescapeSnippet } from "./headers";

describe("header helpers", () => {
  it("decodes encoded words (base64 and quoted-printable, UTF-8)", () => {
    expect(decodeWords("=?UTF-8?B?Q2Fmw6k=?=")).toBe("Café");
    expect(decodeWords("=?utf-8?Q?Caf=C3=A9_menu?=")).toBe("Café menu");
    expect(decodeWords("=?UTF-8?B?SGVsbG8g?= =?UTF-8?B?V29ybGQ=?=")).toBe("Hello World");
    expect(decodeWords("plain text")).toBe("plain text");
  });
  it("parses address lists with names, quotes and commas", () => {
    expect(parseAddrList('"Jones, Sam" <Sam@X.com>, other@y.com, Pat <pat@z.org>')).toEqual([
      { name: "Jones, Sam", address: "sam@x.com" },
      { name: undefined, address: "other@y.com" },
      { name: "Pat", address: "pat@z.org" },
    ]);
    expect(parseAddrList("=?UTF-8?B?Q2Fmw6k=?= <cafe@x.com>")[0].name).toBe("Café");
    expect(parseAddrList(undefined)).toEqual([]);
    expect(parseAddrList("undisclosed-recipients:;")).toEqual([]);
  });
  it("unescapes Gmail snippets", () => {
    expect(unescapeSnippet("Tom &amp; Jerry&#39;s &quot;bill&quot; &#x41;")).toBe('Tom & Jerry\'s "bill" A');
  });
});
