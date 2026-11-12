import { useEffect, useRef } from "react";
import { toast, useStore } from "../../store";
import { addSenderRule, isSeen, moveToFolder, setReadMany, snoozeMail } from "../../lib/mail/engine";
import { snoozeOptions } from "../../lib/mail/followups";
import { dateIdeas } from "../../lib/mail/mailDates";
import { openCompose, replyTo } from "../../lib/mail/composeStore";
import { openUrl } from "../../lib/platform";
import { unsubscribeDraft, unsubscribeFor } from "../../lib/mail/unsubscribe";
import { visibleMenu } from "../../lib/mail/menu";
import type { MailMessage } from "../../lib/mail/types";

/** Right-click (or the context-menu key / Shift+F10) on an email. The items, their order and which show are yours to change in Settings → Email. */
export function MailContextMenu({
  m,
  x,
  y,
  onClose,
  onFile,
  onMoved,
  onDates,
}: {
  m: MailMessage;
  x: number;
  y: number;
  onClose: () => void;
  onFile: () => void;
  onMoved: (folderId: string | null) => void;
  onDates: () => void;
}) {
  const mail = useStore((s) => s.settings.mail);
  const ref = useRef<HTMLDivElement>(null);
  const who = m.from.name || m.from.address;
  const items = visibleMenu(mail.menu);

  useEffect(() => {
    const els = () => Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    els()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return void (e.preventDefault(), onClose());
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const list = els();
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
  const left = Math.max(8, Math.min(x, window.innerWidth - 270));
  const top = Math.max(8, Math.min(y, window.innerHeight - 440));
  const Item = ({ children, onClick, current }: { children: React.ReactNode; onClick: () => void; current?: boolean }) => (
    <button role="menuitem" className="ctx-item" aria-current={current ? "true" : undefined} onClick={onClick}>
      {children}
    </button>
  );

  return (
    <div ref={ref} className="ctx-menu" role="menu" aria-label={`Actions for ${m.subject}`} style={{ left, top }}>
      {items.map((it) => {
        switch (it.id) {
          case "markRead": {
            const seen = isSeen(m);
            return (
              <Item key={it.id} onClick={run(() => setReadMany([m.id], !seen))}>
                {seen ? "Mark as unread" : "Mark as read"}
              </Item>
            );
          }
          case "reply":
          case "replyAll":
          case "forward":
            return (
              <Item key={it.id} onClick={run(() => replyTo(it.id as "reply" | "replyAll" | "forward", m))}>
                {it.label}
              </Item>
            );
          case "claude":
          case "gemini":
            return (
              <Item key={it.id} onClick={run(() => replyTo("reply", m, { ai: it.id as "claude" | "gemini" }))}>
                {it.label}
              </Item>
            );
          case "ruleFolder":
            return (
              <Item key={it.id} onClick={run(onFile)}>
                {it.label}
              </Item>
            );
          case "move":
            return (
              <div key={it.id} role="group" aria-label="Move to folder">
                <div className="ctx-sep" role="separator" />
                <div className="ctx-label" aria-hidden="true">
                  Move to folder
                </div>
                {mail.folders.map((f) => (
                  <Item
                    key={f.id}
                    current={m.folderId === f.id}
                    onClick={run(async () => {
                      await moveToFolder(m.id, f.id);
                      onMoved(f.id);
                      toast(`Moved to ${f.name}. Only in this app.`);
                    })}
                  >
                    {m.folderId === f.id ? "✓ " : ""}
                    {f.name}
                  </Item>
                ))}
                {!mail.folders.length && <div className="ctx-label">No folders yet</div>}
                {m.folderId && (
                  <Item
                    onClick={run(async () => {
                      await moveToFolder(m.id, null);
                      onMoved(null);
                    })}
                  >
                    Back to Inbox
                  </Item>
                )}
                <div className="ctx-sep" role="separator" />
              </div>
            );
          case "snooze":
            return (
              <div key={it.id} role="group" aria-label="Snooze">
                <div className="ctx-sep" role="separator" />
                <div className="ctx-label" aria-hidden="true">
                  Snooze until
                </div>
                {snoozeOptions().map((o) => (
                  <Item
                    key={o.at}
                    onClick={run(async () => {
                      await snoozeMail(m.id, o.at);
                      toast(`Snoozed until ${o.label.split(" · ")[1]?.length ? o.label : o.label}.`);
                    })}
                  >
                    {o.label}
                  </Item>
                ))}
                <div className="ctx-sep" role="separator" />
              </div>
            );
          case "toCalendar":
            return (
              <Item key={it.id} onClick={run(onDates)}>
                {it.label}
              </Item>
            );
          case "toTask":
            return (
              <Item
                key={it.id}
                onClick={run(() => {
                  const first = dateIdeas(m.text || m.preview || m.subject)[0];
                  useStore.getState().upsert("tasks", {
                    title: m.subject.slice(0, 120),
                    due: first
                      ? `${first.start.getFullYear()}-${String(first.start.getMonth() + 1).padStart(2, "0")}-${String(first.start.getDate()).padStart(2, "0")}`
                      : undefined,
                    done: false,
                    priority: "med",
                    notes: `From ${who}`,
                  });
                  toast("Added as a task.");
                })}
              >
                {it.label}
              </Item>
            );
          case "important":
          case "mute":
            return (
              <Item
                key={it.id}
                onClick={run(async () => {
                  const r = await addSenderRule(m, it.id as "important" | "mute");
                  toast(r.created ? `Rule added: ${r.rule.name}` : "That rule already exists.");
                })}
              >
                {it.label}: {who}
              </Item>
            );
          case "unsubscribe": {
            const u = unsubscribeFor(m);
            if (!u) return null; // only newsletters and mailing lists have one
            return (
              <Item
                key={it.id}
                onClick={run(() => {
                  if (u.web) void openUrl(u.web).then(() => toast("Opened the unsubscribe page. Follow it to finish."));
                  else {
                    const d = unsubscribeDraft(u, m.accountId);
                    if (d) openCompose(d);
                  }
                })}
              >
                Unsubscribe from {who}
              </Item>
            );
          }
          default:
            return null;
        }
      })}
    </div>
  );
}
