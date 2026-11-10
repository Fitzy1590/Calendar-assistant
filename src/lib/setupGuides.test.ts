import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUIDE_HOSTS, googleSteps, guideDoc, microsoftSteps, type GuideStep } from "./setupGuides";

const all: [string, GuideStep[]][] = [
  ["Google, PC", googleSteps("windows")],
  ["Google, phone", googleSteps("android")],
  ["Microsoft", microsoftSteps()],
];

/** All source text of the app's screens, to check the buttons a guide mentions really exist. */
function source(dir: string): string {
  return readdirSync(dir)
    .map((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? source(p) : /\.tsx$/.test(f) ? readFileSync(p, "utf8") : "";
    })
    .join("\n");
}
const screens = source(new URL("../", import.meta.url).pathname);

describe("setup guides", () => {
  for (const [name, steps] of all) {
    it(`${name}: every step has a title and plain instructions`, () => {
      expect(steps.length).toBeGreaterThanOrEqual(4);
      for (const s of steps) {
        expect(s.title.length).toBeGreaterThan(3);
        expect(s.body.length).toBeGreaterThan(30);
      }
    });
    it(`${name}: every link is https on a known site`, () => {
      for (const l of steps.flatMap((s) => s.links ?? [])) {
        const u = new URL(l.url);
        expect(u.protocol).toBe("https:");
        expect(GUIDE_HOSTS).toContain(u.hostname);
        expect(l.label.length).toBeGreaterThan(3);
      }
    });
    it(`${name}: every button or field it mentions exists on a real screen`, () => {
      for (const label of steps.flatMap((s) => s.ui ?? [])) expect(screens, `“${label}” not found in any screen`).toContain(label);
    });
  }
  it("both Google guides start with the same project steps, then differ by device", () => {
    const [w, a] = [googleSteps("windows"), googleSteps("android")];
    expect(w.slice(0, 3)).toEqual(a.slice(0, 3));
    expect(JSON.stringify(w)).toContain("Desktop app");
    expect(JSON.stringify(a)).toContain("TVs and Limited Input devices");
    expect(JSON.stringify(w)).not.toContain("TVs and Limited Input devices");
  });
  it("turns on the Drive API, which sync needs", () => {
    expect(googleSteps("windows").some((s) => s.links?.some((l) => l.url.includes("drive.googleapis.com")))).toBe(true);
  });
  it("links to the written guides on GitHub", () => {
    expect(guideDoc("google")).toMatch(/github\.com\/.+\/docs\/DRIVE_SYNC\.md$/);
    expect(guideDoc("microsoft")).toMatch(/docs\/EMAIL_SETUP\.md$/);
  });
});
