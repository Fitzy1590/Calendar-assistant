/** Turns the assistant's tool definitions (JSON Schema, as Claude takes them) into what Gemini's function calling accepts. Pure. */

type Json = Record<string, unknown>;
const KEEP = new Set(["type", "description", "enum", "items", "properties", "required", "format", "nullable"]);

export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Json = {};
  for (const [k, v] of Object.entries(schema as Json)) {
    if (k === "properties" && v && typeof v === "object") {
      out.properties = Object.fromEntries(Object.entries(v as Json).map(([name, s]) => [name, toGeminiSchema(s)]));
    } else if (k === "type" && typeof v === "string") out.type = v.toUpperCase();
    else if (k === "items") out.items = toGeminiSchema(v);
    else if (KEEP.has(k)) out[k] = v;
  }
  return out;
}

export interface ToolDef {
  name: string;
  description?: string;
  input_schema: unknown;
}

export const toFunctionDeclarations = (tools: ToolDef[]) =>
  tools.map((t) => {
    const params = toGeminiSchema(t.input_schema) as Json;
    const hasProps = params.properties && Object.keys(params.properties as Json).length > 0;
    return { name: t.name, description: t.description ?? "", ...(hasProps ? { parameters: params } : {}) };
  });

/** The parts of a Gemini reply: text, and the tool calls it wants made. */
export function readParts(content: { parts?: { text?: string; functionCall?: { name: string; args?: unknown } }[] } | undefined) {
  const parts = content?.parts ?? [];
  return {
    text: parts
      .map((p) => p.text ?? "")
      .join("")
      .trim(),
    calls: parts.flatMap((p) => (p.functionCall ? [{ name: p.functionCall.name, args: p.functionCall.args ?? {} }] : [])),
  };
}
