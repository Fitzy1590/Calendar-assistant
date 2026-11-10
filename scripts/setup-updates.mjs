#!/usr/bin/env node
// One-time setup for signed in-app updates (Windows). Run on your own PC:  node scripts/setup-updates.mjs
// Makes the signing key, saves it in a folder OUTSIDE the repo, and either sets the three GitHub values for you
// (if the GitHub CLI `gh` is installed and signed in) or tells you exactly what to paste where.
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const REPO = process.env.GITHUB_REPOSITORY || "Fitzy1590/Calendar-assistant";
const dir = join(homedir(), "calendar-assistant-keys");
mkdirSync(dir, { recursive: true });
const key = join(dir, "updater.key");
const pub = key + ".pub";
const pwFile = join(dir, "updater-password.txt");

if (existsSync(key)) {
  console.log(`A key already exists in ${dir}. Keeping it (replacing it would break updates for installed apps).`);
} else {
  const password = randomBytes(18).toString("base64url");
  const r = spawnSync("npx", ["--yes", "@tauri-apps/cli@2", "signer", "generate", "--ci", "-w", key, "-p", password], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0 || !existsSync(key)) {
    console.error("Couldn't create the key. Is Node.js installed (nodejs.org, LTS)?");
    process.exit(1);
  }
  writeFileSync(pwFile, password);
  console.log(`Key saved in ${dir}. Keep this folder safe and never put it in the repository.`);
}

const secrets = {
  TAURI_SIGNING_PRIVATE_KEY: readFileSync(key, "utf8"),
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: readFileSync(pwFile, "utf8"),
};
const variable = { TAURI_UPDATER_PUBKEY: readFileSync(pub, "utf8") };

const hasGh = spawnSync("gh", ["auth", "status"], { stdio: "ignore", shell: process.platform === "win32" }).status === 0;
if (hasGh) {
  for (const [k, v] of Object.entries(secrets)) execFileSync("gh", ["secret", "set", k, "-R", REPO, "--body", v], { shell: process.platform === "win32" });
  for (const [k, v] of Object.entries(variable)) execFileSync("gh", ["variable", "set", k, "-R", REPO, "--body", v], { shell: process.platform === "win32" });
  console.log("\nDone: the three GitHub values are set. The next release will have signed updates.");
} else {
  console.log(`
GitHub CLI not found, so add the values by hand (about 3 minutes):
  1. Open https://github.com/${REPO}/settings/secrets/actions
  2. New repository secret -> name TAURI_SIGNING_PRIVATE_KEY      -> paste the whole contents of ${key}
  3. New repository secret -> name TAURI_SIGNING_PRIVATE_KEY_PASSWORD -> paste the contents of ${pwFile}
  4. Open the "Variables" tab on the same page -> New repository variable
     name TAURI_UPDATER_PUBKEY -> paste the whole contents of ${pub}
Then publish a release. Releases after that update installed apps by themselves.`);
}
