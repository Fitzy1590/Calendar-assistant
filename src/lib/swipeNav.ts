import { useEffect } from "react";
import { useStore } from "../store";

/** Left swipe goes to the next main tab, right swipe to the previous one. Null = not a tab swipe. */
export function swipeTarget<T>(order: T[], current: T, dx: number, dy: number, ms: number): T | null {
  const i = order.indexOf(current);
  if (i < 0 || Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.8 || ms > 700) return null;
  return order[i + (dx < 0 ? 1 : -1)] ?? null; // no wrap-around at either end
}

/** Anything that has its own sideways gesture or text selection keeps it. */
const OWN_GESTURE =
  'input,textarea,select,[contenteditable="true"],[role="dialog"],.modal-back,.drawer,iframe,.task-swipe,.board-card,.timegrid,.week-board,.mail-folders,[data-noswipe]';
export function swipeBlocked(el: Element | null): boolean {
  if (!el || !el.closest(".content") || el.closest(OWN_GESTURE)) return true;
  for (let e: Element | null = el; e && !e.classList.contains("content"); e = e.parentElement) {
    const o = getComputedStyle(e).overflowX;
    if ((o === "auto" || o === "scroll") && e.scrollWidth > e.clientWidth + 2) return true; // a scrolling strip
  }
  return !!window.getSelection()?.toString();
}

/** Touch screens only: swipe the page content sideways to move between the visible menu items, in menu order. */
export function useSwipeNav() {
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return () => {};
    let start: { x: number; y: number; t: number } | null = null;
    const down = (e: TouchEvent) => {
      const t = e.touches[0];
      start = e.touches.length === 1 && !swipeBlocked(e.target as Element) ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
    };
    const up = (e: TouchEvent) => {
      const s = start;
      start = null;
      const t = e.changedTouches[0];
      if (!s || !t || window.innerWidth >= 1100) return;
      const st = useStore.getState();
      if (!st.settings.onboarded || st.wizardSteps) return;
      const order = st.settings.sidebar.filter((x) => x.visible).map((x) => x.id);
      const dx = t.clientX - s.x;
      const to = swipeTarget(order, st.page, dx, t.clientY - s.y, Date.now() - s.t);
      if (!to) return;
      const root = document.documentElement;
      root.dataset.swipe = dx < 0 ? "next" : "prev";
      st.setPage(to);
      setTimeout(() => delete root.dataset.swipe, 250);
    };
    const cancel = () => (start = null);
    document.addEventListener("touchstart", down, { passive: true });
    document.addEventListener("touchend", up, { passive: true });
    document.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", down);
      document.removeEventListener("touchend", up);
      document.removeEventListener("touchcancel", cancel);
    };
  }, []);
}
