import { useEffect, useState } from "react";

/**
 * Android window size classes by width in CSS pixels. Folding or unfolding a phone only resizes the window, so the
 * layout follows width, never the device name: compact (folded cover screen, ordinary phones), medium (unfolded
 * inner screen), expanded (tablets, Windows).
 */
export type WindowClass = "compact" | "medium" | "expanded";
export const windowClass = (width: number): WindowClass => (width < 600 ? "compact" : width <= 840 ? "medium" : "expanded");

export function useWindowClass(): WindowClass {
  const [wc, setWc] = useState(() => windowClass(window.innerWidth));
  useEffect(() => {
    const on = () => setWc(windowClass(window.innerWidth));
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.wc = wc;
  }, [wc]);
  return wc;
}
