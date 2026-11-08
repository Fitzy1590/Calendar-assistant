import { format, formatDistanceToNowStrict } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import type { CalEvent, ShoppingItem } from "../types";
import { live, toast, useStore } from "../store";
import {
  addToList,
  checkPrice,
  checkTrackedPrices,
  comparePrices,
  findStores,
  mapsSearchUrl,
  navigateUrl,
  pricesAvailable,
  RETAILERS,
  trend,
  whereAmI,
  type Here,
  type PriceHit,
  type Store,
} from "../lib/shopping";
import { openUrl } from "../lib/platform";
import { localIso, todayYmd } from "../lib/util";
import { EventEditor } from "../components/EventEditor";
import { ICal, ICart, IExternal, INavigate, IPhone, ISearch, ITasks, ITrash, ITrend } from "../components/Icons";
import { PageHead, Seg } from "../components/ui";

type Tab = "find" | "list" | "tracking";
const money = (n?: number, cur = "AUD") => (n == null ? "–" : `${cur === "AUD" ? "$" : cur + " "}${n.toFixed(2)}`);

/** The three follow-ups offered for anything you find: go now, put it in the calendar, or make it a task. */
function NextSteps({
  label,
  place,
  url,
  onCalendar,
  compact,
}: {
  label: string;
  place?: { lat?: number; lon?: number; name?: string; address?: string };
  url?: string;
  onCalendar: () => void;
  compact?: boolean;
}) {
  const s = useStore();
  return (
    <span className="row" style={{ gap: 4 }}>
      {place && (
        <button className="btn sm primary" onClick={() => openUrl(navigateUrl(place))} title="Start navigation in Google Maps">
          <INavigate size={14} /> Go now
        </button>
      )}
      {url && (
        <button className="btn sm" onClick={() => openUrl(url)} title="Open the product page">
          <IExternal size={14} /> {compact ? "" : "Open item"}
        </button>
      )}
      <button className="btn sm" onClick={onCalendar} title="Add a shopping trip to the calendar">
        <ICal size={14} /> {compact ? "" : "Calendar"}
      </button>
      <button
        className="btn sm"
        title="Add to tasks"
        onClick={() => (
          s.upsert("tasks", {
            title: label,
            due: todayYmd(),
            priority: "med",
            done: false,
            notes: [place?.address, url].filter(Boolean).join("\n"),
          }),
          toast("Added to tasks")
        )}
      >
        <ITasks size={14} /> {compact ? "" : "Task"}
      </button>
    </span>
  );
}

export function Shopping() {
  const [tab, setTab] = useState<Tab>("find");
  const [query, setQuery] = useState("");
  const items = live(useStore((s) => s.shopping));
  useEffect(() => {
    const h = (e: Event) => (setTab("find"), setQuery((e as CustomEvent).detail));
    window.addEventListener("shopping-search", h);
    return () => window.removeEventListener("shopping-search", h);
  }, []);
  const open = items.filter((i) => !i.done).length;
  const tracked = items.filter((i) => i.track).length;
  return (
    <>
      <PageHead
        title="Shopping"
        sub={`${open} on your list${tracked ? ` · tracking ${tracked} price${tracked > 1 ? "s" : ""}` : ""}`}
        actions={
          <Seg
            value={tab}
            onChange={setTab}
            options={[
              { value: "find", label: "Find" },
              { value: "list", label: `List${open ? ` (${open})` : ""}` },
              { value: "tracking", label: "Price tracking" },
            ]}
          />
        }
      />
      {tab === "find" && <Finder initial={query} key={query} />}
      {tab === "list" && <ListView onFind={(q) => (setQuery(q), setTab("find"))} />}
      {tab === "tracking" && <Tracking />}
    </>
  );
}

/* ------------------------------------------------------------------ find */

function Finder({ initial }: { initial: string }) {
  const s = useStore();
  const [q, setQ] = useState(initial);
  const [here, setHere] = useState<Here | null>(null);
  const [stores, setStores] = useState<Store[] | null>(null);
  const [prices, setPrices] = useState<PriceHit[] | null>(null);
  const [busy, setBusy] = useState<"" | "stores" | "prices">("");
  const [err, setErr] = useState("");
  const [trip, setTrip] = useState<Partial<CalEvent> | null>(null);
  const radius = s.settings.shopping.radiusKm;

  const run = async (term = q) => {
    if (!term.trim()) return;
    setErr("");
    setStores(null);
    setPrices(null);
    setBusy("stores");
    let pos: Here;
    let found: Store[] = [];
    try {
      pos = await whereAmI();
      setHere(pos);
    } catch (e) {
      setErr((e as Error).message);
      setBusy("");
      return;
    }
    try {
      found = await findStores(term, pos, radius);
      setStores(found);
    } catch {
      setStores([]);
      setErr("Couldn't reach the store directory (OpenStreetMap). Online comparison still works.");
    }
    if (pricesAvailable()) {
      setBusy("prices");
      try {
        setPrices(await comparePrices(term, found, pos));
      } catch (e) {
        setErr((e as Error).message);
      }
    }
    setBusy("");
  };
  useEffect(() => {
    if (initial) run(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const planTrip = (title: string, place?: { name?: string; address?: string }) =>
    setTrip({
      title,
      location: [place?.name, place?.address].filter(Boolean).join(", "),
      start: localIso(new Date(Date.now() + 3600e3)),
      end: localIso(new Date(Date.now() + 5400e3)),
    });
  const cheapest = prices?.[0];

  return (
    <div className="stack">
      <form className="row card" style={{ flexWrap: "nowrap" }} onSubmit={(e) => (e.preventDefault(), run())}>
        <ISearch />
        <input
          className="input"
          style={{ border: 0, background: "none", fontSize: 16 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="What do you need? e.g. white paint 4L, printer ink, garden hose"
          aria-label="What do you need?"
        />
        <select
          className="input"
          style={{ width: 110 }}
          value={radius}
          onChange={(e) => s.updateSettings((st) => void (st.shopping.radiusKm = +e.target.value))}
          aria-label="Search radius"
        >
          {[2, 5, 10, 20, 40].map((r) => (
            <option key={r} value={r}>
              {r} km
            </option>
          ))}
        </select>
        <button className="btn primary" disabled={!q.trim() || !!busy}>
          {busy ? "Searching…" : "Search"}
        </button>
      </form>
      {err && <div className="alert">{err}</div>}
      {here && (
        <div className="faint" style={{ fontSize: 12.5 }}>
          Near {here.label}
          {!here.precise && " (allow location access for results around where you are now)"}
        </div>
      )}

      {q.trim() && (
        <section className="card">
          <h2>
            Compare online <span className="spacer" />
            {!pricesAvailable() && (
              <span className="faint" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
                Turn on Claude in Settings to fetch live prices here
              </span>
            )}
          </h2>
          {busy === "prices" && <div className="muted">Checking retailers' websites for current prices… this can take up to a minute.</div>}
          {prices && prices.length > 0 && (
            <div className="list" style={{ marginBottom: 10 }}>
              {prices.map((p, i) => (
                <div key={p.url + i} className="row" style={{ justifyContent: "space-between" }}>
                  <span style={{ minWidth: 0, flex: "1 1 260px" }}>
                    <b className="mono" style={{ fontSize: 16 }}>
                      {money(p.price, p.currency)}
                    </b>
                    {i === 0 && (
                      <span className="tag" style={{ color: "var(--ok)", marginLeft: 6 }}>
                        cheapest
                      </span>
                    )}{" "}
                    <b>{p.retailer}</b>{" "}
                    <span className="tag">{p.where === "store" ? "in store" : p.where === "both" ? "in store & online" : "online"}</span>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {p.product}
                      {p.note ? ` · ${p.note}` : ""}
                    </div>
                  </span>
                  <span className="row" style={{ gap: 4 }}>
                    <button className="btn sm" onClick={() => openUrl(p.url)}>
                      <IExternal size={14} /> Open item
                    </button>
                    <button
                      className="btn sm"
                      onClick={() => (
                        addToList({
                          name: q,
                          price: p.price,
                          currency: p.currency,
                          url: p.url,
                          store: { name: p.retailer },
                          track: { url: p.url, history: [{ at: Date.now(), price: p.price, currency: p.currency }] },
                        }),
                        toast("Added to your list and tracking the price")
                      )}
                    >
                      <ICart size={14} /> Add & track
                    </button>
                    <button className="btn sm" title="Add to calendar" onClick={() => planTrip(`Buy ${q} at ${p.retailer}`)}>
                      <ICal size={14} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
          {prices && !prices.length && (
            <div className="muted">
              No prices could be confirmed on retailers' pages. Try a more specific name (brand, size), or use the links below.
            </div>
          )}
          <div className="row">
            {Object.entries(RETAILERS)
              .filter(([n]) => n === "Google Shopping" || s.settings.shopping.onlineStores.includes(n))
              .map(([name, fn]) => (
                <button key={name} className="btn sm" onClick={() => openUrl(fn(q))}>
                  {name} <IExternal size={12} />
                </button>
              ))}
          </div>
          {cheapest && (
            <div className="faint" style={{ fontSize: 12 }}>
              Prices come from each retailer's site today and can change; open the item to confirm before you buy.
            </div>
          )}
        </section>
      )}

      {stores && (
        <section className="card">
          <h2>
            Stores nearby <span className="faint">{stores.length}</span>
          </h2>
          <div className="list">
            {stores.map((st) => (
              <div key={st.id} className="row" style={{ justifyContent: "space-between" }}>
                <span style={{ minWidth: 0, flex: "1 1 260px" }}>
                  <b>{st.name}</b>{" "}
                  <span className="mono faint" style={{ fontSize: 12 }}>
                    {st.distanceKm.toFixed(1)} km
                  </span>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    {[st.kind, st.address, st.hours].filter(Boolean).join(" · ")}
                  </div>
                </span>
                <span className="row" style={{ gap: 4 }}>
                  {st.phone && (
                    <button className="btn sm ghost icon" onClick={() => openUrl(`tel:${st.phone}`)} aria-label={`Call ${st.name}`}>
                      <IPhone size={14} />
                    </button>
                  )}
                  {st.website && (
                    <button
                      className="btn sm ghost"
                      onClick={() =>
                        openUrl(
                          RETAILERS[
                            Object.keys(RETAILERS).find((r) => st.name.toLowerCase().includes(r.toLowerCase().split(" ")[0])) ?? ""
                          ]?.(q) ?? st.website!,
                        )
                      }
                    >
                      Website
                    </button>
                  )}
                  <button
                    className="btn sm ghost"
                    title="Add to shopping list"
                    onClick={() => (
                      addToList({ name: q, store: { name: st.name, address: st.address, lat: st.lat, lon: st.lon, website: st.website } }),
                      toast("Added to your shopping list")
                    )}
                  >
                    <ICart size={14} />
                  </button>
                  <NextSteps
                    compact
                    label={`Buy ${q} at ${st.name}`}
                    place={st}
                    onCalendar={() => planTrip(`Buy ${q} at ${st.name}`, st)}
                  />
                </span>
              </div>
            ))}
            {!stores.length && (
              <div className="empty">
                No matching shops within {radius} km on OpenStreetMap. Try a wider radius, or{" "}
                <button className="btn sm" onClick={() => openUrl(mapsSearchUrl(`${q} near me`))}>
                  search Google Maps
                </button>
              </div>
            )}
          </div>
          <div className="faint" style={{ fontSize: 12 }}>
            Store locations from OpenStreetMap. Check opening hours before you go.
          </div>
        </section>
      )}
      {trip && <EventEditor initial={trip} onClose={() => setTrip(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ list */

function ListView({ onFind }: { onFind: (q: string) => void }) {
  const s = useStore();
  const [name, setName] = useState("");
  const [trip, setTrip] = useState<Partial<CalEvent> | null>(null);
  const items = live(s.shopping).sort((a, b) => Number(a.done) - Number(b.done) || a.order - b.order);
  const byStore = useMemo(() => {
    const m = new Map<string, ShoppingItem[]>();
    for (const i of items.filter((x) => !x.done)) m.set(i.store?.name ?? "Anywhere", [...(m.get(i.store?.name ?? "Anywhere") ?? []), i]);
    return [...m];
  }, [s.shopping]);
  const total = items.filter((i) => !i.done && i.price).reduce((n, i) => n + (i.price ?? 0), 0);
  return (
    <div className="stack">
      <form
        className="row card"
        style={{ flexWrap: "nowrap" }}
        onSubmit={(e) => (e.preventDefault(), name.trim() && (addToList({ name: name.trim() }), setName("")))}
      >
        <ICart />
        <input
          className="input"
          style={{ border: 0, background: "none" }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='Add an item, e.g. "Paint roller" (or say “add milk to my shopping list”)'
          aria-label="Add an item"
        />
        <button className="btn primary">Add</button>
      </form>
      {total > 0 && (
        <div className="muted">
          Known prices total <b className="mono">{money(total)}</b>
        </div>
      )}
      {byStore.map(([store, list]) => {
        const first = list[0].store;
        return (
          <section key={store} className="card">
            <h2>
              {store} <span className="faint">{list.length}</span>
              <span className="spacer" />
              {first?.name && (
                <NextSteps
                  compact
                  label={`Shopping at ${store}: ${list.map((i) => i.name).join(", ")}`}
                  place={first.lat != null ? first : undefined}
                  onCalendar={() =>
                    setTrip({
                      title: `Shopping at ${store}`,
                      notes: list.map((i) => `[ ] ${i.name}`).join("\n"),
                      location: [first.name, first.address].filter(Boolean).join(", "),
                      start: localIso(new Date(Date.now() + 3600e3)),
                      end: localIso(new Date(Date.now() + 5400e3)),
                    })
                  }
                />
              )}
            </h2>
            <div className="list">
              {list.map((i) => (
                <ItemRow key={i.id} i={i} onFind={onFind} />
              ))}
            </div>
          </section>
        );
      })}
      {items.some((i) => i.done) && (
        <section className="card">
          <h2>
            Bought <span className="spacer" />
            <button className="btn sm ghost" onClick={() => items.filter((i) => i.done).forEach((i) => s.remove("shopping", i.id))}>
              Clear
            </button>
          </h2>
          <div className="list">
            {items
              .filter((i) => i.done)
              .map((i) => (
                <ItemRow key={i.id} i={i} onFind={onFind} />
              ))}
          </div>
        </section>
      )}
      {!items.length && <div className="empty">Your list is empty. Add things here, from Find, or by voice.</div>}
      {trip && <EventEditor initial={trip} onClose={() => setTrip(null)} />}
    </div>
  );
}

function ItemRow({ i, onFind }: { i: ShoppingItem; onFind: (q: string) => void }) {
  const s = useStore();
  const [trackUrl, setTrackUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const startTracking = async () => {
    const url = trackUrl.trim();
    if (!/^https?:\/\//.test(url)) return toast("Paste the product page link");
    try {
      const point = await checkPrice({ ...i, track: { url, history: [] } });
      s.upsert("shopping", {
        id: i.id,
        url,
        price: point.price,
        currency: point.currency,
        track: { url, history: [point], lastChecked: Date.now() },
      });
      toast(`Tracking: now ${money(point.price, point.currency)}`);
    } catch (e) {
      s.upsert("shopping", { id: i.id, url, track: { url, history: [], lastChecked: Date.now(), lastError: (e as Error).message } });
      toast((e as Error).message);
    }
    setAdding(false);
  };
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="task-row">
        <button
          className={"check" + (i.done ? " on" : "")}
          onClick={() => s.upsert("shopping", { id: i.id, done: !i.done })}
          aria-label={i.done ? "Mark not bought" : "Mark bought"}
        />
        <span className={i.done ? "t done" : "t"}>
          {i.name}
          {i.qty ? ` × ${i.qty}` : ""}{" "}
          {i.price != null && (
            <span className="mono muted" style={{ fontSize: 12.5 }}>
              {money(i.price, i.currency)}
            </span>
          )}
          {i.track && (
            <span className="tag" style={{ marginLeft: 6 }}>
              tracking
            </span>
          )}
        </span>
        <span className="row" style={{ gap: 2 }}>
          {!i.done && (
            <button className="btn ghost sm" onClick={() => onFind(i.name)} title="Find nearby and compare prices">
              <ISearch size={14} /> Find
            </button>
          )}
          {i.url && (
            <button className="btn ghost sm icon" onClick={() => openUrl(i.url!)} aria-label="Open item">
              <IExternal size={14} />
            </button>
          )}
          {!i.track && !i.done && (
            <button className="btn ghost sm" onClick={() => setAdding(!adding)}>
              <ITrend size={14} /> Track
            </button>
          )}
          <button className="btn ghost sm icon" onClick={() => s.remove("shopping", i.id)} aria-label="Delete">
            <ITrash size={14} />
          </button>
        </span>
      </div>
      {adding && (
        <form className="row" onSubmit={(e) => (e.preventDefault(), startTracking())} style={{ paddingLeft: 32 }}>
          <input
            className="input"
            style={{ flex: "1 1 260px" }}
            value={trackUrl}
            onChange={(e) => setTrackUrl(e.target.value)}
            placeholder="Paste the product page link to track its price"
            aria-label="Product link"
            autoFocus
          />
          <button className="btn sm primary">Start tracking</button>
        </form>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ tracking */

function Spark({ points }: { points: number[] }) {
  if (points.length < 2)
    return (
      <span className="faint" style={{ fontSize: 12 }}>
        Trend appears after the next check
      </span>
    );
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const d = points.map((p, i) => `${(i / (points.length - 1)) * 100},${28 - ((p - lo) / Math.max(hi - lo, 0.01)) * 24}`).join(" ");
  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      style={{ width: "100%", height: 34, color: "var(--accent)" }}
      role="img"
      aria-label={`Price history from ${money(points[0])} to ${money(points[points.length - 1])}`}
    >
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Tracking() {
  const s = useStore();
  const [busy, setBusy] = useState(false);
  const tracked = live(s.shopping).filter((i) => i.track);
  const checkAll = async () => {
    setBusy(true);
    const notices = await checkTrackedPrices(true);
    setBusy(false);
    toast(notices[0] ?? "Prices checked");
  };
  return (
    <div className="stack">
      <div className="row">
        <button className="btn" onClick={checkAll} disabled={busy || !tracked.length}>
          {busy ? "Checking…" : "Check all prices now"}
        </button>
        <span className="muted" style={{ fontSize: 13 }}>
          Prices are checked once a day while the app is running{s.settings.shopping.notifyDrops ? ", and you're told when one drops" : ""}.
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--gap)" }}>
        {tracked.map((i) => {
          const t = trend(i.track!.history);
          const cur = i.currency ?? "AUD";
          const down = (t.changeFromPrev ?? 0) < 0;
          const up = (t.changeFromPrev ?? 0) > 0;
          return (
            <section key={i.id} className="card stack" style={{ gap: 8 }}>
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                <b style={{ minWidth: 0 }}>{i.name}</b>
                <span className="mono" style={{ fontSize: 20 }}>
                  {money(t.current, cur)}
                </span>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {(down || up) && (
                  <span className="tag" style={{ color: down ? "var(--ok)" : "var(--bad)" }}>
                    <ITrend size={12} down={down} /> {down ? "down" : "up"} {money(Math.abs(t.changeFromPrev!), cur)}
                  </span>
                )}
                {t.lowest != null && <span className="tag">lowest {money(t.lowest, cur)}</span>}
                {t.changeFromFirst ? (
                  <span className="tag">
                    {t.changeFromFirst < 0 ? "−" : "+"}
                    {money(Math.abs(t.changeFromFirst), cur)} since added
                  </span>
                ) : null}
              </div>
              <Spark points={i.track!.history.map((h) => h.price)} />
              <div className="faint" style={{ fontSize: 12 }}>
                {i.store?.name ? `${i.store.name} · ` : ""}
                {i.track!.lastChecked ? `checked ${formatDistanceToNowStrict(i.track!.lastChecked)} ago` : "not checked yet"}
                {i.track!.history.length > 0 && ` · since ${format(i.track!.history[0].at, "d MMM")}`}
              </div>
              {i.track!.lastError && (
                <div className="alert" style={{ fontSize: 12.5 }}>
                  {i.track!.lastError}
                </div>
              )}
              <label className="row" style={{ fontSize: 13 }}>
                Tell me under $
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  style={{ width: 100 }}
                  value={i.track!.targetPrice ?? ""}
                  onChange={(e) =>
                    s.upsert("shopping", { id: i.id, track: { ...i.track!, targetPrice: e.target.value ? +e.target.value : undefined } })
                  }
                  aria-label="Target price"
                />
              </label>
              <div className="row" style={{ gap: 4 }}>
                <button className="btn sm" onClick={() => openUrl(i.track!.url)}>
                  <IExternal size={14} /> Open item
                </button>
                <button
                  className="btn sm"
                  onClick={() => (
                    s.upsert("tasks", { title: `Buy ${i.name}`, due: todayYmd(), priority: "med", done: false, notes: i.track!.url }),
                    toast("Added to tasks")
                  )}
                >
                  <ITasks size={14} /> Task
                </button>
                <button className="btn sm ghost" onClick={() => s.upsert("shopping", { id: i.id, track: undefined })}>
                  Stop tracking
                </button>
              </div>
            </section>
          );
        })}
      </div>
      {!tracked.length && (
        <div className="empty">
          Nothing tracked yet. In Find, choose “Add & track” on a price, or paste a product link on any list item.
        </div>
      )}
    </div>
  );
}
