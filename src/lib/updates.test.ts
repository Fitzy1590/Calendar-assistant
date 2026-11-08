import { describe, expect, it } from "vitest";
import { newer } from "./updates";

describe("version compare", () => {
  it("compares x.y.z numerically", () => {
    expect(newer("0.2.0", "0.1.9")).toBe(true);
    expect(newer("v0.10.0", "0.9.0")).toBe(true);
    expect(newer("0.1.0", "0.1.0")).toBe(false);
    expect(newer("0.1.0", "0.2.0")).toBe(false);
  });
});
