import { useEffect, useRef, useState, type ReactNode } from "react";
import { IMore, IX, ISliders } from "./Icons";

let docks = 0;
/** While a docked panel is open, the page makes room for it (CSS reads `body[data-dock]`). */
export function useDock(on?: boolean) {
  useEffect(() => {
    if (!on) return () => {};
    docks++;
    document.body.dataset.dock = "1";
    return () => {
      if (--docks === 0) delete document.body.dataset.dock;
    };
  }, [on]);
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
  dock,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  dock?: boolean; // on an unfolded phone (600 to 1100 px) sit beside the page as a side panel instead of covering it
}) {
  useDock(dock);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className={"modal-back" + (dock ? " dock" : "")} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"modal" + (wide ? " wide" : "")} role="dialog" aria-label={title}>
        <header>
          <h3>{title}</h3>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close">
            <IX />
          </button>
        </header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="switch" title={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  );
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Standard page header. `customise` renders an options panel the user can open on every page. */
export function PageHead({
  title,
  sub,
  actions,
  customise,
  open,
  setOpen,
}: {
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
  customise?: ReactNode;
  open?: boolean;
  setOpen?: (v: boolean) => void;
}) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
        <div className="spacer" />
        {actions}
        {customise && setOpen && (
          <button className="btn ghost" aria-pressed={open} onClick={() => setOpen(!open)}>
            <ISliders /> Customise
          </button>
        )}
      </div>
      {open && customise && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Customise this page · saved automatically</div>
          {customise}
        </div>
      )}
    </>
  );
}

/** A row of one-tap suggestions under a field ("Suggestions: Home PC · Work PC"). */
export function Suggest({
  label = "Suggestions",
  items,
}: {
  label?: string;
  items: { label: string; onUse: () => void; title?: string }[];
}) {
  if (!items.length) return null;
  return (
    <div className="row" role="group" aria-label={label} style={{ flexWrap: "wrap", gap: 6 }}>
      <span className="faint" style={{ fontSize: 12.5 }}>
        {label}:
      </span>
      {items.map((i) => (
        <button key={i.label} type="button" className="chip" title={i.title} onClick={i.onUse}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** A "…" button that opens a short menu. Esc or a click elsewhere closes it. */
export function Menu({ label, items }: { label: string; items: { label: string; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return () => {};
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <span className="menu-wrap" ref={ref}>
      <button className="btn sm ghost icon" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen(!open)}>
        <IMore size={16} />
      </button>
      {open && (
        <div role="menu" className="menu-pop">
          {items.map((i) => (
            <button
              key={i.label}
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setOpen(false);
                i.onClick();
              }}
            >
              {i.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
