import type { PageId } from "../types";

/** Keyboard shortcuts: 1-9 and 0 jump to the left-menu items in the order they are shown; F toggles full screen. Pure parts. */

/** The number shown beside the Nth visible menu item (1-9, then 0), or "" past the tenth. */
export const shortcutLabel = (index: number): string => (index >= 0 && index < 9 ? String(index + 1) : index === 9 ? "0" : "");

/** Which page a number key opens, given the visible menu in order. */
export function pageForKey(key: string, visible: { id: PageId }[]): PageId | undefined {
  if (!/^[0-9]$/.test(key)) return undefined;
  const i = key === "0" ? 9 : Number(key) - 1;
  return visible[i]?.id;
}

/** True when keys should type text rather than act as shortcuts. */
export function isTyping(
  el: { tagName?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null } | null,
): boolean {
  if (!el) return false;
  const tag = (el.tagName ?? "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute?.("role");
  return role === "textbox" || role === "combobox" || role === "searchbox";
}
