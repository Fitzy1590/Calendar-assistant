import { useEffect, useRef } from "react";
import { toast, useStore } from "../../store";
import { addSenderRule, moveToFolder } from "../../lib/mail/engine";
import type { MailMessage } from "../../lib/mail/types";

/** Right-click (or the context-menu key / Shift+F10) on an email: file it, make a rule, or change how its sender is handled. */
export function MailContextMenu({
  m,
  x,
  y,
  onClose,
  onFile,
  onMoved,
}: {
  m: MailMessage;
  x: number;
  y: number;
  onClose: () => void;
  onFile: () => void;
  onMoved: (folderId: string | null) => void;
}) {
  const folders = useStore((s) => s.settings.mail.folders);
  const ref = useRef<HTMLDivElement>(null);
  const who = m.from.name || m.from.address;

  useEffect(() => {
    const items = () => Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return void (e.preventDefault(), onClose());
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const list = items();
      const i = list.indexOf(document.activeElement as HTMLButtonElement);
      list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
    };
    const onAway = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onAway);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onAway);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const run = (fn: () => Promise<unknown> | void) => () => {
    onClose();
    Promise.resolve(fn()).catch((e: Error) => toast(e.message));
  };
  // keep the menu on screen
  const left = Math.max(8, Math.min(x, window.innerWidth - 260));
  const top = Math.max(8, Math.min(y, window.innerHeight - 320));

  return (
    <div ref={ref} className="ctx-menu" role="menu" aria-label={`Actions for ${m.subject}`} style={{ left, top }}>
      <button role="menuitem" className="ctx-item" onClick={run(onFile)}>
        Create rule + new folder…
      </button>
      <div className="ctx-sep" role="separator" />
      <div className="ctx-label" aria-hidden="true">
        Move to folder
      </div>
      {folders.map((f) => (
        <button
          key={f.id}
          role="menuitem"
          className="ctx-item"
          aria-current={m.folderId === f.id ? "true" : undefined}
          onClick={run(async () => {
            await moveToFolder(m.id, f.id);
            onMoved(f.id);
            toast(`Moved to ${f.name}. Only in this app.`);
          })}
        >
          {m.folderId === f.id ? "✓ " : ""}
          {f.name}
        </button>
      ))}
      {!folders.length && <div className="ctx-label">No folders yet</div>}
      {m.folderId && (
        <button
          role="menuitem"
          className="ctx-item"
          onClick={run(async () => {
            await moveToFolder(m.id, null);
            onMoved(null);
          })}
        >
          Back to Inbox
        </button>
      )}
      <div className="ctx-sep" role="separator" />
      <button
        role="menuitem"
        className="ctx-item"
        onClick={run(async () => {
          const r = await addSenderRule(m, "important");
          toast(r.created ? `Rule added: ${r.rule.name}` : "That rule already exists.");
        })}
      >
        Always important: {who}
      </button>
      <button
        role="menuitem"
        className="ctx-item"
        onClick={run(async () => {
          const r = await addSenderRule(m, "mute");
          toast(r.created ? `Rule added: ${r.rule.name}` : "That rule already exists.");
        })}
      >
        Mute: {who}
      </button>
    </div>
  );
}
