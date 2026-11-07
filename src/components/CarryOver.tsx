import { addDays, format } from "date-fns";
import { useState } from "react";
import { live, useStore } from "../store";
import { fromYmd, todayYmd, ymd } from "../lib/util";
import { Modal } from "./ui";

/**
 * Morning check-in: tasks that were due before today and never ticked off.
 * For each one: done / move to today / pick a day / park it (stop nagging) / delete.
 * Answering stamps carryPromptedOn so the prompt doesn't come back the same day.
 */
export function CarryOver() {
  const s = useStore();
  const today = todayYmd();
  const [closed, setClosed] = useState(false);
  const overdue = live(s.tasks).filter((t) => !t.done && !t.ignored && t.due && t.due < today && t.carryPromptedOn !== today);
  if (closed || !overdue.length || !s.settings.onboarded) return null;
  const tomorrow = ymd(addDays(new Date(), 1));
  const act = (id: string, patch: Parameters<typeof s.upsert<"tasks">>[1]) => s.upsert("tasks", { id, carryPromptedOn: today, ...patch });
  const later = () => {
    overdue.forEach((t) => act(t.id, {}));
    setClosed(true);
  };
  return (
    <Modal title={`${overdue.length} unfinished task${overdue.length > 1 ? "s" : ""}`} onClose={() => setClosed(true)} wide
      footer={<><span className="muted" style={{ flex: 1, fontSize: 12.5 }}>Anything you skip will be asked again tomorrow.</span><button className="btn" onClick={later}>Ask me tomorrow</button></>}>
      <div className="muted">These were due earlier and aren't marked complete. What would you like to do?</div>
      <div className="list">
        {overdue.map((t) => (
          <div key={t.id} className="stack" style={{ gap: 6 }}>
            <div><b>{t.title}</b> <span className="faint">· due {format(fromYmd(t.due!), "EEE d MMM")}</span></div>
            <div className="row">
              <button className="btn sm primary" onClick={() => act(t.id, { done: true, doneAt: Date.now() })}>Mark complete</button>
              <button className="btn sm" onClick={() => act(t.id, { due: today })}>Move to today</button>
              <button className="btn sm" onClick={() => act(t.id, { due: tomorrow })}>Tomorrow</button>
              <input type="date" className="input" style={{ width: 150, padding: "3px 8px" }} min={today} aria-label="Reschedule to" onChange={(e) => e.target.value && act(t.id, { due: e.target.value })} />
              <button className="btn sm ghost" onClick={() => act(t.id, { ignored: true })}>Ignore for now</button>
              <button className="btn sm ghost danger" onClick={() => s.remove("tasks", t.id)}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
