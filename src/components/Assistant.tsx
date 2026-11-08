import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { useStore } from "../store";
import { EXAMPLES, resetClaude, runAssistant, type ChatTurn } from "../lib/assistant";
import { speak } from "../lib/voice";
import { dictate, stopDictation, unsupportedMessage, useVoice, voiceReady } from "../lib/wake";
import { IChat, IMic, ISend, IX } from "./Icons";

const useChat = create<{ turns: ChatTurn[]; busy: boolean; push: (t: ChatTurn) => void; setBusy: (b: boolean) => void; clear: () => void }>(
  (set) => ({
    turns: [],
    busy: false,
    push: (t) => set((s) => ({ turns: [...s.turns, t].slice(-60) })),
    setBusy: (busy) => set({ busy }),
    clear: () => set({ turns: [] }),
  }),
);

export async function ask(text: string) {
  const chat = useChat.getState();
  if (!text.trim()) return;
  chat.push({ role: "user", text });
  chat.setBusy(true);
  try {
    const r = await runAssistant(text);
    chat.push({ role: "assistant", text: r.text, items: r.items });
    const a = useStore.getState().settings.assistant;
    if (a.speakReplies) speak(r.text, a.voiceLang);
  } catch (e) {
    chat.push({ role: "assistant", text: `Something went wrong: ${(e as Error).message}` });
  } finally {
    chat.setBusy(false);
  }
}

/** Mic button state shared with the wake word: one dictation engine for the whole app. */
function useMic(onFinal: (t: string) => void) {
  const { status, interim } = useVoice();
  const on = status === "dictating";
  const toggle = () => {
    if (on) return stopDictation();
    if (!voiceReady()) {
      useChat.getState().push({ role: "assistant", text: unsupportedMessage() });
      useStore.getState().setUi({ assistantOpen: true });
      return;
    }
    dictate(
      () => {},
      (t) => t && onFinal(t),
    );
  };
  return { on, interim, toggle };
}

/** Wake word heard: open the assistant and take the command (or run it if it was said in one breath). */
export function handleWake(rest?: string) {
  useStore.getState().setUi({ assistantOpen: true });
  if (rest) return void ask(rest);
  dictate(
    () => {},
    (t) => t && ask(t),
  );
}

/** Always-visible command bar in the top bar: type or speak, results open in the drawer. */
export function CommandBar() {
  const [text, setText] = useState("");
  const setUi = useStore((s) => s.setUi);
  const run = (t: string) => {
    setText("");
    setUi({ assistantOpen: true });
    ask(t);
  };
  const mic = useMic(run);
  useEffect(() => {
    // Ctrl/Cmd+K focuses the bar from anywhere
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("command-input")?.focus();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  return (
    <form className="command" onSubmit={(e) => (e.preventDefault(), run(text))}>
      <input
        id="command-input"
        value={mic.on ? mic.interim || "Listening…" : text}
        onChange={(e) => setText(e.target.value)}
        placeholder='Say "Hey Planner" or type — "Dentist Tuesday 3pm", "Call Luke"  (Ctrl+K)'
        aria-label="Assistant command"
      />
      <button
        type="button"
        className={"btn ghost icon" + (mic.on ? " mic-on" : "")}
        onClick={mic.toggle}
        aria-label="Voice input"
        title="Voice input"
      >
        <IMic />
      </button>
      <button type="submit" className="btn ghost icon" aria-label="Send">
        <ISend />
      </button>
    </form>
  );
}

export function AssistantDrawer() {
  const { turns, busy, clear } = useChat();
  const s = useStore();
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const mic = useMic((t) => ask(t));
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, busy]);
  return (
    <aside className="drawer" aria-label="Assistant">
      <header>
        <IChat />
        <h3>Assistant</h3>
        <span className="tag">{s.settings.assistant.provider === "claude" && s.settings.assistant.apiKey ? "Claude" : "on-device"}</span>
        <WakeBadge />
        <button className="btn ghost sm" onClick={() => (clear(), resetClaude())}>
          Clear
        </button>
        <button className="btn ghost icon" onClick={() => s.setUi({ assistantOpen: false })} aria-label="Close">
          <IX />
        </button>
      </header>
      <div className="body">
        <div className="chat">
          {!turns.length && (
            <div className="stack">
              <div className="muted">
                Type or speak. I can add and find events, manage tasks, check the weather, call or text through your phone, and change
                settings.
              </div>
              <div className="row">
                {EXAMPLES.map((e) => (
                  <button key={e} className="chip" onClick={() => ask(e)}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className={"bubble " + t.role}>
              {t.text}
              {t.items && (
                <ul>
                  {t.items.map((x, j) => (
                    <li key={j}>{x}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {busy && <div className="bubble assistant faint">Working…</div>}
          <div ref={end} />
        </div>
      </div>
      <form
        className="row"
        style={{ padding: 12, borderTop: "1px solid var(--line)", flexWrap: "nowrap" }}
        onSubmit={(e) => (e.preventDefault(), ask(text), setText(""))}
      >
        <input
          className="input"
          value={mic.on ? mic.interim || "Listening…" : text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message"
          autoFocus
        />
        <button type="button" className={"btn icon" + (mic.on ? " mic-on" : "")} onClick={mic.toggle} aria-label="Voice input">
          <IMic />
        </button>
        <button className="btn primary icon" aria-label="Send">
          <ISend />
        </button>
      </form>
    </aside>
  );
}

/** Small status chip: is the app listening for "Hey Planner"? */
export function WakeBadge() {
  const { status, error } = useVoice();
  const wake = useStore((s) => s.settings.voice.wakeWord);
  if (!wake && status !== "dictating") return null;
  const label =
    status === "waiting"
      ? "Listening for wake word"
      : status === "dictating"
        ? "Listening…"
        : status === "loading"
          ? "Loading voice…"
          : status === "error"
            ? "Voice off"
            : "";
  if (!label) return null;
  return (
    <span
      className="tag"
      title={error || label}
      style={{ color: status === "error" ? "var(--bad)" : status === "dictating" ? "var(--accent)" : undefined }}
    >
      {label}
    </span>
  );
}
