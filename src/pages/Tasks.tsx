import type React from "react";
import { addDays, format, isToday } from "date-fns";
import { useMemo, useState } from "react";
import type { Priority, Task } from "../types";
import { live, toast, useStore } from "../store";
import { cleanTitle, parseWhen } from "../lib/nlp";
import { planWeek, taskBoardEvents, type PlanItem } from "../lib/planner";
import { occurrencesOnDay } from "../lib/recurrence";
import { cx, fromYmd, todayYmd, ymd } from "../lib/util";
import { ICheck, IPlus, ITrash } from "../components/Icons";
import { Modal, PageHead, Seg, Toggle } from "../components/ui";

export function Tasks() {
  const s = useStore();
  const cfg = s.settings.pages.tasks;
  const [mode, setMode] = useState<"list" | "week">("week");
  const [text, setText] = useState("");
  const [prio, setPrio] = useState<Priority>("med");
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  const [custom, setCustom] = useState(false);
  const tasks = live(s.tasks).filter((t) => cfg.showDone || !t.done);

  const quickAdd = () => {
    if (!text.trim()) return;
    const w = parseWhen(text);
    s.upsert("tasks", { title: cleanTitle(w.rest) || text, due: w.date ? ymd(w.date) : undefined, priority: prio, done: false });
    setText("");
  };

  return (
    <>
      <PageHead
        title="Tasks"
        sub={`${live(s.tasks).filter((t) => !t.done).length} open · ${live(s.tasks).filter((t) => t.done && t.doneAt && isToday(t.doneAt)).length} done today`}
        actions={
          <>
            <Seg
              value={mode}
              onChange={setMode}
              options={[
                { value: "week", label: "Week plan" },
                { value: "list", label: "List" },
              ]}
            />
            <button className="btn primary" onClick={() => setPlan(planWeek())}>
              Plan my week
            </button>
          </>
        }
        open={custom}
        setOpen={setCustom}
        customise={
          <div className="row" style={{ gap: 24 }}>
            <span className="row">
              <Toggle
                checked={cfg.showDone}
                onChange={(v) => s.updateSettings((st) => void (st.pages.tasks.showDone = v))}
                label="Show completed"
              />{" "}
              Show completed
            </span>
            <label className="row">
              Group list by{" "}
              <Seg
                value={cfg.groupBy}
                onChange={(v) => s.updateSettings((st) => void (st.pages.tasks.groupBy = v))}
                options={[
                  { value: "day", label: "Day" },
                  { value: "priority", label: "Priority" },
                ]}
              />
            </label>
          </div>
        }
      />
      <form className="row card" style={{ marginBottom: 16, flexWrap: "nowrap" }} onSubmit={(e) => (e.preventDefault(), quickAdd())}>
        <IPlus />
        <input
          className="input"
          style={{ border: 0, background: "none" }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='Add a task — "Pay rates Friday", "Book service next week"'
        />
        <select
          className="input"
          style={{ width: 110 }}
          value={prio}
          onChange={(e) => setPrio(e.target.value as Priority)}
          aria-label="Priority"
        >
          <option value="high">High</option>
          <option value="med">Normal</option>
          <option value="low">Low</option>
        </select>
        <button className="btn primary">Add</button>
      </form>
      {mode === "week" ? <WeekBoard tasks={tasks} /> : <TaskList tasks={tasks} groupBy={cfg.groupBy} />}
      {plan && (
        <Modal
          title="Suggested plan for the next 7 days"
          onClose={() => setPlan(null)}
          footer={
            <>
              <button className="btn" onClick={() => setPlan(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={!plan.length}
                onClick={() => {
                  plan.forEach((p) => s.upsert("tasks", { id: p.task.id, due: p.day, ignored: false }));
                  toast(`Scheduled ${plan.length} tasks`);
                  setPlan(null);
                }}
              >
                Apply plan
              </button>
            </>
          }
        >
          {!plan.length ? (
            <div className="muted">Every open task already has a day. Nothing to plan.</div>
          ) : (
            <>
              <div className="muted">
                Undated and overdue tasks, placed on your lightest days first (events count toward each day's load; high priority goes
                first).
              </div>
              <div className="list">
                {plan.map((p) => (
                  <div key={p.task.id} className="row" style={{ justifyContent: "space-between" }}>
                    <span>
                      <b>{format(fromYmd(p.day), "EEE d")}</b> · {p.task.title}
                    </span>
                    <span className="faint" style={{ fontSize: 12 }}>
                      {p.reason}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

function TaskRow({ t }: { t: Task }) {
  const s = useStore();
  const [editing, setEditing] = useState(false);
  const overdue = !t.done && t.due && t.due < todayYmd();
  return (
    <div className="task-row" draggable onDragStart={(e) => e.dataTransfer.setData("text/task", t.id)}>
      <button
        className={cx("check", t.done && "on")}
        onClick={() => s.upsert("tasks", { id: t.id, done: !t.done, doneAt: Date.now() })}
        aria-label={t.done ? "Mark not done" : "Mark done"}
      >
        {t.done && <ICheck size={13} />}
      </button>
      {editing ? (
        <input
          className="input"
          autoFocus
          defaultValue={t.title}
          onBlur={(e) => (s.upsert("tasks", { id: t.id, title: e.target.value }), setEditing(false))}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      ) : (
        <span className={cx("t", t.done && "done")} onDoubleClick={() => setEditing(true)}>
          {t.priority === "high" && <b className="prio-high">! </b>}
          {t.title}
          {overdue && (
            <span className="tag" style={{ color: "var(--bad)", marginLeft: 6 }}>
              overdue
            </span>
          )}
          {t.ignored && (
            <span className="tag" style={{ marginLeft: 6 }}>
              parked
            </span>
          )}
        </span>
      )}
      <span className="row" style={{ gap: 2 }}>
        <input
          type="date"
          className="input"
          style={{ width: 132, padding: "2px 6px", fontSize: 12 }}
          value={t.due ?? ""}
          onChange={(e) => s.upsert("tasks", { id: t.id, due: e.target.value || undefined, ignored: false })}
          aria-label="Due date"
        />
        <button className="btn ghost icon sm" onClick={() => s.remove("tasks", t.id)} aria-label="Delete">
          <ITrash size={15} />
        </button>
      </span>
    </div>
  );
}

/** A compact draggable task for the week board: drag it to another day, or the Unscheduled box. */
function BoardCard({ t, onGrab }: { t: Task; onGrab: (e: React.PointerEvent<HTMLElement>, t: Task) => void }) {
  const s = useStore();
  const [editing, setEditing] = useState(false);
  // keyboard way to move a task: Alt + Left / Right shifts it a day (an undated task goes to today)
  const shift = (dir: -1 | 1) => {
    const base = t.due ? fromYmd(t.due) : new Date();
    s.upsert("tasks", { id: t.id, due: ymd(t.due ? addDays(base, dir) : base), ignored: false });
  };
  return (
    <div
      className={cx("board-card", t.done && "done")}
      tabIndex={0}
      aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
      onPointerDown={(e) => !editing && onGrab(e, t)}
      onKeyDown={(e) => {
        if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight") && e.target === e.currentTarget) {
          e.preventDefault();
          shift(e.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      <span className="board-grip" aria-hidden="true" />
      <button
        className={cx("check", t.done && "on")}
        onClick={() => s.upsert("tasks", { id: t.id, done: !t.done, doneAt: Date.now() })}
        aria-label={t.done ? "Mark not done" : "Mark done"}
      >
        {t.done && <ICheck size={13} />}
      </button>
      {editing ? (
        <input
          className="input"
          autoFocus
          defaultValue={t.title}
          onBlur={(e) => (s.upsert("tasks", { id: t.id, title: e.target.value || t.title }), setEditing(false))}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      ) : (
        <span className={cx("t", t.done && "done")} onDoubleClick={() => setEditing(true)}>
          {t.priority === "high" && <b className="prio-high">! </b>}
          {t.title}
        </span>
      )}
      <button className="btn ghost icon sm board-del" onClick={() => s.remove("tasks", t.id)} aria-label={`Delete ${t.title}`}>
        <ITrash size={14} />
      </button>
    </div>
  );
}

function TaskList({ tasks, groupBy }: { tasks: Task[]; groupBy: "day" | "priority" }) {
  const today = todayYmd();
  const groups = useMemo(() => {
    const g = new Map<string, Task[]>();
    const key = (t: Task) =>
      groupBy === "priority"
        ? { high: "High priority", med: "Normal", low: "Low" }[t.priority]
        : !t.due
          ? "Someday"
          : t.due < today
            ? "Overdue"
            : t.due === today
              ? "Today"
              : format(fromYmd(t.due), "EEEE d MMM");
    for (const t of [...tasks].sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9"))) g.set(key(t), [...(g.get(key(t)) ?? []), t]);
    return [...g];
  }, [tasks, groupBy]);
  return (
    <div className="stack">
      {groups.map(([name, list]) => (
        <section key={name} className="card">
          <h2>
            {name} <span className="faint">{list.length}</span>
          </h2>
          <div className="list">
            {list.map((t) => (
              <TaskRow key={t.id} t={t} />
            ))}
          </div>
        </section>
      ))}
      {!groups.length && <div className="empty">No tasks yet.</div>}
    </div>
  );
}

/** Seven columns you can drag tasks between, with each day's events shown for context. */
function WeekBoard({ tasks }: { tasks: Task[] }) {
  const s = useStore();
  const [over, setOver] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null); // the day a new task is being typed into
  const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));
  const today = todayYmd();
  const unscheduled = tasks.filter((t) => !t.due || (t.due < today && !t.done));
  // Drag with pointer events, not HTML5 drag-and-drop: it works the same in the Windows and Android webviews and with touch.
  // Mouse and pen can grab anywhere on a card; touch grabs the dotted handle so the page can still scroll.
  const grab = (e: React.PointerEvent<HTMLElement>, t: Task) => {
    const el = e.target as HTMLElement;
    if (e.button !== 0 || el.closest("button, input")) return;
    if (e.pointerType === "touch" && !el.closest(".board-grip")) return;
    const card = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    let ghost: HTMLElement | null = null;
    const dayAt = (x: number, y: number) =>
      document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop-day]")?.dataset.dropDay ?? null;
    const move = (ev: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
        ghost = card.cloneNode(true) as HTMLElement;
        ghost.classList.add("board-ghost");
        ghost.style.width = `${card.offsetWidth}px`;
        document.body.appendChild(ghost);
        card.classList.add("dragging");
      }
      ghost.style.transform = `translate(${ev.clientX + 8}px, ${ev.clientY + 8}px)`;
      setOver(dayAt(ev.clientX, ev.clientY));
    };
    const finish = (ev: PointerEvent, drop: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      const dragged = !!ghost;
      ghost?.remove();
      card.classList.remove("dragging");
      setOver(null);
      const day = drop && dragged ? dayAt(ev.clientX, ev.clientY) : null;
      if (day !== null) s.upsert("tasks", { id: t.id, due: day === "none" ? undefined : day, ignored: false });
    };
    const up = (ev: PointerEvent) => finish(ev, true);
    const cancel = (ev: PointerEvent) => finish(ev, false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };
  const addTo = (day: string, title: string) => {
    setAdding(null);
    if (title.trim()) s.upsert("tasks", { title: title.trim(), due: day, priority: "med", done: false });
  };
  const events = taskBoardEvents(live(s.events));
  return (
    <div className="stack">
      <div className="week-board">
        {days.map((d) => {
          const k = ymd(d);
          const occ = occurrencesOnDay(events, d);
          const list = tasks.filter((t) => t.due === k);
          return (
            <div
              key={k}
              data-drop-day={k}
              className={cx("daycol", k === today && "today", over === k && "drop")}
              aria-label={`${format(d, "EEEE d MMMM")}${k === today ? ", today" : ""}. Double-click to add a task.`}
              onDoubleClick={(e) => {
                if (!(e.target as HTMLElement).closest(".board-card, button, input")) setAdding(k);
              }}
            >
              <h4>
                <span>{k === today ? `Today · ${format(d, "EEE d")}` : format(d, "EEE d")}</span>
                <span className="faint mono" style={{ fontSize: 11 }}>
                  {occ.length ? `${occ.length} ev` : ""}
                </span>
              </h4>
              {occ.slice(0, 3).map((o) => (
                <div key={o.key} className="pill" style={{ marginBottom: 4 }}>
                  {o.event.title}
                </div>
              ))}
              <div className="list" style={{ marginTop: 6 }}>
                {list.map((t) => (
                  <BoardCard key={t.id} t={t} onGrab={grab} />
                ))}
              </div>
              {adding === k ? (
                <input
                  className="input"
                  autoFocus
                  aria-label={`New task for ${format(d, "EEEE d MMMM")}`}
                  placeholder="New task, press Enter"
                  style={{ marginTop: 6 }}
                  onBlur={(e) => addTo(k, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addTo(k, (e.target as HTMLInputElement).value);
                    if (e.key === "Escape") setAdding(null);
                  }}
                />
              ) : (
                <button className="btn ghost sm board-add" onClick={() => setAdding(k)}>
                  <IPlus size={13} /> Add task
                </button>
              )}
            </div>
          );
        })}
      </div>
      <section data-drop-day="none" className={cx("card", over === "none" && "drop")}>
        <h2>
          Unscheduled & overdue <span className="faint">{unscheduled.length}</span> <span className="spacer" />
          <span className="faint" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
            drag onto a day
          </span>
        </h2>
        <div className="list">
          {unscheduled.map((t) => (
            <BoardCard key={t.id} t={t} onGrab={grab} />
          ))}
        </div>
        {!unscheduled.length && <div className="empty">Nothing waiting.</div>}
      </section>
    </div>
  );
}
