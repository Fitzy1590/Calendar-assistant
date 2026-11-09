import { useEffect } from "react";
import { useStore } from "../store";
import { isAndroid, isBrowserMode, isTauri, openUrl } from "../lib/platform";
import { RELEASES_PAGE, useUpdates } from "../lib/updates";
import { entriesToShow, useWhatsNew, WHATS_NEW } from "../lib/whatsNew";
import { Modal } from "./ui";

const onWindows = () => !isAndroid() && (isTauri() || isBrowserMode());

/** Open the popup again from Settings: the newest release's notes. */
export const showWhatsNew = () => useWhatsNew.setState({ entries: WHATS_NEW.slice(0, 1) });

/** Runs from the top of the app (also during setup): a new install starts "up to date", so it never shows the popup. */
export function useRecordNewInstallVersion() {
  const current = useUpdates((u) => u.current);
  const onboarded = useStore((s) => s.settings.onboarded);
  const lastSeen = useStore((s) => s.settings.updates.lastSeenVersion);
  const updateSettings = useStore((s) => s.updateSettings);
  useEffect(() => {
    if (!onboarded && onWindows() && current !== "0.0.0" && lastSeen !== current) {
      updateSettings((s) => void (s.updates.lastSeenVersion = current));
    }
  }, [onboarded, lastSeen, current, updateSettings]);
}

/**
 * "What's new" window, shown once on the first start after an update (Windows). New installs never see it:
 * the version is recorded when setup is done. Closing it records the version, so it doesn't come back.
 */
export function WhatsNew() {
  const current = useUpdates((u) => u.current);
  const onboarded = useStore((s) => s.settings.onboarded);
  const lastSeen = useStore((s) => s.settings.updates.lastSeenVersion);
  const updateSettings = useStore((s) => s.updateSettings);
  const entries = useWhatsNew((w) => w.entries);
  const remember = () => updateSettings((s) => void (s.updates.lastSeenVersion = current));

  useEffect(() => {
    if (!onWindows() || current === "0.0.0") return;
    if (!onboarded) return; // useRecordNewInstallVersion handles new installs
    const due = entriesToShow(lastSeen, current);
    if (!due.length) return void (lastSeen !== current && remember());
    // a moment after start-up, so it doesn't land on top of the first screen drawing
    const t = setTimeout(() => useWhatsNew.setState({ entries: due }), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboarded, lastSeen, current]);

  if (!entries.length) return null;
  const close = () => (useWhatsNew.setState({ entries: [] }), remember());
  return (
    <Modal
      title={`What's new in version ${current}`}
      onClose={close}
      footer={
        <>
          <button className="btn ghost" onClick={() => openUrl(RELEASES_PAGE)}>
            Full release notes
          </button>
          <button className="btn primary" autoFocus onClick={close}>
            Got it
          </button>
        </>
      }
    >
      <div className="stack">
        {entries.map((e) => (
          <section key={e.version} className="stack" style={{ gap: 6 }}>
            <h4 style={{ margin: 0 }}>
              {e.title}{" "}
              <span className="muted mono" style={{ fontSize: 12 }}>
                v{e.version}
              </span>
            </h4>
            <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
              {e.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
