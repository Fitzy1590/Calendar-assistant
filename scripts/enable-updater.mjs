#!/usr/bin/env node
// Release builds only: turn on signed in-app updates. Needs the updater public key (TAURI_UPDATER_PUBKEY).
// The matching private key must be in TAURI_SIGNING_PRIVATE_KEY when `tauri build` runs.
import { readFileSync, writeFileSync } from "node:fs";

const pubkey = (process.env.TAURI_UPDATER_PUBKEY || "").trim();
const repo = process.env.GITHUB_REPOSITORY || "Fitzy1590/Calendar-assistant";
if (!pubkey || !process.env.TAURI_SIGNING_PRIVATE_KEY) {
  console.log("Updater key not set up (see docs/RELEASING.md): this build won't update itself; it will point to the Releases page instead.");
  process.exit(0);
}
const path = "src-tauri/tauri.conf.json";
const conf = JSON.parse(readFileSync(path, "utf8"));
conf.bundle.createUpdaterArtifacts = true;
conf.plugins = {
  ...(conf.plugins || {}),
  updater: {
    pubkey,
    endpoints: [`https://github.com/${repo}/releases/latest/download/latest.json`],
    windows: { installMode: "passive" },
  },
};
writeFileSync(path, JSON.stringify(conf, null, 2) + "\n");
console.log("Signed in-app updates enabled for this build.");
