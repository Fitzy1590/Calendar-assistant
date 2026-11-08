#!/usr/bin/env node
// Write latest.json for the Tauri updater from the signed Windows installer in a release folder.
// Usage: node scripts/latest-json.mjs <dir> <tag>
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dir, tag] = process.argv.slice(2);
const repo = process.env.GITHUB_REPOSITORY || "Fitzy1590/Calendar-assistant";
const files = readdirSync(dir);
const exe = files.find((f) => /-setup\.exe$/i.test(f));
const sig = exe && files.find((f) => f === `${exe}.sig`);
if (!exe || !sig) {
  console.log("No signed installer (updater key not set up): skipping latest.json.");
  process.exit(0);
}
const notesFile = process.env.NOTES_FILE;
const latest = {
  version: tag.replace(/^v/, ""),
  notes: notesFile ? readFileSync(notesFile, "utf8").slice(0, 2000) : `Calendar Assistant ${tag}`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: readFileSync(join(dir, sig), "utf8").trim(),
      url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(exe)}`,
    },
  },
};
writeFileSync(join(dir, "latest.json"), JSON.stringify(latest, null, 2));
console.log("latest.json written for", exe);
