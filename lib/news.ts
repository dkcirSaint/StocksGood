import type { NewsArticle } from "./types";

const RSS_BASE =
  "https://news.google.com/rss/search?hl=zh-TW&gl=TW&ceid=TW:zh-Hant";

function decodeXml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1");
}

function parseRssItems(xml: string): NewsArticle[] {
  const articles: NewsArticle[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = decodeXml(
      (block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").trim()
    );
    const link = decodeXml(
      (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim()
    );
    const publishedAt = decodeXml(
      (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "").trim()
    );
    const sourceMatch = block.match(
      /<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/
    );
    const source = sourceMatch
      ? decodeXml(sourceMatch[2].trim())
      : title.includes(" - ")
        ? title.split(" - ").pop()!.trim()
        : "Google 新聞";

    if (!title || !link) continue;
    articles.push({ title, link, source, publishedAt });
  }
  return articles;
}

/**
 * 排除的來源（社群討論區性質，非新聞報導）。
 * 「股市爆料同學會」在 RSS 的 source 是 CMoney，只能由標題辨識，
 * 因此同時比對 source 與 title。
 */
const EXCLUDED_SOURCES = ["股市爆料同學會", "股市同學會"];

function isExcludedSource(article: NewsArticle): boolean {
  return EXCLUDED_SOURCES.some(
    (name) => article.source.includes(name) || article.title.includes(name)
  );
}

/** 以 Google News 的排除運算子從查詢端就不要抓到這些內容 */
const EXCLUDE_QUERY = EXCLUDED_SOURCES.map((name) => `-${name}`).join(" ");

async function fetchNews(
  query: string,
  opts?: { revalidate?: number; limit?: number }
): Promise<NewsArticle[]> {
  const url = `${RSS_BASE}&q=${encodeURIComponent(`${query} ${EXCLUDE_QUERY}`)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; FindFortune/1.0; +https://localhost)",
    },
    next: { revalidate: opts?.revalidate ?? 60 * 30 },
  });
  if (!res.ok) {
    throw new Error(`新聞搜尋 HTTP ${res.status}`);
  }
  const xml = await res.text();
  // 排除運算子偶爾會漏，再比對一次標題／來源後才截斷數量
  return parseRssItems(xml)
    .filter((a) => !isExcludedSource(a))
    .slice(0, opts?.limit ?? 12);
}

/** 搜尋公司法說會相關新聞報導 */
export async function searchConferenceNews(
  stockName: string,
  stockId: string,
  conferenceDate?: string
): Promise<NewsArticle[]> {
  const parts = [stockName, stockId, "法說會"];
  if (conferenceDate) parts.push(conferenceDate.slice(0, 7));
  return fetchNews(parts.join(" "));
}

/** 每檔股票最多回傳的新聞則數 */
export const MAX_RECENT_NEWS_PER_STOCK = 3;

/** 新聞時間範圍：近 24 小時 */
const RECENT_NEWS_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * 搜尋近 24 小時內提及該股票的新聞，每檔最多 3 則。
 * 以 Google News 的 when:1d 限縮後，再依發布時間過濾到 24 小時內。
 */
export async function searchRecentStockNews(
  stockName: string,
  stockId: string
): Promise<NewsArticle[]> {
  const keyword = stockName || stockId;
  const articles = await fetchNews(`${keyword} when:1d`, {
    revalidate: 60 * 10,
    limit: 30,
  });

  const cutoff = Date.now() - RECENT_NEWS_WINDOW_MS;
  const seen = new Set<string>();
  const out: NewsArticle[] = [];
  for (const a of articles) {
    const ts = Date.parse(a.publishedAt);
    if (!Number.isFinite(ts)) continue;
    if (ts < cutoff) continue;
    if (seen.has(a.link)) continue;
    seen.add(a.link);
    out.push(a);
    if (out.length >= MAX_RECENT_NEWS_PER_STOCK) break;
  }
  return out;
}

/** 搜尋公司股東會相關新聞報導 */
export async function searchShareholderNews(
  stockName: string,
  stockId: string,
  meetingDate?: string,
  meetingType?: string
): Promise<NewsArticle[]> {
  const parts = [stockName, stockId, "股東會"];
  if (meetingType && meetingType !== "股東會") parts.push(meetingType);
  if (meetingDate) parts.push(meetingDate.slice(0, 7));
  return fetchNews(parts.join(" "));
}
