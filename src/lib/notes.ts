import type { Note, NoteColor } from "../types";
import { live, useStore } from "../store";

export const NOTE_COLORS: { id: NoteColor; label: string }[] = [
  { id: "yellow", label: "Yellow" },
  { id: "mint", label: "Mint" },
  { id: "sky", label: "Sky" },
  { id: "rose", label: "Rose" },
  { id: "lilac", label: "Lilac" },
  { id: "sand", label: "Sand" },
];

export const tagsOf = (n: Pick<Note, "title" | "body">) => [
  ...new Set(((n.title + " " + n.body).match(/(^|\s)#([\p{L}\p{N}_-]{2,30})/gu) ?? []).map((t) => t.trim().slice(1).toLowerCase())),
];

export function addNote(p: Partial<Note> & { body: string }): Note {
  const all = live(useStore.getState().notes);
  const order = all.length ? Math.min(...all.map((n) => n.order)) - 1 : 0; // new notes go first
  return useStore
    .getState()
    .upsert("notes", { title: "", color: "yellow", order, ...p, tags: tagsOf({ title: p.title ?? "", body: p.body }) });
}

export function searchNotes(q: string): Note[] {
  const s = q.toLowerCase();
  return live(useStore.getState().notes).filter((n) => !n.archived && (n.title + " " + n.body).toLowerCase().includes(s));
}

/** Toggle the checkbox on line `i` ("[ ] milk" <-> "[x] milk"). */
export function toggleLine(body: string, i: number) {
  const lines = body.split("\n");
  lines[i] = lines[i].replace(/^(\s*(?:[-*]\s*)?)\[( |x|X)\]/, (_m, pre, c) => `${pre}[${c === " " ? "x" : " "}]`);
  return lines.join("\n");
}
