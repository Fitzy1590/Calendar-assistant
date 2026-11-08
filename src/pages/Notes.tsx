import type React from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Note, NoteColor } from "../types";
import { live, toast, useStore } from "../store";
import { addNote, NOTE_COLORS, tagsOf, toggleLine } from "../lib/notes";
import { dictate, stopDictation, useVoice, voiceReady, unsupportedMessage } from "../lib/wake";
import { localIso } from "../lib/util";
import { EventEditor } from "../components/EventEditor";
import { IArchive, ICal, IMic, IPalette, IPinNote, ISearch, ITasks, ITrash } from "../components/Icons";
import { Modal, PageHead, Seg, Toggle } from "../components/ui";

const colorVar = (c: NoteColor) => ({ ["--nc" as string]: `var(--n-${c})` });

export function Notes() {
  const s = useStore();
  const cfg = s.settings.pages.notes;
  const [q, setQ] = useState("");
  const [color, setColor] = useState<NoteColor | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [open, setOpen] = useState<Note | null>(null);
  const [custom, setCustom] = useState(false);
  const [undo, setUndo] = useState<Note | null>(null);
  const [drag, setDrag] = useState<{ id: string; over?: string } | null>(null);

  useEffect(() => {
    const h = (e: Event) => setQ((e as CustomEvent).detail);
    window.addEventListener("notes-search", h);
    return () => window.removeEventListener("notes-search", h);
  }, []);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);

  const all = live(s.notes);
  const tags = useMemo(() => [...new Set(all.flatMap((n) => n.tags ?? []))].sort(), [s.notes]);
  const shown = all
    .filter((n) => (cfg.showArchived ? true : !n.archived))
    .filter((n) => !color || n.color === color)
    .filter((n) => !tag || n.tags?.includes(tag))
    .filter((n) => !q || (n.title + " " + n.body).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.order - b.order);
  const pinned = shown.filter((n) => n.pinned && !n.archived);
  const others = shown.filter((n) => !n.pinned || n.archived);

  const remove = (n: Note) => {
    s.remove("notes", n.id);
    setUndo(n);
    setOpen(null);
  };
  const dropOn = (target: Note) => {
    if (!drag || drag.id === target.id) return setDrag(null);
    // place the dragged note just before the target, then renumber that group
    const list = shown.filter((n) => !!n.pinned === !!target.pinned).filter((n) => n.id !== drag.id);
    const idx = list.findIndex((n) => n.id === target.id);
    const moved = all.find((n) => n.id === drag.id)!;
    list.splice(idx, 0, moved);
    list.forEach((n, i) => n.order !== i && s.upsert("notes", { id: n.id, order: i, pinned: target.pinned }));
    setDrag(null);
  };

  const board = (list: Note[]) => (
    <div
      className={cfg.layout === "board" ? "notes-board" : "notes-list"}
      style={{ ["--note-w" as string]: { s: "200px", m: "260px", l: "340px" }[cfg.size] }}
    >
      {list.map((n) => (
        <NoteCard
          key={n.id}
          n={n}
          onOpen={() => setOpen(n)}
          onDelete={() => remove(n)}
          onTag={setTag}
          dragging={drag?.id === n.id}
          dropBefore={drag?.over === n.id && drag.id !== n.id}
          onDragStart={() => setDrag({ id: n.id })}
          onDragOver={() => drag && drag.over !== n.id && setDrag({ ...drag, over: n.id })}
          onDrop={() => dropOn(n)}
          onDragEnd={() => setDrag(null)}
        />
      ))}
    </div>
  );

  return (
    <>
      <PageHead
        title="Notes"
        sub={`${all.filter((n) => !n.archived).length} notes${pinned.length ? ` · ${pinned.length} pinned` : ""}`}
        open={custom}
        setOpen={setCustom}
        customise={
          <div className="row" style={{ gap: 24 }}>
            <label className="row">
              Layout{" "}
              <Seg
                value={cfg.layout}
                onChange={(v) => s.updateSettings((st) => void (st.pages.notes.layout = v))}
                options={[
                  { value: "board", label: "Sticky board" },
                  { value: "list", label: "List" },
                ]}
              />
            </label>
            <label className="row">
              Note size{" "}
              <Seg
                value={cfg.size}
                onChange={(v) => s.updateSettings((st) => void (st.pages.notes.size = v))}
                options={[
                  { value: "s", label: "S" },
                  { value: "m", label: "M" },
                  { value: "l", label: "L" },
                ]}
              />
            </label>
            <span className="row">
              <Toggle
                checked={cfg.showArchived}
                onChange={(v) => s.updateSettings((st) => void (st.pages.notes.showArchived = v))}
                label="Show archived"
              />{" "}
              Show archived
            </span>
          </div>
        }
      />
      <Composer />
      <div className="row" style={{ margin: "16px 0" }}>
        <div className="command" style={{ maxWidth: 300 }}>
          <ISearch />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" aria-label="Search notes" />
        </div>
        {NOTE_COLORS.map((c) => (
          <button
            key={c.id}
            className="swatch"
            style={colorVar(c.id)}
            aria-pressed={color === c.id}
            aria-label={`Only ${c.label}`}
            title={c.label}
            onClick={() => setColor(color === c.id ? null : c.id)}
          />
        ))}
        {tags.map((t) => (
          <button key={t} className="chip" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
            #{t}
          </button>
        ))}
      </div>
      {pinned.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Pinned
          </div>
          {board(pinned)}
          <div className="eyebrow" style={{ margin: "8px 0" }}>
            Others
          </div>
        </>
      )}
      {board(others)}
      {!shown.length && (
        <div className="empty">{all.length ? "No notes match." : "No notes yet. Write one above, or say “Hey Planner, take a note…”."}</div>
      )}
      {open && <NoteEditor n={open} onClose={() => setOpen(null)} onDelete={() => remove(open)} />}
      {undo && (
        <div className="undo-bar" role="status">
          Note deleted <button onClick={() => (s.upsert("notes", { id: undo.id, deleted: false }), setUndo(null))}>Undo</button>
        </div>
      )}
    </>
  );
}

function Composer() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [color, setColor] = useState<NoteColor>("yellow");
  const [focused, setFocused] = useState(false);
  const voice = useVoice();
  const base = useRef("");
  const save = () => {
    if (!title.trim() && !body.trim()) return;
    addNote({ title: title.trim(), body: body.trim(), color });
    setTitle("");
    setBody("");
  };
  const mic = () => {
    if (voice.status === "dictating") return stopDictation();
    if (!voiceReady()) return toast(unsupportedMessage());
    base.current = body ? body + " " : "";
    setFocused(true);
    dictate(
      (t) => setBody(base.current + t),
      (t) => setBody(base.current + t),
      { long: true },
    );
  };
  return (
    <div className="note-composer" onFocus={() => setFocused(true)}>
      {focused && <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Note title" />}
      <textarea
        rows={focused ? 4 : 1}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a note…   (start a line with [ ] for a checklist, #tag to group)"
        aria-label="Note text"
        onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === "Enter" && save()}
      />
      {focused && (
        <div className="row">
          {NOTE_COLORS.map((c) => (
            <button
              key={c.id}
              className="swatch"
              style={colorVar(c.id)}
              aria-pressed={color === c.id}
              aria-label={c.label}
              onClick={() => setColor(c.id)}
            />
          ))}
          <button
            className={"btn ghost icon sm" + (voice.status === "dictating" ? " mic-on" : "")}
            onClick={mic}
            aria-label="Dictate"
            title="Dictate into this note"
          >
            <IMic size={16} />
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn sm ghost" onClick={() => (setFocused(false), setTitle(""), setBody(""))}>
            Close
          </button>
          <button className="btn sm primary" onClick={save}>
            Add note
          </button>
        </div>
      )}
    </div>
  );
}

function renderBody(n: Note, onToggle: (i: number) => void): ReactNode {
  return n.body.split("\n").map((line, i) => {
    const m = line.match(/^\s*(?:[-*]\s*)?\[( |x|X)\]\s?(.*)$/);
    const text = (m ? m[2] : line).split(/(#[\p{L}\p{N}_-]{2,30})/u).map((part, j) =>
      part.startsWith("#") ? (
        <span key={j} className="hash">
          {part}
        </span>
      ) : (
        part
      ),
    );
    if (m)
      return (
        <label key={i} className={"nline" + (m[1] !== " " ? " done" : "")} onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={m[1] !== " "} onChange={() => onToggle(i)} /> <span>{text}</span>
        </label>
      );
    return <div key={i}>{text.length ? text : " "}</div>;
  });
}

function NoteCard(p: {
  n: Note;
  onOpen: () => void;
  onDelete: () => void;
  onTag: (t: string) => void;
  dragging: boolean;
  dropBefore: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const s = useStore();
  const { n } = p;
  const [palette, setPalette] = useState(false);
  const stop = (fn: () => void) => (e: React.MouseEvent) => (e.stopPropagation(), fn());
  return (
    <article
      className={"note" + (p.dragging ? " dragging" : "") + (p.dropBefore ? " drop-before" : "")}
      style={colorVar(n.color)}
      tabIndex={0}
      onClick={p.onOpen}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && p.onOpen()}
      draggable
      onDragStart={p.onDragStart}
      onDragOver={(e) => (e.preventDefault(), p.onDragOver())}
      onDrop={(e) => (e.preventDefault(), p.onDrop())}
      onDragEnd={p.onDragEnd}
      aria-label={n.title || n.body.slice(0, 40)}
    >
      {n.pinned && (
        <span className="pin">
          <IPinNote size={15} filled />
        </span>
      )}
      {n.title && <h3>{n.title}</h3>}
      <div className="nbody">{renderBody(n, (i) => s.upsert("notes", { id: n.id, body: toggleLine(n.body, i) }))}</div>
      {palette ? (
        <div className="row" onClick={(e) => e.stopPropagation()}>
          {NOTE_COLORS.map((c) => (
            <button
              key={c.id}
              className="swatch"
              style={colorVar(c.id)}
              aria-pressed={n.color === c.id}
              aria-label={c.label}
              onClick={() => (s.upsert("notes", { id: n.id, color: c.id }), setPalette(false))}
            />
          ))}
        </div>
      ) : (
        <div className="nfoot">
          <button
            onClick={stop(() => s.upsert("notes", { id: n.id, pinned: !n.pinned }))}
            title={n.pinned ? "Unpin" : "Pin"}
            aria-label={n.pinned ? "Unpin" : "Pin"}
          >
            <IPinNote size={15} filled={n.pinned} />
          </button>
          <button onClick={stop(() => setPalette(true))} title="Colour" aria-label="Colour">
            <IPalette size={15} />
          </button>
          <button
            onClick={stop(
              () => (
                s.upsert("tasks", { title: n.title || n.body.split("\n")[0].slice(0, 80), notes: n.body, priority: "med", done: false }),
                toast("Added to tasks")
              ),
            )}
            title="Make a task"
            aria-label="Make a task"
          >
            <ITasks size={15} />
          </button>
          <button
            onClick={stop(() => s.upsert("notes", { id: n.id, archived: !n.archived }))}
            title={n.archived ? "Unarchive" : "Archive"}
            aria-label="Archive"
          >
            <IArchive size={15} />
          </button>
          <button onClick={stop(p.onDelete)} title="Delete" aria-label="Delete">
            <ITrash size={15} />
          </button>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, opacity: 0.6 }}>{formatDistanceToNowStrict(n.updatedAt)}</span>
        </div>
      )}
    </article>
  );
}

function NoteEditor({ n, onClose, onDelete }: { n: Note; onClose: () => void; onDelete: () => void }) {
  const s = useStore();
  const [title, setTitle] = useState(n.title);
  const [body, setBody] = useState(n.body);
  const [color, setColor] = useState(n.color);
  const [event, setEvent] = useState(false);
  const voice = useVoice();
  const base = useRef("");
  const save = () => {
    if (title !== n.title || body !== n.body || color !== n.color)
      s.upsert("notes", { id: n.id, title, body, color, tags: tagsOf({ title, body }) });
    onClose();
  };
  const mic = () => {
    if (voice.status === "dictating") return stopDictation();
    if (!voiceReady()) return toast(unsupportedMessage());
    base.current = body ? body + (body.endsWith("\n") ? "" : " ") : "";
    dictate(
      (t) => setBody(base.current + t),
      (t) => setBody(base.current + t),
      { long: true },
    );
  };
  return (
    <Modal
      title="Note"
      onClose={save}
      wide
      footer={
        <>
          <button className="btn danger" onClick={onDelete}>
            <ITrash size={15} /> Delete
          </button>
          <button
            className="btn"
            onClick={() => (
              s.upsert("tasks", { title: title || body.split("\n")[0].slice(0, 80), notes: body, priority: "med", done: false }),
              toast("Added to tasks")
            )}
          >
            <ITasks size={15} /> Make a task
          </button>
          <button className="btn" onClick={() => setEvent(true)}>
            <ICal size={15} /> Add to calendar
          </button>
          <span style={{ flex: 1 }} />
          <span className="faint" style={{ fontSize: 12 }}>
            Edited {format(n.updatedAt, "d MMM, h:mm a")}
          </span>
          <button className="btn primary" onClick={save}>
            Done
          </button>
        </>
      }
    >
      <div className="note-editor" style={colorVar(color)}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" autoFocus={!n.body} />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write anything…"
          aria-label="Note text"
          autoFocus={!!n.body}
        />
      </div>
      <div className="row">
        {NOTE_COLORS.map((c) => (
          <button
            key={c.id}
            className="swatch"
            style={colorVar(c.id)}
            aria-pressed={color === c.id}
            aria-label={c.label}
            onClick={() => setColor(c.id)}
          />
        ))}
        <button className={"btn sm" + (voice.status === "dictating" ? " mic-on" : "")} onClick={mic}>
          <IMic size={15} /> {voice.status === "dictating" ? "Stop dictating" : "Dictate"}
        </button>
        <button className="btn sm ghost" onClick={() => setBody((b) => (b && !b.endsWith("\n") ? b + "\n" : b) + "[ ] ")}>
          Add checklist item
        </button>
        <span className="faint" style={{ fontSize: 12.5 }}>
          Use #tags to group notes.
        </span>
      </div>
      {event && (
        <EventEditor
          initial={{
            title: title || body.split("\n")[0].slice(0, 80),
            notes: body,
            start: localIso(new Date(Date.now() + 3600e3)),
            end: localIso(new Date(Date.now() + 7200e3)),
          }}
          onClose={() => setEvent(false)}
        />
      )}
    </Modal>
  );
}
