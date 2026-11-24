import { useState } from "react";
import { guideDoc, gmailSteps, googleSteps, microsoftSteps } from "../lib/setupGuides";
import { isAndroid, openUrl } from "../lib/platform";
import { Modal } from "./ui";

/** "Step-by-step setup guide": plain instructions with buttons that open the exact Google or Microsoft pages. */
export function SetupGuideButton({ kind, label = "Step-by-step setup guide" }: { kind: "google" | "microsoft" | "gmail"; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && <SetupGuide kind={kind} onClose={() => setOpen(false)} />}
    </>
  );
}

function SetupGuide({ kind, onClose }: { kind: "google" | "microsoft" | "gmail"; onClose: () => void }) {
  const [target, setTarget] = useState<"windows" | "android">(isAndroid() ? "android" : "windows");
  const steps = kind === "google" ? googleSteps(target) : kind === "gmail" ? gmailSteps() : microsoftSteps();
  return (
    <Modal
      title={
        kind === "google"
          ? "Set up Google sync, step by step"
          : kind === "gmail"
            ? "Connect Gmail, step by step"
            : "Connect Outlook, step by step"
      }
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={() => openUrl(guideDoc(kind))}>
            Open the written guide
          </button>
          <button className="btn primary" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="faint" style={{ fontSize: 12.5 }}>
          Free, about 10 minutes, and you only do it once.{" "}
          {kind === "microsoft" ? "You'll need your Outlook or Hotmail account." : "You'll need a Google account."}
        </div>
        {kind === "google" && (
          <div className="seg" role="group" aria-label="Which device are you setting up?">
            <button aria-pressed={target === "windows"} onClick={() => setTarget("windows")}>
              On my PC (Windows)
            </button>
            <button aria-pressed={target === "android"} onClick={() => setTarget("android")}>
              On my phone (Android)
            </button>
          </div>
        )}
        <ol className="guide">
          {steps.map((s, i) => (
            <li key={`${target}-${i}`}>
              <b>{s.title}</b>
              <p style={{ margin: "4px 0 8px" }}>{s.body}</p>
              {s.links && (
                <div className="row" style={{ flexWrap: "wrap" }}>
                  {s.links.map((l) => (
                    <button key={l.url} className="btn sm" onClick={() => openUrl(l.url)}>
                      {l.label}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </Modal>
  );
}
