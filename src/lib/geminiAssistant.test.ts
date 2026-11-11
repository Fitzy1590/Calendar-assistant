import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";
import { resetGemini, runGemini } from "./assistant";

const reply = (parts: unknown[]) => ({ status: 200, text: JSON.stringify({ candidates: [{ content: { role: "model", parts } }] }) });

beforeEach(() => {
  resetGemini();
  useStore.getState().updateSettings((s) => {
    s.assistant.provider = "gemini";
    s.assistant.geminiKey = "g-key";
    s.assistant.geminiModel = "gemini-2.5-flash";
  });
  useStore.setState({ tasks: {} });
});

describe("Gemini assistant", () => {
  it("calls a tool, hands the result back and returns Gemini's final words", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(reply([{ functionCall: { name: "add_task", args: { title: "Buy milk" } } }]))
      .mockResolvedValueOnce(reply([{ text: "Added Buy milk to your tasks." }]));
    const r = await runGemini("add a task buy milk", post);
    expect(r.text).toBe("Added Buy milk to your tasks.");
    expect(Object.values(useStore.getState().tasks).some((t) => t.title.toLowerCase().includes("buy milk"))).toBe(true);
    const [url, init] = post.mock.calls[0];
    expect(url).toContain("/models/gemini-2.5-flash:generateContent");
    expect(url).not.toContain("g-key");
    expect(init.headers["x-goog-api-key"]).toBe("g-key");
    const second = JSON.parse(post.mock.calls[1][1].body);
    const last = second.contents[second.contents.length - 1];
    expect(last.role).toBe("user");
    expect(last.parts[0].functionResponse.name).toBe("add_task");
  });
  it("sends the tools to Gemini in its own format", async () => {
    const post = vi.fn().mockResolvedValue(reply([{ text: "Hello" }]));
    await runGemini("hi", post);
    const body = JSON.parse(post.mock.calls[0][1].body);
    const add = body.tools[0].functionDeclarations.find((d: { name: string }) => d.name === "add_task");
    expect(add.parameters.type).toBe("OBJECT");
  });
  it("explains a refused key or unknown model, and needs a key", async () => {
    await expect(runGemini("hi", vi.fn().mockResolvedValue({ status: 403, text: "{}" }))).rejects.toThrow(/refused/);
    await expect(runGemini("hi", vi.fn().mockResolvedValue({ status: 404, text: "{}" }))).rejects.toThrow(/model/);
    useStore.getState().updateSettings((s) => void (s.assistant.geminiKey = ""));
    await expect(runGemini("hi", vi.fn())).rejects.toThrow(/Add your Gemini key/);
  });
});
