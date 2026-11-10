/** Move the item with `id` to where `targetId` is (the way dragging a row onto another works). Returns a new list. */
export function moveTo<T extends { id: string }>(list: T[], id: string, targetId: string): T[] {
  const from = list.findIndex((x) => x.id === id);
  const to = list.findIndex((x) => x.id === targetId);
  if (from < 0 || to < 0 || from === to) return list;
  const out = list.slice();
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

/** Move `id` one step up or down among the items that are shown (hidden ones keep their place). */
export function nudge<T extends { id: string }>(list: T[], id: string, dir: -1 | 1, shown: (x: T) => boolean): T[] {
  const visible = list.filter(shown);
  const i = visible.findIndex((x) => x.id === id);
  const neighbour = visible[i + dir];
  return i < 0 || !neighbour ? list : moveTo(list, id, neighbour.id);
}
