import { formatDistanceToNowStrict } from "date-fns";
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { useAsync } from "../lib/hooks";
import { getHeadlines, NEWS_REGIONS, NEWS_TOPICS, searchNews, type Headline } from "../lib/news";
import { openUrl } from "../lib/platform";
import { IExternal, ISearch } from "../components/Icons";
import { PageHead, Seg, Toggle } from "../components/ui";

export function News() {
  const s = useStore();
  const cfg = s.settings.pages.news;
  const cats = s.settings.newsCategories.length ? s.settings.newsCategories : ["TOP"];
  const tabs = [
    ...cats.map((c) => ({ id: c, label: NEWS_TOPICS.find((t) => t.id === c)?.label ?? c, q: false })),
    ...s.settings.newsKeywords.map((k) => ({ id: "q:" + k, label: k, q: true })),
  ];
  const [tab, setTab] = useState(tabs[0]?.id ?? "TOP");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [custom, setCustom] = useState(false);
  useEffect(() => {
    const h = (e: Event) => (setSearch((e as CustomEvent).detail), setQ((e as CustomEvent).detail));
    window.addEventListener("news-search", h);
    return () => window.removeEventListener("news-search", h);
  }, []);
  const region = s.settings.newsRegion;
  const data = useAsync<Headline[]>(
    () => (search ? searchNews(search, region) : tab.startsWith("q:") ? searchNews(tab.slice(2), region) : getHeadlines(tab, region)),
    [tab, search, region],
  );
  const toggleCat = (id: string) =>
    s.updateSettings((st) => {
      st.newsCategories = st.newsCategories.includes(id) ? st.newsCategories.filter((c) => c !== id) : [...st.newsCategories, id];
    });

  return (
    <>
      <PageHead
        title="News"
        sub="Today's headlines from Google News"
        open={custom}
        setOpen={setCustom}
        customise={
          <div className="stack">
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                Categories
              </div>
              <div className="row">
                {NEWS_TOPICS.map((t) => (
                  <button
                    key={t.id}
                    className="chip"
                    aria-pressed={s.settings.newsCategories.includes(t.id)}
                    onClick={() => toggleCat(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="row" style={{ gap: 24 }}>
              <label className="row">
                Edition{" "}
                <select
                  className="input"
                  style={{ width: 170 }}
                  value={region}
                  onChange={(e) => s.updateSettings((st) => void (st.newsRegion = e.target.value))}
                >
                  {NEWS_REGIONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="row">
                Layout{" "}
                <Seg
                  value={cfg.layout}
                  onChange={(v) => s.updateSettings((st) => void (st.pages.news.layout = v))}
                  options={[
                    { value: "list", label: "List" },
                    { value: "cards", label: "Cards" },
                  ]}
                />
              </label>
              <span className="row">
                <Toggle
                  checked={cfg.showImages}
                  onChange={(v) => s.updateSettings((st) => void (st.pages.news.showImages = v))}
                  label="Source names"
                />{" "}
                Show source & time
              </span>
            </div>
          </div>
        }
      />
      <div className="row" style={{ marginBottom: 14 }}>
        <form className="command" style={{ maxWidth: 360 }} onSubmit={(e) => (e.preventDefault(), setSearch(q))}>
          <ISearch />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search news" />
        </form>
        {search && (
          <>
            <button
              className="btn sm"
              onClick={() => s.updateSettings((st) => void (st.newsKeywords = [...new Set([...st.newsKeywords, search])]))}
            >
              Follow "{search}"
            </button>
            <button className="btn sm ghost" onClick={() => (setSearch(""), setQ(""))}>
              Clear
            </button>
          </>
        )}
      </div>
      {!search && (
        <div className="row" style={{ marginBottom: 16 }}>
          {tabs.map((t) => (
            <button key={t.id} className="chip" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
              {t.q && (
                <span
                  onClick={(e) => (
                    e.stopPropagation(),
                    s.updateSettings((st) => void (st.newsKeywords = st.newsKeywords.filter((k) => k !== t.label)))
                  )}
                  aria-label="Unfollow"
                  className="faint"
                >
                  ×
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {data.error && (
        <div className="alert">
          Couldn't load news ({data.error}). In a plain browser, Google News blocks direct requests; run the Windows/Android app, or set a
          sync server in Settings so it can relay.
        </div>
      )}
      {data.loading && !data.data && <div className="empty">Loading…</div>}
      <div className={cfg.layout === "cards" ? "news-cards" : "news-list list card"}>
        {(data.data ?? []).slice(0, 40).map((h) => (
          <div key={h.link} className="item">
            <a href={h.link} onClick={(e) => (e.preventDefault(), openUrl(h.link))}>
              {h.title} <IExternal size={12} />
            </a>
            {cfg.showImages !== false && (
              <div className="faint" style={{ fontSize: 12.5 }}>
                {h.source} · {formatDistanceToNowStrict(h.published)} ago
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
