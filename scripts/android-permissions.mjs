#!/usr/bin/env node
// Add the permissions the app needs to the generated Android manifest (run after `tauri android init`).
import { readFileSync, writeFileSync } from "node:fs";

const path = "src-tauri/gen/android/app/src/main/AndroidManifest.xml";
let xml = readFileSync(path, "utf8");
const perms = [
  "android.permission.RECORD_AUDIO", // "Hey Planner" and dictation
  "android.permission.ACCESS_COARSE_LOCATION", // "near me" shopping searches and weather
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.POST_NOTIFICATIONS", // reminders
];
for (const p of perms) {
  if (!xml.includes(`"${p}"`)) xml = xml.replace(/<application/, `<uses-permission android:name="${p}" />\n    <application`);
}
writeFileSync(path, xml);
console.log("Android permissions:", perms.join(", "));
