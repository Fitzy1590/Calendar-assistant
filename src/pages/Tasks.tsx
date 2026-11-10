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
  const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));
  const today = todayYmd();
  const unscheduled = tasks.filter((t) => !t.due || (t.due < today && !t.done));
  const drop = (day: string | undefined) => (e: React.DragEvent) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/task");
    if (id) s.upsert("tasks", { id, due: day, ignored: false });
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
              className={cx("daycol", over === k && "drop")}
              onDragOver={(e) => (e.preventDefault(), setOver(k))}
              onDragLeave={() => setOver(null)}
              onDrop={drop(k)}
            >
              <h4>
                <span>{k === today ? "Today" : format(d, "EEE d")}</span>
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
                  <TaskRow key={t.id} t={t} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <section
        className={cx("card", over === "none" && "drop")}
        onDragOver={(e) => (e.preventDefault(), setOver("none"))}
        onDrop={drop(undefined)}
      >
        <h2>
          Unscheduled & overdue <span className="faint">{unscheduled.length}</span> <span className="spacer" />
          <span className="faint" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
            drag onto a day
          </span>
        </h2>
        <div className="list">
          {unscheduled.map((t) => (
            <TaskRow key={t.id} t={t} />
          ))}
        </div>
        {!unscheduled.length && <div className="empty">Nothing waiting.</div>}
      </section>
    </div>
  );
}
