import { describe, expect, it } from "vitest";
import { entriesToShow, WHATS_NEW } from "./whatsNew";

describe("what's new", () => {
  it("shows nothing when the person already saw this version", () => {
    expect(entriesToShow("0.1.3", "0.1.3")).toEqual([]);
  });
  it("treats no saved version as an update from 0.1.2", () => {
    expect(entriesToShow(undefined, "0.1.3").map((e) => e.version)).toEqual(["0.1.3"]);
  });
  it("lists every release since the last one seen, newest first", () => {
    expect(entriesToShow("0.1.0", "0.1.3").map((e) => e.version)).toEqual(["0.1.3", "0.1.2", "0.1.1"]);
  });
  it("never shows a version newer than the one running", () => {
    expect(entriesToShow("0.1.0", "0.1.1").map((e) => e.version)).toEqual(["0.1.1"]);
  });
  it("has an entry with points for every bundled version, newest first", () => {
    expect(WHATS_NEW.every((e) => e.points.length > 0 && e.points.length <= 3)).toBe(true);
    expect(WHATS_NEW.map((e) => e.version)).toEqual([...WHATS_NEW.map((e) => e.version)].sort().reverse());
  });
});
