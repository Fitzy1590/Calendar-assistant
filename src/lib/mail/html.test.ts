// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { imagesAllowed, mailDocument, sanitizeMailHtml, withoutViewportUnits } from "./html";

describe("sanitizeMailHtml", () => {
  it("removes scripts, handlers, forms and frames", () => {
    const r = sanitizeMailHtml(
      `<p onclick="x()">Hi</p><script>alert(1)</script><iframe src="https://e.com"></iframe><form action="https://e.com"><input name="a"></form><object data="x"></object>`,
      true,
    );
    expect(r.html).toContain("<p>Hi</p>");
    expect(r.html).not.toMatch(/script|onclick|iframe|<form|<input|object/i);
  });

  it("keeps web and mail links, opens them in a new tab and drops javascript: links", () => {
    const r = sanitizeMailHtml(`<a href="https://a.com/x">A</a><a href="mailto:b@c.com">B</a><a href="javascript:alert(1)">C</a>`, true);
    expect(r.html).toContain(`href="https://a.com/x"`);
    expect(r.html).toContain(`target="_blank"`);
    expect(r.html).toContain(`rel="noopener noreferrer"`);
    expect(r.html).toContain("mailto:b@c.com");
    expect(r.html).not.toContain("javascript:");
    expect(r.links).toBe(2);
  });

  it("holds back remote pictures, tracking pixels and cid: pictures until allowed, and counts them", () => {
    const html = `<img src="https://t.example.com/p.gif" width="1"><img src="cid:logo"><div style="background:url(https://x.com/b.png)">x</div><td background="https://x.com/c.png">y</td>`;
    const off = sanitizeMailHtml(html, false);
    expect(off.html).not.toMatch(/https:\/\/(t|x)\./);
    expect(off.html).not.toContain("cid:");
    expect(off.blockedImages).toBe(2);
  });

  it("shows remote https pictures when allowed, but never http, cid or srcset", () => {
    const r = sanitizeMailHtml(
      `<img src="https://a.com/p.png" srcset="https://a.com/2x.png 2x"><img src="http://a.com/q.png"><img src="cid:x">`,
      true,
    );
    expect(r.html).toContain(`src="https://a.com/p.png"`);
    expect(r.html).not.toContain("srcset");
    expect(r.html).not.toContain("http://a.com");
    expect(r.html).toContain("no-referrer");
    expect(r.blockedImages).toBe(2);
  });

  it("keeps pictures that are inside the message", () => {
    const r = sanitizeMailHtml(`<img src="data:image/png;base64,AAAA">`, false);
    expect(r.html).toContain("data:image/png;base64,AAAA");
    expect(r.blockedImages).toBe(0);
  });

  it("keeps layout (tables, inline styles, a head style block) and drops @import", () => {
    const r = sanitizeMailHtml(
      `<html><head><style>@import url(https://e.com/a.css);td{color:red}</style></head><body><table><tr><td style="padding:4px">£5</td></tr></table></body></html>`,
      false,
    );
    expect(r.html).toContain("<table>");
    expect(r.html).toContain("padding:4px");
    expect(r.html).toContain("td{color:red}");
    expect(r.html).not.toMatch(/@import/);
  });

  it("starts clean for every message", () => {
    sanitizeMailHtml(`<img src="https://a.com/1.png">`, false);
    expect(sanitizeMailHtml(`<p>plain</p>`, false).blockedImages).toBe(0);
  });
});

describe("viewport units", () => {
  it("drops height rules in vh and zeroes other viewport lengths", () => {
    expect(withoutViewportUnits(".a{min-height:100vh;color:red}")).toBe(".a{color:red}");
    expect(withoutViewportUnits(".a{height:100dvh}")).toBe(".a{}");
    expect(withoutViewportUnits(".a{padding:5vmin 2px}")).toBe(".a{padding:0px 2px}");
    expect(withoutViewportUnits(".a{width:100%;height:40px}")).toBe(".a{width:100%;height:40px}");
  });
  it("applies in style blocks and style attributes", () => {
    const r = sanitizeMailHtml(
      `<style>.full{min-height:100vh;background:#eef}</style><div class="full" style="height:100vh;margin:2vh">x</div>`,
      false,
    );
    expect(r.html).not.toMatch(/\dvh/);
    expect(r.html).toContain("background:#eef");
  });
});

describe("mailDocument", () => {
  it("keeps the message from sizing itself to the frame (that made the frame grow without end)", () => {
    expect(mailDocument("<p>x</p>", false)).toContain("html,body{height:auto!important;min-height:0!important}");
  });

  it("blocks scripts always and pictures unless allowed", () => {
    expect(mailDocument("<p>x</p>", false)).toContain("default-src 'none'; style-src 'unsafe-inline'; img-src data:\"");
    expect(mailDocument("<p>x</p>", true)).toContain("img-src data: https:");
    expect(mailDocument("<p>x</p>", true)).not.toMatch(/script-src[^;]*unsafe/);
  });
});

describe("imagesAllowed", () => {
  it("follows the setting and the sender list", () => {
    expect(imagesAllowed("always", [], "a@b.com")).toBe(true);
    expect(imagesAllowed("block", ["a@b.com"], "a@b.com")).toBe(false);
    expect(imagesAllowed("trusted", ["A@B.com"], "a@b.com")).toBe(true);
    expect(imagesAllowed("trusted", ["x@y.com"], "a@b.com")).toBe(false);
  });
});
