/** What the Android Back button should do, most specific first. `null` means nothing is open: let Android leave the app. */
export type BackAction = "close-dialog" | "close-assistant" | "close-day" | "close-reader" | "go-home";

export interface BackState {
  dialogOpen: boolean;
  assistantOpen: boolean;
  dayOpen: boolean;
  readerOpen: boolean;
  page: string;
}

export function backAction(s: BackState): BackAction | null {
  if (s.dialogOpen) return "close-dialog";
  if (s.assistantOpen) return "close-assistant";
  if (s.dayOpen) return "close-day";
  if (s.readerOpen) return "close-reader";
  if (s.page !== "home") return "go-home";
  return null;
}
