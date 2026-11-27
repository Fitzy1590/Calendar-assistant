import { useState } from "react";
import { FinanceDashboard } from "../components/finance/FinanceDashboard";
import { useFinanceData } from "../components/finance/useFinanceData";
import { Modal, PageHead } from "../components/ui";
import { eraseVault, vaultAvailable } from "../lib/finance/vault";
import { toast, useStore } from "../store";

/** Cash flow, subscriptions and budgets. Stored only in an encrypted file on this PC; nothing here is synced, backed up or sent. */
export function Finance() {
  const s = useStore();
  const enabled = s.settings.finance.enabled;
  const data = useFinanceData(enabled && vaultAvailable());
  const [erase, setErase] = useState(false);

  if (!vaultAvailable())
    return (
      <>
        <PageHead title="Finance" />
        <div className="card stack">
          <b>Finance needs the Windows app</b>
          <div className="muted">
            Your finance data is kept in an encrypted file protected by Windows, so it isn't available in the browser or on the phone.
          </div>
        </div>
      </>
    );

  if (!enabled)
    return (
      <>
        <PageHead title="Finance" sub="Cash flow, subscriptions and budgets" />
        <div className="card stack">
          <b>Turn on Finance</b>
          <div className="muted">
            This creates an encrypted file on this PC. Its key is kept in Windows Credential Manager. The data never leaves this PC: it is
            not synced, not in backups, and never sent to Claude, Gemini or any server.
          </div>
          <div>
            <button className="btn primary" onClick={() => s.updateSettings((st) => void (st.finance.enabled = true))}>
              Turn on Finance
            </button>
          </div>
        </div>
      </>
    );

  return (
    <>
      <PageHead
        title="Finance"
        sub="Stored encrypted on this PC only"
        actions={
          data.status === "ready" && (
            <button className="btn ghost danger" onClick={() => setErase(true)}>
              Erase finance data
            </button>
          )
        }
      />
      {data.status === "loading" && <div className="muted">Opening your encrypted finance file…</div>}
      {data.status === "locked" && (
        <div className="card stack" role="alert">
          <b>Finance data can't be opened on this device</b>
          <div className="muted">{data.error}</div>
          <div className="muted">Nothing was changed. If you no longer need that file you can erase it and start again.</div>
          <div>
            <button className="btn danger" onClick={() => setErase(true)}>
              Erase and start again
            </button>
          </div>
        </div>
      )}
      {data.status === "error" && (
        <div className="alert bad" role="alert">
          Finance couldn't start: {data.error}
        </div>
      )}
      {data.status === "ready" && <FinanceDashboard data={data} />}
      {erase && (
        <Modal
          title="Erase finance data?"
          onClose={() => setErase(false)}
          footer={
            <>
              <button className="btn" onClick={() => setErase(false)}>
                Keep it
              </button>
              <button
                className="btn danger"
                onClick={() =>
                  void eraseVault()
                    .then(() => {
                      setErase(false);
                      toast("Finance data erased.");
                      void data.reload();
                    })
                    .catch((e) => toast(String(e)))
                }
              >
                Erase for good
              </button>
            </>
          }
        >
          <div>
            This deletes the encrypted file and its key from this PC: accounts, bills, subscriptions and budgets. It can't be undone.
          </div>
        </Modal>
      )}
    </>
  );
}
