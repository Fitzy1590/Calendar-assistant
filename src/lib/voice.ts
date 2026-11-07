/** Spoken replies (text-to-speech). Listening lives in wake.ts. */
export function speak(text: string, lang: string) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  speechSynthesis.speak(u);
}
