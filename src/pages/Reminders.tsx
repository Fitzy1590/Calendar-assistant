import { format, formatDistanceToNowStrict } from "date-fns";
import { useState } from "react";
import { useStore } from "../store";
import { upcomingReminders, type Reminder } from "../lib/reminders";
import { IBell, ICake, ICal, ITasks } from "../components/Icons";
import { PageHead, Toggle } from "../components/ui";

const ICON = { event: ICal, birthday: ICake, task: ITasks };

export function Reminders() {
  const s = useStore();
  const r = s.settings.reminders;
  const [range, setRange] = useState(14);
  const list = upcomingReminders(range);
  const set = (p: Partial<typeof r>) => s.updateSettings((st) => void Object.assign(st.reminders, p));
  const groups: [string, Reminder[]][] = [
    ["Due now", list.filter((x) => x.at.getTime() <= Date.now())],
    ["Coming up", list.filter((x) => x.at.getTime() > Date.now())],
  ];
  const turnOff = (x: Reminder) => {
    if (x.kind === "event") s.upsert("events", { id: x.refId, reminderMins: [] });
    else s.dismissReminder(x.key);
  };

  return (
    <>
      <PageHead title="Reminders" sub="Turn each kind on or off, snooze, or ignore a single reminder." />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 28 }}>
          <span className="row">
            <Toggle checked={r.events} onChange={(v) => set({ events: v })} label="Event reminders" /> Events
          </span>
          <span className="row">
            <Toggle checked={r.birthdays} onChange={(v) => set({ birthdays: v })} label="Birthday reminders" /> Birthdays,
            <select
              className="input"
              style={{ width: 120 }}
              value={r.birthdayDaysBefore}
              onChange={(e) => set({ birthdayDaysBefore: +e.target.value })}
            >
              {[0, 1, 2, 3, 5, 7, 14].map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? "on the day" : `${d} days before`}
                </option>
              ))}
            </select>
          </span>
          <span className="row">
            <Toggle checked={r.tasks} onChange={(v) => set({ tasks: v })} label="Task reminders" /> Tasks
          </span>
          <span className="row">
            <Toggle checked={r.desktopNotifications} onChange={(v) => set({ desktopNotifications: v })} label="Notifications" /> Pop-up
            notifications
          </span>
          <label className="row">
            Show next
            <select className="input" style={{ width: 100 }} value={range} onChange={(e) => setRange(+e.target.value)}>
              {[7, 14, 30, 60].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {groups.map(([name, items]) => (
        <section key={name} className="card" style={{ marginBottom: 16 }}>
          <h2>
            {name} <span className="faint">{items.length}</span>
          </h2>
          <div className="list">
            {items.map((x) => {
              const Icon = ICON[x.kind];
              return (
                <div key={x.key} className="row" style={{ justifyContent: "space-between" }}>
                  <span className="row" style={{ flexWrap: "nowrap" }}>
                    <Icon size={18} />
                    <span>
                      <b>{x.title}</b>
                      <div className="muted" style={{ fontSize: 12.5 }}>
                        {x.detail} · alert {x.at.getTime() <= Date.now() ? "now" : `in ${formatDistanceToNowStrict(x.at)}`} (
                        {format(x.at, "EEE h:mm a")})
                      </div>
                    </span>
                  </span>
                  <span className="row">
                    {x.kind === "task" && (
                      <button className="btn sm" onClick={() => s.upsert("tasks", { id: x.refId, done: true, doneAt: Date.now() })}>
                        Done
                      </button>
                    )}
                    <button className="btn sm" onClick={() => s.snoozeReminder(x.key, Date.now() + 3600e3)}>
                      Snooze 1h
                    </button>
                    <button className="btn sm" onClick={() => s.snoozeReminder(x.key, Date.now() + 864e5)}>
                      Tomorrow
                    </button>
                    <button className="btn sm ghost" onClick={() => s.dismissReminder(x.key)}>
                      Ignore
                    </button>
                    <button className="btn sm ghost" onClick={() => turnOff(x)} title="Stop reminding me about this">
                      Turn off
                    </button>
                  </span>
                </div>
              );
            })}
            {!items.length && (
              <div className="empty row">
                <IBell size={16} /> Nothing here.
              </div>
            )}
          </div>
        </section>
      ))}
    </>
  );
}
