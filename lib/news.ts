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

async function fetchNews(query: string): Promise<NewsArticle[]> {
  const url = `${RSS_BASE}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; FindFortune/1.0; +https://localhost)",
    },
    next: { revalidate: 60 * 30 },
  });
  if (!res.ok) {
    throw new Error(`新聞搜尋 HTTP ${res.status}`);
  }
  const xml = await res.text();
  return parseRssItems(xml).slice(0, 12);
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
