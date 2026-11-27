import { useState } from "react";
import { THEMES, ThemePicker } from "./SetupParts";
import { Modal } from "./ui";
import { useStore } from "../store";

/** Top-bar button: one tap opens every theme; one more tap on a tile switches instantly (no transition). */
export function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const theme = useStore((s) => s.settings.theme);
  const name = THEMES.find((t) => t.id === theme)?.name ?? "Match system";
  return (
    <>
      <button
        className="btn ghost"
        onClick={() => setOpen(true)}
        title={`Theme: ${name}. Change theme`}
        aria-label={`Theme: ${name}. Change theme`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.5-1.9-.3-1 .3-2.1 1.4-2.1H17a4 4 0 0 0 4-4c0-5-4-10-9-10z" />
          <circle cx="7.5" cy="11" r="1" />
          <circle cx="11" cy="7" r="1" />
          <circle cx="16" cy="8" r="1" />
        </svg>
        <span className="hide-sm">Theme</span>
      </button>
      {open && (
        <Modal title="Theme" onClose={() => setOpen(false)} wide>
          <ThemePicker />
        </Modal>
      )}
    </>
  );
}
