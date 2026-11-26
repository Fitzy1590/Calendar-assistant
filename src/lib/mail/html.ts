import DOMPurify from "dompurify";

/**
 * HTML mail made safe to show. Two layers: this cleaner removes anything that can run or phone home, and
 * the message is then shown in a sandboxed frame whose Content-Security-Policy blocks scripts altogether and
 * remote images unless you allowed them (`mailDocument`). Display only: the stored message is never changed.
 */

export type ImageMode = "always" | "trusted" | "block";

export interface RichMail {
  html: string; // cleaned body markup
  blockedImages: number; // pictures held back (remote, or attached with `cid:`)
  links: number; // links kept
}

const SAFE_LINK = /^(https?:|mailto:|tel:)/i;
const SECURE_IMG = /^https:\/\//i; // plain http pictures are never loaded

// the hook below reads and writes this while one message is being cleaned (sanitize is synchronous)
let run = { allowImages: false, blocked: 0, links: 0 };
let hooked = false;

function ensureHooks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      const href = node.getAttribute("href") ?? "";
      if (href && !SAFE_LINK.test(href.trim())) node.removeAttribute("href");
      if (node.getAttribute("href")) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
        run.links++;
      }
    }
    if (node.tagName === "IMG") {
      const src = (node.getAttribute("src") ?? "").trim();
      node.removeAttribute("srcset");
      node.setAttribute("referrerpolicy", "no-referrer");
      if (/^data:image\//i.test(src)) return; // already inside the message
      if (SECURE_IMG.test(src) && run.allowImages) return;
      node.removeAttribute("src");
      run.blocked++;
    }
    if (!run.allowImages) node.removeAttribute("background");
    const style = node.getAttribute("style");
    if (style && /url\s*\(/i.test(style)) {
      const kept = run.allowImages ? style.replace(/url\(\s*(['"]?)(?!https:)[^)]*\)/gi, "none") : style.replace(/url\([^)]*\)/gi, "none");
      node.setAttribute("style", kept);
    }
  });
}

export function sanitizeMailHtml(raw: string, allowImages: boolean): RichMail {
  ensureHooks();
  run = { allowImages, blocked: 0, links: 0 };
  const html = DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    FORCE_BODY: true, // keep a <style> block that sits in the <head>
    FORBID_TAGS: [
      "script",
      "iframe",
      "frame",
      "frameset",
      "object",
      "embed",
      "form",
      "input",
      "button",
      "select",
      "textarea",
      "meta",
      "link",
      "base",
      "svg",
      "math",
      "video",
      "audio",
      "source",
    ],
    FORBID_ATTR: ["srcset", "ping", "formaction"],
  }).replace(/@import[^;<]*;?/gi, ""); // a stylesheet can't pull in another one
  return { html, blockedImages: run.blocked, links: run.links };
}

/** The page the sandboxed frame shows. Its policy lets nothing run, and loads pictures only when allowed. */
export function mailDocument(cleanHtml: string, allowImages: boolean): string {
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src data:${allowImages ? " https:" : ""}`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>
html{background:#fff;color:#1b1b1f}
body{margin:0;padding:18px 20px;font:14.5px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;overflow-wrap:anywhere}
a{color:#2f5d8a}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}
</style></head><body>${cleanHtml}</body></html>`;
}

/** Whether pictures may load for this message, from the setting and the sender. */
export function imagesAllowed(mode: ImageMode, trusted: string[], sender: string): boolean {
  if (mode === "always") return true;
  if (mode === "block") return false;
  const a = sender.toLowerCase();
  return trusted.some((t) => t.toLowerCase() === a);
}
