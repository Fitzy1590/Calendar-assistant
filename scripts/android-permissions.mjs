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
  "android.permission.USE_EXACT_ALARM", // reminders at the exact minute with the app closed (Android 13+, calendar apps)
  "android.permission.SCHEDULE_EXACT_ALARM", // same on Android 12 to 14 (the user may need to allow "Alarms & reminders")
];
for (const p of perms) {
  if (!xml.includes(`"${p}"`)) xml = xml.replace(/<application/, `<uses-permission android:name="${p}" />\n    <application`);
}

// Fold / unfold only resizes the window: keep the activity alive (no restart, no lost screen) and let it be resized
const handled = "orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|screenLayout|density|uiMode|navigation|layoutDirection|fontScale";
xml = xml.replace(/<activity\b[^>]*>/, (tag) => {
  const have = /android:configChanges="([^"]*)"/.exec(tag)?.[1]?.split("|") ?? [];
  const all = [...new Set([...have, ...handled.split("|")])].join("|");
  tag = /android:configChanges="[^"]*"/.test(tag) ? tag.replace(/android:configChanges="[^"]*"/, `android:configChanges="${all}"`) : tag.replace("<activity", `<activity android:configChanges="${all}"`);
  if (!/android:resizeableActivity=/.test(tag)) tag = tag.replace("<activity", '<activity android:resizeableActivity="true"');
  if (!/android:windowSoftInputMode=/.test(tag)) tag = tag.replace("<activity", '<activity android:windowSoftInputMode="adjustResize"');
  return tag;
});
writeFileSync(path, xml);
console.log("Android permissions:", perms.join(", "));
