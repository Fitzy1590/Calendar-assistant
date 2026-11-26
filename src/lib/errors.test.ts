import { describe, expect, it } from "vitest";
import { isHarmlessBrowserNotice } from "./errors";

describe("isHarmlessBrowserNotice", () => {
  it("recognises the ResizeObserver notices browsers print", () => {
    expect(isHarmlessBrowserNotice("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(isHarmlessBrowserNotice("ResizeObserver loop limit exceeded")).toBe(true);
  });
  it("does not hide real errors", () => {
    expect(isHarmlessBrowserNotice("Cannot read properties of undefined")).toBe(false);
    expect(isHarmlessBrowserNotice("")).toBe(false);
  });
});
