/**
 * Tidy plain-text mail for reading: newsletters fill the text part with long tracking links like
 * `Shop now<https://click.example.com/?qs=...>`. This removes the link noise and extra blank lines.
 * Display only: the stored message is never changed.
 */

const ANGLE_URL = /\s*<https?:\/\/[^>\s]+>/g;
const BRACKET_LABEL = /\[([^\]\n]{1,80})\]\s*(?=\n|$)/g;
const BRACKET_URL = /\[https?:\/\/[^\]\s]+\]/g;
const BARE_URL = /https?:\/\/[^\s<>"')]+/g;

function shorten(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "") + " link";
  } catch {
    return "link";
  }
}

export function readableText(raw: string): string {
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(BRACKET_URL, "")) // `[https://image...png]` placeholders
    .map((l) => l.replace(ANGLE_URL, "")) // `text<https://...>` -> `text`
    .map((l) => l.replace(BARE_URL, (u) => (u.length > 60 ? shorten(u) : u)))
    .map((l) => l.replace(BRACKET_LABEL, "$1").replace(/[ \t]+$/g, ""));
  const out: string[] = [];
  let prev = "";
  let blanks = 0;
  for (const l of lines) {
    if (!l.trim()) {
      blanks++;
      if (blanks > 1) continue;
      out.push("");
      continue;
    }
    blanks = 0;
    if (l.trim() === prev) continue; // repeated button/link text
    prev = l.trim();
    out.push(l);
  }
  return out.join("\n").trim();
}
