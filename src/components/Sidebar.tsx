import type React from "react";
import { useEffect, useState } from "react";
import type { PageId } from "../types";
import { live, useStore } from "../store";
import { onSyncStatus } from "../lib/sync";
import { moveTo, nudge } from "../lib/order";
import { needsAttention, useMail } from "../lib/mail/engine";
import { SyncPanel } from "./SyncPanel";
import { upcomingReminders } from "../lib/reminders";
import { todayYmd } from "../lib/util";
import { IBell, ICal, IMail, ICart, IChat, ICog, IDown, IHome, IIdea, INews, INote, IPeople, IRight, ISport, ITasks } from "./Icons";

const META: Record<PageId, { label: string; icon: (p: { size?: number }) => React.JSX.Element }> = {
  home: { label: "Home", icon: IHome },
  calendar: { label: "Calendar", icon: ICal },
  email: { label: "Email", icon: IMail },
  tasks: { label: "Tasks", icon: ITasks },
  notes: { label: "Notes", icon: INote },
  shopping: { label: "Shopping", icon: ICart },
  reminders: { label: "Reminders", icon: IBell },
  contacts: { label: "Contacts", icon: IPeople },
  news: { label: "News", icon: INews },
  sports: { label: "Sports", icon: ISport },
  settings: { label: "Settings", icon: ICog },
};

export function Sidebar() {
  const s = useStore();
  const mailMessages = useMail((m) => m.messages);
  const [sportsOpen, setSportsOpen] = useState(false); // collapsed until you open it
  const [syncOpen, setSyncOpen] = useState(false);
  const [sync, setSync] = useState<{ status: string; peers: string[] }>({ status: "off", peers: [] });
  useEffect(() => {
    const off = onSyncStatus((status, peers) => setSync({ status, peers }));
    return () => void off();
  }, []);
  const today = todayYmd();
  const openTasks = live(s.tasks).filter((t) => !t.done && !t.ignored && t.due && t.due <= today).length;
  const reminders = upcomingReminders(2).filter((r) => r.at.getTime() <= Date.now() + 864e5).length;
  const mail = s.settings.mail;
  const mailCount = mail.alerts.badge && mail.accounts.length ? needsAttention(mailMessages).length : 0;
  const counts: Partial<Record<PageId, number>> = { tasks: openTasks, reminders, email: mailCount };
  const go = (p: PageId) => s.setPage(p);
  // reorder the menu: drag a row onto another, or Alt+Up / Alt+Down on a focused row
  const [dragId, setDragId] = useState<PageId | null>(null);
  const [overId, setOverId] = useState<PageId | null>(null);
  const reorder = (next: typeof s.settings.sidebar) => s.updateSettings((st) => void (st.sidebar = next));
  const nudgeItem = (id: PageId, dir: -1 | 1) => {
    reorder(nudge(s.settings.sidebar, id, dir, (x) => x.visible));
    requestAnimationFrame(() => document.getElementById(`nav-${id}`)?.focus());
  };

  return (
    <nav className="side" aria-label="Main">
      <div className="brand">
        Calendar Assistant<small>{s.settings.displayName ? `${s.settings.displayName}'s planner` : "Planner"}</small>
      </div>
      {s.settings.sidebar
        .filter((i) => i.visible)
        .map(({ id }) => {
          const { label, icon: Icon } = META[id];
          return (
            <div
              key={id}
              className={overId === id && dragId && dragId !== id ? "nav-drop" : undefined}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/nav", id);
                e.dataTransfer.effectAllowed = "move";
                setDragId(id);
              }}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setOverId(id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && dragId !== id) reorder(moveTo(s.settings.sidebar, dragId, id));
                setDragId(null);
                setOverId(null);
              }}
              onDragEnd={() => (setDragId(null), setOverId(null))}
            >
              <button
                id={`nav-${id}`}
                className="nav-item"
                aria-current={s.page === id ? "page" : undefined}
                aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                onClick={() => go(id)}
                onKeyDown={(e) => {
                  if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                    e.preventDefault();
                    nudgeItem(id, e.key === "ArrowUp" ? -1 : 1);
                  }
                }}
              >
                <Icon size={18} /> <span className="nav-label-text">{label}</span>
                {id === "sports" ? (
                  <span
                    className="count"
                    onClick={(e) => (e.stopPropagation(), setSportsOpen(!sportsOpen))}
                    style={{ color: "var(--muted)" }}
                    role="button"
                    aria-label="Toggle sports list"
                  >
                    {sportsOpen ? <IDown size={14} /> : <IRight size={14} />}
                  </span>
                ) : counts[id] ? (
                  <span className="count">{counts[id]}</span>
                ) : null}
              </button>
              {id === "sports" && sportsOpen && (s.settings.sports.length > 0 || s.settings.teams.length > 0) && (
                <div className="nav-sub">
                  {s.settings.teams.map((t) => (
                    <button
                      key={t.id}
                      className="nav-item"
                      aria-current={s.page === "sports" && s.sportFocus?.id === t.id ? "page" : undefined}
                      onClick={() => s.setSportFocus({ kind: "team", id: t.id })}
                    >
                      {t.badge ? <img src={t.badge} alt="" width={14} height={14} /> : null} {t.name}
                    </button>
                  ))}
                  {s.settings.sports.map((sp) => (
                    <button
                      key={sp}
                      className="nav-item"
                      aria-current={s.page === "sports" && s.sportFocus?.id === sp ? "page" : undefined}
                      onClick={() => s.setSportFocus({ kind: "sport", id: sp })}
                    >
                      {sp}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      <div className="side-foot">
        <button className="nav-item" onClick={() => s.setUi({ assistantOpen: !s.assistantOpen })}>
          <IChat size={18} /> Assistant
        </button>
        <button className="nav-item" onClick={() => s.setUi({ feedbackOpen: true })}>
          <IIdea size={18} /> Suggestions & feedback
        </button>
        <button className="nav-item" onClick={() => setSyncOpen(true)} title={sync.peers.join(", ")}>
          <span
            className={
              "dot " + (sync.status === "online" ? "ok" : sync.status === "connecting" ? "warn" : sync.status === "offline" ? "bad" : "")
            }
            style={{ margin: "0 5px" }}
          />
          {sync.status === "online"
            ? `Synced · ${sync.peers.length} device${sync.peers.length === 1 ? "" : "s"}`
            : sync.status === "off"
              ? "Sync off"
              : sync.status === "connecting"
                ? "Connecting…"
                : "Offline · changes queued"}
        </button>
      </div>
      {syncOpen && <SyncPanel onClose={() => setSyncOpen(false)} />}
    </nav>
  );
}
