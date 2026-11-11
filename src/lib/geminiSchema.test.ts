import { describe, expect, it } from "vitest";
import { readParts, toFunctionDeclarations, toGeminiSchema } from "./geminiSchema";

describe("Gemini tool format", () => {
  it("upper-cases types and keeps only what Gemini accepts, including nested items", () => {
    const s = toGeminiSchema({
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string", description: "Name", default: "x" },
        tags: { type: "array", items: { type: "string" } },
        level: { type: "string", enum: ["a", "b"] },
      },
      required: ["title"],
    }) as any;
    expect(s.type).toBe("OBJECT");
    expect(s.additionalProperties).toBeUndefined();
    expect(s.properties.title).toEqual({ type: "STRING", description: "Name" });
    expect(s.properties.tags).toEqual({ type: "ARRAY", items: { type: "STRING" } });
    expect(s.properties.level.enum).toEqual(["a", "b"]);
    expect(s.required).toEqual(["title"]);
  });
  it("leaves out parameters for a tool that takes none", () => {
    const d = toFunctionDeclarations([
      { name: "list_all", description: "List", input_schema: { type: "object", properties: {}, required: [] } },
      { name: "add", description: "Add", input_schema: { type: "object", properties: { t: { type: "string" } }, required: ["t"] } },
    ]);
    expect(d[0]).toEqual({ name: "list_all", description: "List" });
    expect((d[1] as any).parameters.properties.t.type).toBe("STRING");
  });
  it("reads text and tool calls from a reply", () => {
    expect(readParts({ parts: [{ text: "Hi " }, { text: "there" }] })).toEqual({ text: "Hi there", calls: [] });
    expect(readParts({ parts: [{ functionCall: { name: "add_task", args: { title: "x" } } }] }).calls).toEqual([
      { name: "add_task", args: { title: "x" } },
    ]);
    expect(readParts(undefined)).toEqual({ text: "", calls: [] });
  });
});
