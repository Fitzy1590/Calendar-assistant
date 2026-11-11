import type { MailSettings } from "./types";

/** The right-click menu on an email: which items there are, in what order, and which you hid. Pure. */

export interface MenuItemDef {
  id: string;
  label: string;
}

export const MENU_ITEMS: MenuItemDef[] = [
  { id: "reply", label: "Reply" },
  { id: "replyAll", label: "Reply all" },
  { id: "forward", label: "Forward" },
  { id: "claude", label: "Draft reply with Claude" },
  { id: "gemini", label: "Draft reply with Gemini" },
  { id: "ruleFolder", label: "Create rule + new folder…" },
  { id: "move", label: "Move to folder" },
  { id: "snooze", label: "Snooze…" },
  { id: "toCalendar", label: "Add to calendar…" },
  { id: "toTask", label: "Add as task" },
  { id: "important", label: "Always important from the sender" },
  { id: "mute", label: "Mute the sender" },
  { id: "unsubscribe", label: "Unsubscribe" },
];

const known = new Set(MENU_ITEMS.map((i) => i.id));

/** Your order, with any item added since (or never placed) at the end and anything unknown dropped. */
export function menuOrder(menu: MailSettings["menu"]): string[] {
  const placed = menu.order.filter((id, i) => known.has(id) && menu.order.indexOf(id) === i);
  return [...placed, ...MENU_ITEMS.map((i) => i.id).filter((id) => !placed.includes(id))];
}

export const visibleMenu = (menu: MailSettings["menu"]): MenuItemDef[] =>
  menuOrder(menu)
    .filter((id) => !menu.hidden.includes(id))
    .map((id) => MENU_ITEMS.find((i) => i.id === id)!);

/** Move an item up or down one place (hidden ones count too, so the editor and the menu agree). */
export function nudgeMenu(menu: MailSettings["menu"], id: string, dir: -1 | 1): MailSettings["menu"] {
  const order = menuOrder(menu);
  const i = order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return { ...menu, order };
  [order[i], order[j]] = [order[j], order[i]];
  return { ...menu, order };
}

/** Drag an item onto another: it takes that place. */
export function dropMenu(menu: MailSettings["menu"], id: string, onto: string): MailSettings["menu"] {
  const order = menuOrder(menu);
  const from = order.indexOf(id);
  const to = order.indexOf(onto);
  if (from < 0 || to < 0 || from === to) return { ...menu, order };
  const [item] = order.splice(from, 1);
  order.splice(to, 0, item);
  return { ...menu, order };
}

export const toggleMenuItem = (menu: MailSettings["menu"], id: string): MailSettings["menu"] => ({
  ...menu,
  order: menuOrder(menu),
  hidden: menu.hidden.includes(id) ? menu.hidden.filter((h) => h !== id) : [...menu.hidden, id],
});
