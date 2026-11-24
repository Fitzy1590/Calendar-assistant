import { formatDistanceToNowStrict } from "date-fns";
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { useAsync } from "../lib/hooks";
import { getHeadlines, NEWS_REGIONS, NEWS_TOPICS, searchNews, type Headline } from "../lib/news";
import { openUrl } from "../lib/platform";
import { IExternal, ISearch } from "../components/Icons";
import { PageHead, Seg } from "../components/ui";

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
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const h = (e: Event) => (setSearch((e as CustomEvent).detail), setQ((e as CustomEvent).detail), setSearchOpen(true));
    window.addEventListener("news-search", h);
    return () => window.removeEventListener("news-search", h);
  }, []);
  const region = s.settings.newsRegion;
  const data = useAsync<Headline[]>(
    () => (search ? searchNews(search, region) : tab.startsWith("q:") ? searchNews(tab.slice(2), region) : getHeadlines(tab, region)),
    [tab, search, region],
  );
  const shown = (data.data ?? []).slice(0, 40);
  const meta = (h: Headline) => `${h.source} · ${formatDistanceToNowStrict(h.published)} ago`;
  const row = (h: Headline) => (
    <div key={h.link} className="item">
      <a href={h.link} onClick={(e) => (e.preventDefault(), openUrl(h.link))}>
        {h.title} <IExternal size={12} />
      </a>
      <div className="faint" style={{ fontSize: 12.5 }}>
        {meta(h)}
      </div>
    </div>
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
        actions={
          <button
            className="btn ghost icon"
            aria-label="Search news"
            aria-pressed={searchOpen || !!search}
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <ISearch />
          </button>
        }
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
                    { value: "list", label: "Lead and list" },
                    { value: "cards", label: "Cards" },
                  ]}
                />
              </label>
            </div>
          </div>
        }
      />
      {(searchOpen || search) && (
        <div className="row" style={{ marginBottom: 14 }}>
          <form className="command" style={{ maxWidth: 360 }} onSubmit={(e) => (e.preventDefault(), setSearch(q))}>
            <ISearch />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search news"
              aria-label="Search news"
              onKeyDown={(e) => e.key === "Escape" && (setSearch(""), setQ(""), setSearchOpen(false))}
            />
          </form>
          {search && (
            <>
              <button
                className="btn sm"
                onClick={() => s.updateSettings((st) => void (st.newsKeywords = [...new Set([...st.newsKeywords, search])]))}
              >
                Follow "{search}"
              </button>
              <button className="btn sm ghost" onClick={() => (setSearch(""), setQ(""), setSearchOpen(false))}>
                Clear
              </button>
            </>
          )}
        </div>
      )}
      {!search && (
        <div className="topic-tabs" role="tablist" aria-label="Topics">
          {tabs.map((t) => (
            <span key={t.id} className="topic-tab-wrap">
              <button role="tab" aria-selected={tab === t.id} className="topic-tab" onClick={() => setTab(t.id)}>
                {t.label}
              </button>
              {t.q && (
                <button
                  className="topic-unfollow"
                  aria-label={`Unfollow ${t.label}`}
                  onClick={() => s.updateSettings((st) => void (st.newsKeywords = st.newsKeywords.filter((k) => k !== t.label)))}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          <button className="topic-tab" aria-label="Add or remove topics" title="Add or remove topics" onClick={() => setCustom(true)}>
            +
          </button>
        </div>
      )}
      {data.error && (
        <div className="alert">
          Couldn't load news ({data.error}). In a plain browser, Google News blocks direct requests; run the Windows/Android app, or set a
          sync server in Settings so it can relay.
        </div>
      )}
      {data.loading && !data.data && <div className="empty">Loading…</div>}
      {cfg.layout === "cards" ? (
        <div className="news-cards">{shown.map(row)}</div>
      ) : (
        <>
          {shown[0] && (
            <div className="news-lead card">
              <a href={shown[0].link} onClick={(e) => (e.preventDefault(), openUrl(shown[0].link))}>
                {shown[0].title} <IExternal size={14} />
              </a>
              <div className="faint">{meta(shown[0])}</div>
            </div>
          )}
          {shown.length > 1 && <div className="news-list list card">{shown.slice(1).map(row)}</div>}
        </>
      )}
    </>
  );
}
