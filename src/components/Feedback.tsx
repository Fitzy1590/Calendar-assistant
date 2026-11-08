import { format } from "date-fns";
import { useState } from "react";
import type { Feedback as FB } from "../types";
import { live, toast, useStore } from "../store";
import { openUrl } from "../lib/platform";
import { Modal, Seg } from "./ui";

const REPO = "fitzy1590/calendar-assistant";

export function FeedbackModal() {
  const s = useStore();
  const [kind, setKind] = useState<FB["kind"]>("idea");
  const [text, setText] = useState("");
  const past = live(s.feedback).sort((a, b) => b.updatedAt - a.updatedAt);
  const close = () => s.setUi({ feedbackOpen: false });
  const save = (toGithub: boolean) => {
    if (!text.trim()) return;
    s.upsert("feedback", { kind, text });
    if (toGithub) {
      const title = `[${kind}] ${text.split("\n")[0].slice(0, 70)}`;
      openUrl(
        `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(text + "\n\n_Sent from the app's feedback button._")}&labels=${kind === "bug" ? "bug" : "enhancement"}`,
      );
    }
    setText("");
    toast("Thanks, saved");
  };
  return (
    <Modal
      title="Suggestions & feedback"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={() => save(false)}>
            Save note
          </button>
          <button className="btn primary" onClick={() => save(true)}>
            Save & open GitHub issue
          </button>
        </>
      }
    >
      <Seg
        value={kind}
        onChange={setKind}
        options={[
          { value: "idea", label: "Idea" },
          { value: "bug", label: "Problem" },
          { value: "praise", label: "Works well" },
        ]}
      />
      <textarea
        className="input"
        rows={5}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What would make this better?"
      />
      {past.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Your earlier notes
          </div>
          <div className="list">
            {past.slice(0, 8).map((f) => (
              <div key={f.id} className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                <span>
                  <span className="tag">{f.kind}</span> {f.text}
                </span>
                <span className="faint mono" style={{ fontSize: 11 }}>
                  {format(f.updatedAt, "d MMM")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
