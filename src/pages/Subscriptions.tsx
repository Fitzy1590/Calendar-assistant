import { format } from "date-fns";
import { useRef, useState } from "react";
import { toast, useStore } from "../store";
import { parseStatement } from "../lib/bankStatement";
import { openUrl } from "../lib/platform";
import {
  byCategory,
  cancelGuide,
  chargedAfterCancel,
  detectSubscriptions,
  mergeDetected,
  totals,
  type Cadence,
  type Subscription,
} from "../lib/subscriptions";
import { fromYmd, todayYmd } from "../lib/util";
import { Modal, PageHead } from "../components/ui";

const money = (n: number) => `$${n.toFixed(2)}`;
const EVERY: Record<Cadence, string> = {
  weekly: "every week",
  fortnightly: "every fortnight",
  monthly: "every month",
  quarterly: "every 3 months",
  yearly: "every year",
};

/** Scan a bank statement for repeating charges, group them, and walk through cancelling the ones you don't want. */
export function Subscriptions() {
  const s = useStore();
  const { items, cancelled, importedAt } = s.settings.subscriptions;
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState<Subscription | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const set = (fn: (st: typeof s.settings.subscriptions) => void) => s.updateSettings((st) => void fn(st.subscriptions));

  const load = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      if (f.size > 20 * 1024 * 1024) throw new Error("That file is too big for a statement (over 20 MB).");
      const txns = parseStatement(await f.text(), f.name);
      if (!txns.length)
        throw new Error("I couldn't read any transactions from that file. Try the CSV, OFX or QIF download from your bank's website.");
      const found = detectSubscriptions(txns);
      set((x) => {
        x.items = mergeDetected(x.items, found);
        x.importedAt = todayYmd();
      });
      const again = chargedAfterCancel(found, s.settings.subscriptions.cancelled);
      toast(
        `Read ${txns.length} transactions and found ${found.length} subscription${found.length === 1 ? "" : "s"}.${again.length ? ` ${again.length} you cancelled were charged again.` : ""}`,
      );
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };

  const live = items.filter((i) => !i.hidden);
  const t = totals(items);
  const groups = byCategory(items);
  const again = chargedAfterCancel(live, cancelled);
  const hidden = items.filter((i) => i.hidden);

  return (
    <>
      <PageHead
        title="Subscriptions"
        sub="Find what you pay for every week, month or year, and cancel what you don't use"
        actions={
          <button className="btn primary" disabled={busy} onClick={() => file.current?.click()}>
            {busy ? "Reading…" : items.length ? "Import another statement" : "Import a bank statement"}
          </button>
        }
      />
      <input
        ref={file}
        type="file"
        hidden
        accept=".csv,.ofx,.qfx,.qif,.txt"
        onChange={(e) => void load(e.target.files?.[0])}
        aria-label="Bank statement file"
      />

      {again.length > 0 && (
        <div className="alert bad" role="alert" style={{ marginBottom: 12 }}>
          <b>Charged again after you cancelled:</b> {again.map((a) => a.name).join(", ")}. Check your cancellation went through (see “How to
          cancel”).
        </div>
      )}

      {!items.length ? (
        <div className="card stack">
          <b>Import a statement and I'll find the subscriptions</b>
          <div className="muted">
            Download your last few months from your bank's website or app as <b>CSV</b>, <b>OFX/QFX</b> or <b>QIF</b>, then press Import.
            Three months or more works best, so repeating charges can be spotted.
          </div>
          <div className="faint" style={{ fontSize: 12.5 }}>
            The file is read on this PC and never uploaded. Only the list of subscriptions found is kept; your transactions are not saved.
          </div>
          <div>
            <button className="btn primary" disabled={busy} onClick={() => file.current?.click()}>
              Choose a statement file
            </button>
          </div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
            <Stat label="Per month" value={money(t.monthly)} />
            <Stat label="Per year" value={money(t.yearly)} />
            <Stat label="Subscriptions" value={String(t.count)} />
            {importedAt && (
              <span className="faint" style={{ alignSelf: "center" }}>
                From the statement you imported on {format(fromYmd(importedAt), "d MMM yyyy")}
              </span>
            )}
          </div>

          {groups.map((g) => (
            <section key={g.category} className="card stack" style={{ gap: 4 }} aria-label={g.category}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h2 style={{ margin: 0 }}>{g.category}</h2>
                <span className="faint mono">{money(g.monthly)} / month</span>
              </div>
              {g.items.map((i) => (
                <SubRow
                  key={i.id}
                  sub={i}
                  cancelledOn={cancelled[i.id]}
                  onCancel={() => setGuide(i)}
                  onHide={() => set((x) => void (x.items = x.items.map((y) => (y.id === i.id ? { ...y, hidden: true } : y))))}
                />
              ))}
            </section>
          ))}

          {hidden.length > 0 && (
            <div>
              <button className="btn sm ghost" onClick={() => setShowHidden((v) => !v)}>
                {showHidden ? "Hide" : "Show"} {hidden.length} marked “not a subscription”
              </button>
              {showHidden && (
                <div className="stack" style={{ gap: 4, marginTop: 6 }}>
                  {hidden.map((h) => (
                    <div key={h.id} className="row" style={{ justifyContent: "space-between" }}>
                      <span>
                        {h.name} <span className="faint">{money(h.amount)}</span>
                      </span>
                      <button
                        className="btn sm"
                        onClick={() => set((x) => void (x.items = x.items.map((y) => (y.id === h.id ? { ...y, hidden: undefined } : y))))}
                      >
                        Put back
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <button className="btn sm ghost" onClick={() => set((x) => ((x.items = []), (x.cancelled = {}), (x.importedAt = undefined)))}>
              Clear this list
            </button>
          </div>
        </div>
      )}

      {guide && (
        <GuideDialog
          sub={guide}
          cancelledOn={cancelled[guide.id]}
          onClose={() => setGuide(null)}
          onDone={() => {
            set((x) => void (x.cancelled[guide.id] = todayYmd()));
            toast(`Marked ${guide.name} as cancelled. I'll warn you if it's charged again.`);
            setGuide(null);
          }}
        />
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ padding: "10px 16px", minWidth: 140 }}>
      <div className="eyebrow">{label}</div>
      <div style={{ font: "600 26px var(--font-display)" }}>{value}</div>
    </div>
  );
}

function SubRow({
  sub,
  cancelledOn,
  onCancel,
  onHide,
}: {
  sub: Subscription;
  cancelledOn?: string;
  onCancel: () => void;
  onHide: () => void;
}) {
  return (
    <div className="sub-row">
      <div style={{ minWidth: 0 }}>
        <b>{sub.name}</b> {sub.via && <span className="tag">via {sub.via}</span>}{" "}
        {cancelledOn && <span className="tag">cancelled {format(fromYmd(cancelledOn), "d MMM")}</span>}
        <div className="faint" style={{ fontSize: 12.5 }}>
          {money(sub.amount)} {EVERY[sub.cadence]} · next about {format(fromYmd(sub.nextDate), "d MMM")} · seen {sub.count} time
          {sub.count === 1 ? "" : "s"}
        </div>
        {sub.priceChange && (
          <div style={{ color: "var(--warn)", fontSize: 12.5 }}>
            Price changed from {money(sub.priceChange.from)} to {money(sub.priceChange.to)}
          </div>
        )}
      </div>
      <div className="row" style={{ flex: "none" }}>
        <span className="mono muted">{money(sub.monthly)}/mo</span>
        <button className="btn sm" onClick={onCancel}>
          How to cancel
        </button>
        <button className="btn sm ghost" onClick={onHide} aria-label={`${sub.name} is not a subscription`}>
          Not one
        </button>
      </div>
    </div>
  );
}

function GuideDialog({
  sub,
  cancelledOn,
  onClose,
  onDone,
}: {
  sub: Subscription;
  cancelledOn?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const g = cancelGuide(sub);
  return (
    <Modal
      title={g.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" onClick={onDone}>
            {cancelledOn ? "Cancelled again" : "I've cancelled it"}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="muted">
          {sub.name} costs you {money(sub.amount)} {EVERY[sub.cadence]}, about {money(sub.yearly)} a year.
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
          {g.steps.map((st) => (
            <li key={st}>{st}</li>
          ))}
        </ol>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {g.links.map((l, i) => (
            <button key={l.url} className={"btn sm" + (i === 0 ? " primary" : "")} onClick={() => void openUrl(l.url)}>
              {l.label}
            </button>
          ))}
        </div>
        <div className="faint" style={{ fontSize: 12.5 }}>
          Links open the company's own page in your browser. This app never signs in to them or cancels anything for you.
        </div>
      </div>
    </Modal>
  );
}
