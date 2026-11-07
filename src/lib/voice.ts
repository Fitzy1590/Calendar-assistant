/**
 * Voice input/output using the Web Speech API.
 * Availability depends on the web engine: Chromium-based browsers and Edge WebView2 builds that ship
 * speech recognition work; where it is missing the mic button explains that Windows dictation (Win+H)
 * or the Android keyboard's mic can be used in the chat box instead.
 */
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

export const canListen = () => !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

export function listen(lang: string, onText: (text: string, final: boolean) => void, onEnd: (err?: string) => void) {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) {
    onEnd("unsupported");
    return () => {};
  }
  const rec: Rec = new Ctor();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e) => {
    const r = e.results[e.results.length - 1];
    onText(r[0].transcript, r.isFinal);
  };
  rec.onerror = (e) => onEnd(e.error);
  rec.onend = () => onEnd();
  rec.start();
  return () => rec.stop();
}

export function speak(text: string, lang: string) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  speechSynthesis.speak(u);
}
