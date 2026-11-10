import { isTauri } from "./platform";
import { toast, useStore } from "../store";

/**
 * Full screen on and off. In the Windows app this hides the title bar and, unless you turn it off in Settings, the
 * taskbar too: the window loses its frame and covers the whole screen itself. (It does not use the system's own
 * full screen mode, which misplaces the mouse on rotated or scaled displays.) Esc or F11 brings everything back.
 * In a browser it uses the browser's own full screen.
 */

type Saved = { maximized: boolean; covered: boolean; x: number; y: number; w: number; h: number };
let saved: Saved | null = null;

export async function isFullscreen(): Promise<boolean> {
  if (isTauri()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return !(await getCurrentWindow().isDecorated());
  }
  return !!document.fullscreenElement;
}

export async function setFullscreen(on: boolean): Promise<void> {
  if (isTauri()) {
    const { currentMonitor, getCurrentWindow } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    if (on) {
      const covered = useStore.getState().settings.fullscreenCoverTaskbar;
      const [maximized, pos, size] = await Promise.all([w.isMaximized(), w.outerPosition(), w.outerSize()]);
      saved = { maximized, covered, x: pos.x, y: pos.y, w: size.width, h: size.height };
      await w.setDecorations(false);
      if (covered) {
        if (maximized) await w.unmaximize();
        const m = await currentMonitor();
        if (m) {
          await w.setPosition(m.position);
          await w.setSize(m.size);
        }
      } else if (!maximized) await w.maximize();
    } else {
      await w.setDecorations(true);
      const s = saved;
      saved = null;
      if (!s) return;
      if (s.covered) {
        const { PhysicalPosition, PhysicalSize } = await import("@tauri-apps/api/dpi");
        await w.setSize(new PhysicalSize(s.w, s.h));
        await w.setPosition(new PhysicalPosition(s.x, s.y));
        if (s.maximized) await w.maximize();
      } else if (!s.maximized) await w.unmaximize();
    }
    return;
  }
  if (on) await document.documentElement.requestFullscreen?.();
  else if (document.fullscreenElement) await document.exitFullscreen();
}

export async function toggleFullscreen(): Promise<boolean> {
  const next = !(await isFullscreen());
  await setFullscreen(next);
  if (next) toast("Full screen. Press Esc or F11 to leave.");
  return next;
}
