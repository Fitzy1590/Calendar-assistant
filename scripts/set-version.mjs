#!/usr/bin/env node
// Set the app version everywhere it is declared: `node scripts/set-version.mjs 1.2.3`
import { readFileSync, writeFileSync } from "node:fs";

const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v ?? "")) {
  console.error(`Expected a version like 1.2.3, got "${v}"`);
  process.exit(1);
}
const json = (p, fn) => {
  const o = JSON.parse(readFileSync(p, "utf8"));
  fn(o);
  writeFileSync(p, JSON.stringify(o, null, 2) + "\n");
};
json("package.json", (o) => (o.version = v));
json("src-tauri/tauri.conf.json", (o) => (o.version = v));
const cargo = readFileSync("src-tauri/Cargo.toml", "utf8").replace(/^version = ".*"$/m, `version = "${v}"`);
writeFileSync("src-tauri/Cargo.toml", cargo);
console.log(`Version set to ${v}`);
