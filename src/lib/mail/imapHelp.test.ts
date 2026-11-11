import { describe, expect, it } from "vitest";
import { alternativeServers, explainImapError } from "./imapHelp";

describe("IMAP error guide", () => {
  it("recognises a refused password and points Telstra users at an app password", () => {
    const f = explainImapError("LOGIN failed: No Response: [AUTHENTICATIONFAILED] Invalid credentials", "me@bigpond.com");
    expect(f.kind).toBe("password");
    expect(f.steps.join(" ")).toMatch(/Telstra/);
  });
  it("tells Yahoo users to make an app password, with the page to do it", () => {
    const f = explainImapError("LOGIN failed: app password required", "me@yahoo.com");
    expect(f.kind).toBe("password");
    expect(f.links[0].url).toMatch(/yahoo/);
  });
  it("offers other servers when the server can't be reached", () => {
    const f = explainImapError("Couldn't connect to imap.telstra.com:993: failed to lookup address (os error 11001)", "me@bigpond.net.au");
    expect(f.kind).toBe("server");
    expect(f.tryServers.map((s) => s.host)).toEqual(["mail.bigpond.com", "imap.bigpond.com"]);
  });
  it("explains secure-connection and IMAP-off problems, and falls back to showing the message", () => {
    expect(explainImapError("Couldn't start a secure connection: handshake failure", "a@b.com").kind).toBe("secure");
    expect(explainImapError("NO [UNAVAILABLE] IMAP access is disabled for this account", "a@b.com").kind).toBe("disabled");
    const u = explainImapError("something odd", "a@b.com");
    expect(u.kind).toBe("unknown");
    expect(u.steps.join(" ")).toContain("something odd");
  });
  it("guesses alternatives for an ordinary domain without repeating the first guess", () => {
    expect(alternativeServers("a@mycompany.com").map((s) => s.host)).toEqual(["mail.mycompany.com", "mycompany.com"]);
  });
});
