import { useState } from "react";
import { toast, useStore } from "../../store";
import { createRuleAndFolder } from "../../lib/mail/engine";
import type { MailMessage } from "../../lib/mail/types";
import { Field, Modal, Seg } from "../ui";

/** One step: pick or make a folder and add the rule that files this sender's mail there. */
export function FolderRuleDialog({ m, onClose, onDone }: { m: MailMessage; onClose: () => void; onDone: (folderId: string) => void }) {
  const folders = useStore((s) => s.settings.mail.folders);
  const domain = m.from.address.split("@")[1] ?? "";
  const suggested = (m.from.name || domain.split(".")[0] || "New folder").slice(0, 40);
  const [choice, setChoice] = useState<string>(folders[0]?.id ?? "new");
  const [name, setName] = useState(suggested);
  const [scope, setScope] = useState<"sender" | "domain">("sender");
  const [busy, setBusy] = useState(false);
  const isNew = choice === "new";
  const folderName = isNew ? name.trim() : (folders.find((f) => f.id === choice)?.name ?? "");

  const save = async () => {
    setBusy(true);
    try {
      const r = await createRuleAndFolder(m, folderName, scope);
      toast(`Done: ${r.rule.name}. Mail already here was filed too.`);
      onDone(r.folder.id);
      onClose();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Create rule + folder"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || !folderName} onClick={save}>
            Create rule
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="muted">
          Put mail from <b>{m.from.name || m.from.address}</b> in a folder automatically.
        </div>
        <Field label="Folder">
          <select className="input" value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="new">New folder…</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        {isNew && (
          <Field label="New folder name">
            <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
        )}
        <div className="row" style={{ flexWrap: "wrap" }}>
          <span className="muted">Apply to</span>
          <Seg
            value={scope}
            options={[
              { value: "sender", label: "This sender" },
              { value: "domain", label: `Everyone at @${domain}` },
            ]}
            onChange={setScope}
          />
        </div>
        <div className="faint" style={{ fontSize: 12.5 }}>
          Folders exist in this app only. Your mailbox isn't changed, and you can edit or delete the rule in Settings → Email.
        </div>
      </div>
    </Modal>
  );
}
