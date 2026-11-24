import { describe, expect, it } from "vitest";
import { readableText } from "./readable";

describe("readableText", () => {
  it("drops angle-bracket tracking links but keeps the words", () => {
    expect(readableText("Shop now<https://click.mrl.metamail.com/?qs=abc>")).toBe("Shop now");
    expect(readableText("[15% off select Meta Glasses] <https://click.x.com/?qs=1>")).toBe("15% off select Meta Glasses");
  });
  it("removes image placeholders and collapses blank lines and repeats", () => {
    const t = "Hi\n\n\n\n[https://image.x.com/a.png]\nHi\nBye";
    expect(readableText(t)).toBe("Hi\n\nBye");
  });
  it("shortens long bare urls only", () => {
    expect(readableText("see https://a.com/x")).toBe("see https://a.com/x");
    expect(readableText("see https://www.a.com/" + "x".repeat(80))).toBe("see a.com link");
  });
});
