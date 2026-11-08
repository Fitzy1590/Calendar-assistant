import { cached, httpGet } from "./http";

/** Google News RSS. No key; needs the native HTTP plugin or the sync-server proxy because of CORS. */

export const NEWS_TOPICS = [
  { id: "TOP", label: "Top stories" },
  { id: "WORLD", label: "World" },
  { id: "NATION", label: "National" },
  { id: "BUSINESS", label: "Business" },
  { id: "TECHNOLOGY", label: "Technology" },
  { id: "SCIENCE", label: "Science" },
  { id: "HEALTH", label: "Health" },
  { id: "SPORTS", label: "Sport" },
  { id: "ENTERTAINMENT", label: "Entertainment" },
] as const;

export const NEWS_REGIONS = [
  { id: "AU:en", label: "Australia" },
  { id: "NZ:en", label: "New Zealand" },
  { id: "GB:en", label: "United Kingdom" },
  { id: "US:en", label: "United States" },
  { id: "CA:en", label: "Canada" },
  { id: "IE:en", label: "Ireland" },
  { id: "IN:en", label: "India" },
];

export interface Headline {
  title: string;
  link: string;
  source: string;
  published: Date;
  topic: string;
}

function params(region: string) {
  const [gl, hl] = region.split(":");
  return `hl=${hl}-${gl}&gl=${gl}&ceid=${gl}:${hl}`;
}

export function topicUrl(topic: string, region: string) {
  if (topic === "TOP") return `https://news.google.com/rss?${params(region)}`;
  return `https://news.google.com/rss/headlines/section/topic/${topic}?${params(region)}`;
}
export const searchUrl = (q: string, region: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${params(region)}`;

function parseRss(xml: string, topic: string): Headline[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  return Array.from(doc.querySelectorAll("item")).map((it) => {
    const rawTitle = it.querySelector("title")?.textContent ?? "";
    const source = it.querySelector("source")?.textContent ?? rawTitle.split(" - ").pop() ?? "";
    const title = rawTitle.endsWith(" - " + source) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle;
    return {
      title,
      link: it.querySelector("link")?.textContent ?? "",
      source,
      published: new Date(it.querySelector("pubDate")?.textContent ?? Date.now()),
      topic,
    };
  });
}

export async function getHeadlines(topic: string, region: string): Promise<Headline[]> {
  return cached(`news:${topic}:${region}`, 10 * 60e3, async () => {
    const r = await httpGet(topicUrl(topic, region));
    if (!r.ok) throw new Error(`News ${r.status}`);
    return parseRss(await r.text(), topic);
  }).then((list) => list.map((h) => ({ ...h, published: new Date(h.published) })));
}

export async function searchNews(q: string, region: string): Promise<Headline[]> {
  return cached(`newsq:${q}:${region}`, 10 * 60e3, async () => {
    const r = await httpGet(searchUrl(q, region));
    if (!r.ok) throw new Error(`News ${r.status}`);
    return parseRss(await r.text(), q);
  }).then((list) => list.map((h) => ({ ...h, published: new Date(h.published) })));
}
