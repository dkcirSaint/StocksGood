import { NextRequest, NextResponse } from "next/server";
import { searchRecentStockNews } from "@/lib/news";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_STOCKS = 30;
/** 同時查詢的檔數，避免一次打太多 RSS 請求 */
const CONCURRENCY = 4;

export interface RecentNewsGroup {
  stockId: string;
  stockName: string;
  articles: { title: string; link: string; source: string; publishedAt: string }[];
  error?: string;
}

/** 追蹤列表「持股」分類近 24 小時的新聞（每檔最多 3 則） */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const ids = (searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_STOCKS);

  const nameMap = new Map<string, string>();
  for (const part of (searchParams.get("names") ?? "").split(",")) {
    const [id, ...rest] = part.split(":");
    if (id) nameMap.set(id.trim(), rest.join(":").trim() || id.trim());
  }

  const fetchedAt = new Date().toISOString();
  if (ids.length === 0) {
    return NextResponse.json({ fetchedAt, groups: [] });
  }

  const groups: RecentNewsGroup[] = ids.map((stockId) => ({
    stockId,
    stockName: nameMap.get(stockId) ?? stockId,
    articles: [],
  }));

  let cursor = 0;
  async function worker() {
    while (cursor < groups.length) {
      const group = groups[cursor++];
      try {
        group.articles = await searchRecentStockNews(
          group.stockName,
          group.stockId
        );
      } catch (e) {
        group.error = e instanceof Error ? e.message : String(e);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, groups.length) }, () => worker())
  );

  return NextResponse.json({ fetchedAt, groups });
}
