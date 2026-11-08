import { create } from "zustand";
import { useStore } from "../store";
import { isAndroid, isTauri } from "./platform";

/**
 * "Hey Planner" wake word + dictation.
 *
 * Engine "picovoice" (recommended, works in the installed apps): runs fully on-device in WebAssembly.
 *   - Porcupine listens for the wake word (a custom "Hey Planner" model from Picovoice Console,
 *     or a built-in word such as "Computer" or "Jarvis" until you add one).
 *   - Cheetah turns speech into text for commands, chat and note dictation.
 *   Needs a free AccessKey from console.picovoice.ai. Models download once and are cached.
 * Engine "browser": the browser's own speech service (Chrome/Edge in a browser; needs internet).
 *   It listens continuously for the phrase "hey planner" in the transcript.
 *
 * Only one engine holds the microphone at a time: the wake word pauses while you dictate.
 */

export type VoiceStatus = "off" | "loading" | "waiting" | "dictating" | "error";

export const useVoice = create<{ status: VoiceStatus; interim: string; error: string }>(() => ({
  status: "off",
  interim: "",
  error: "",
}));
const set = (p: Partial<{ status: VoiceStatus; interim: string; error: string }>) => useVoice.setState(p);

const MODELS = {
  porcupine: "https://raw.githubusercontent.com/Picovoice/porcupine/v4.0/lib/common/porcupine_params.pv",
  cheetah: "https://raw.githubusercontent.com/Picovoice/cheetah/v4.2/lib/common/cheetah_params.pv",
};
export const BUILT_IN_WORDS = ["Computer", "Jarvis", "Picovoice", "Bumblebee", "Porcupine", "Terminator"];
const WAKE_PHRASE = /\bhey,? planner\b[,.!]?\s*/i;

let onWake: ((rest?: string) => void) | null = null;
export const setWakeHandler = (fn: (rest?: string) => void) => void (onWake = fn);

/* ---------------- chime ---------------- */
function chime(up = true) {
  if (!useStore.getState().settings.voice.chime) return;
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(up ? 660 : 880, ctx.currentTime);
    o.frequency.linearRampToValueAtTime(up ? 880 : 520, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.22);
    o.onended = () => ctx.close();
  } catch {
    /* no audio output */
  }
}

/* ---------------- Picovoice engines ---------------- */
let porcupine: import("@picovoice/porcupine-web").PorcupineWorker | null = null;
let cheetah: import("@picovoice/cheetah-web").CheetahWorker | null = null;
let cheetahSink: ((t: { transcript: string; isEndpoint?: boolean; isFlushed?: boolean }) => void) | null = null;

async function wvp() {
  return (await import("@picovoice/web-voice-processor")).WebVoiceProcessor;
}

async function ensurePorcupine() {
  if (porcupine) return porcupine;
  const v = useStore.getState().settings.voice;
  const { PorcupineWorker, BuiltInKeyword } = await import("@picovoice/porcupine-web");
  const keyword =
    v.keyword === "custom" && v.customKeyword
      ? { label: v.customKeyword.label, base64: v.customKeyword.base64, sensitivity: v.sensitivity }
      : {
          builtin: (BuiltInKeyword as Record<string, string>)[v.keyword === "custom" ? "Computer" : v.keyword] as never,
          sensitivity: v.sensitivity,
        };
  porcupine = await PorcupineWorker.create(v.picovoiceKey, keyword, () => wakeDetected(), {
    publicPath: MODELS.porcupine,
    customWritePath: "porcupine_v4",
    version: 1,
  });
  return porcupine;
}

async function ensureCheetah() {
  if (cheetah) return cheetah;
  const v = useStore.getState().settings.voice;
  const { CheetahWorker } = await import("@picovoice/cheetah-web");
  cheetah = await CheetahWorker.create(
    v.picovoiceKey,
    (t) => cheetahSink?.(t),
    { publicPath: MODELS.cheetah, customWritePath: "cheetah_v4_2", version: 1 },
    { enableAutomaticPunctuation: true, endpointDurationSec: 1.2 },
  );
  return cheetah;
}

/* ---------------- browser engine ---------------- */
type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: any) => void;
  onend: () => void;
  onerror: (e: any) => void;
  start: () => void;
  stop: () => void;
};
const RecCtor = () => (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
export const browserSpeechAvailable = () => !!RecCtor() && !isTauri();
let wakeRec: Rec | null = null;

/* ---------------- public API ---------------- */
const usePicovoice = () => {
  const v = useStore.getState().settings.voice;
  return v.engine === "picovoice" && !!v.picovoiceKey;
};
export const voiceReady = () => usePicovoice() || browserSpeechAvailable();

function wakeDetected(rest?: string) {
  chime(true);
  onWake?.(rest);
}

/** Start or stop listening for the wake word to match the current settings. */
export async function syncWakeWord() {
  const v = useStore.getState().settings.voice;
  await stopWake();
  if (!v.wakeWord || useVoice.getState().status === "dictating") return;
  try {
    if (usePicovoice()) {
      set({ status: "loading", error: "" });
      const p = await ensurePorcupine();
      await (await wvp()).subscribe(p);
      set({ status: "waiting" });
    } else if (browserSpeechAvailable()) {
      startBrowserWake();
    } else {
      set({ status: "error", error: "Wake word needs a Picovoice AccessKey in Settings → Assistant & voice." });
    }
  } catch (e) {
    set({ status: "error", error: friendly(e) });
  }
}

function startBrowserWake() {
  const rec: Rec = new (RecCtor())();
  rec.lang = useStore.getState().settings.assistant.voiceLang;
  rec.continuous = true;
  rec.interimResults = false;
  rec.onresult = (e) => {
    const text: string = e.results[e.results.length - 1][0].transcript;
    if (WAKE_PHRASE.test(text)) {
      const rest = text.split(WAKE_PHRASE)[1]?.trim();
      rec.stop();
      wakeDetected(rest || undefined);
    }
  };
  rec.onerror = (e) => e.error === "not-allowed" && set({ status: "error", error: "Microphone access was blocked." });
  rec.onend = () => {
    // the browser stops continuous recognition every minute or so; restart while still enabled
    if (wakeRec === rec && useVoice.getState().status === "waiting") setTimeout(() => wakeRec === rec && rec.start(), 300);
  };
  wakeRec = rec;
  rec.start();
  set({ status: "waiting", error: "" });
}

async function stopWake() {
  if (porcupine) await (await wvp()).unsubscribe(porcupine).catch(() => {});
  if (wakeRec) {
    const r = wakeRec;
    wakeRec = null;
    r.stop();
  }
  if (useVoice.getState().status !== "dictating") set({ status: "off" });
}

let stopCurrent: (() => void) | null = null;

/**
 * Dictate one utterance. Calls onText with the running transcript and onFinal once with the result
 * (empty string if nothing was heard). Resumes the wake word afterwards.
 */
export async function dictate(onText: (t: string) => void, onFinal: (t: string) => void, opts: { long?: boolean } = {}) {
  if (useVoice.getState().status === "dictating") return stopDictation();
  await stopWake();
  set({ status: "dictating", interim: "", error: "" });
  let text = "";
  const finish = async () => {
    stopCurrent = null;
    set({ status: "off", interim: "" });
    chime(false);
    onFinal(text.trim());
    syncWakeWord();
  };
  try {
    if (usePicovoice()) {
      const c = await ensureCheetah();
      const proc = await wvp();
      let silenceTimer: ReturnType<typeof setTimeout>;
      const stop = async () => {
        clearTimeout(silenceTimer);
        cheetahSink = null;
        await proc.unsubscribe(c).catch(() => {});
        await finish();
      };
      cheetahSink = (t) => {
        if (t.transcript) {
          text += t.transcript;
          onText(text);
          set({ interim: text });
        }
        // a pause ends a command; for long dictation (notes) keep going until stopped
        if (t.isEndpoint && !opts.long) c.flush();
        if (t.isFlushed && !opts.long) stop();
      };
      stopCurrent = () => {
        c.flush();
        setTimeout(stop, 400);
      };
      silenceTimer = setTimeout(() => !text && stop(), 8000); // nothing said: give up
      await proc.subscribe(c);
    } else if (RecCtor()) {
      const rec: Rec = new (RecCtor())();
      rec.lang = useStore.getState().settings.assistant.voiceLang;
      rec.interimResults = true;
      rec.continuous = !!opts.long;
      let committed = "";
      rec.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) committed += r[0].transcript + " ";
          else interim += r[0].transcript;
        }
        text = (committed + interim).replace(WAKE_PHRASE, "");
        onText(text);
        set({ interim: text });
      };
      rec.onerror = (e) => e.error !== "no-speech" && set({ error: e.error });
      rec.onend = () => finish();
      stopCurrent = () => rec.stop();
      rec.start();
    } else {
      set({ status: "error", error: unsupportedMessage() });
      onFinal("");
      return;
    }
  } catch (e) {
    set({ status: "error", error: friendly(e) });
    stopCurrent = null;
    onFinal("");
  }
}

export function stopDictation() {
  stopCurrent?.();
}

export function unsupportedMessage() {
  return isAndroid()
    ? "Add a free Picovoice AccessKey in Settings → Assistant & voice for voice on Android, or use the keyboard's mic."
    : "Add a free Picovoice AccessKey in Settings → Assistant & voice for on-device voice, or press Win+H to dictate.";
}

function friendly(e: unknown) {
  const m = String((e as Error)?.message ?? e);
  if (/AccessKey|ACTIVATION|KEY_ERROR|INVALID_ARGUMENT/i.test(m))
    return "Picovoice didn't accept the AccessKey. Check it in Settings → Assistant & voice.";
  if (/NotAllowed|Permission|denied/i.test(m)) return "Microphone access was blocked. Allow it for Calendar Assistant and try again.";
  if (/fetch|network|Failed to load/i.test(m)) return "Couldn't download the voice model. Check the internet connection (needed once).";
  return m;
}

/** Called when the Picovoice key or keyword changes: drop engines so they rebuild with the new settings. */
export async function resetEngines() {
  await stopWake();
  const proc = porcupine || cheetah ? await wvp() : null;
  for (const engine of [porcupine, cheetah]) {
    if (!engine) continue;
    await proc!.unsubscribe(engine).catch(() => {});
    await engine.release().catch(() => {});
    engine.terminate();
  }
  porcupine = null;
  cheetah = null;
  await syncWakeWord();
}

/** Wire the wake word to settings changes. Call once at startup. */
export function startVoice() {
  const key = () => {
    const v = useStore.getState().settings.voice;
    return JSON.stringify([v.engine, v.picovoiceKey, v.keyword, v.customKeyword?.base64.length, v.sensitivity]);
  };
  let engineKey = key();
  let wake = useStore.getState().settings.voice.wakeWord;
  useStore.subscribe(() => {
    const v = useStore.getState().settings.voice;
    const k = key();
    if (k !== engineKey) {
      engineKey = k;
      wake = v.wakeWord;
      resetEngines();
    } else if (v.wakeWord !== wake) {
      wake = v.wakeWord;
      syncWakeWord();
    }
  });
  syncWakeWord();
}
