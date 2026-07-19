import { NextRequest, NextResponse } from "next/server";
import { getWatchlistCalendarEvents } from "@/lib/stock-events";

export const dynamic = "force-dynamic";

const MAX_STOCKS = 30;

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids")?.trim() ?? "";
  const namesParam = req.nextUrl.searchParams.get("names")?.trim() ?? "";

  if (!idsParam) {
    return NextResponse.json({ events: [] });
  }

  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_STOCKS);

  const nameMap = new Map<string, string>();
  if (namesParam) {
    for (const pair of namesParam.split(",")) {
      const [id, ...rest] = pair.split(":");
      if (id) nameMap.set(id.trim(), rest.join(":").trim());
    }
  }

  const items = ids.map((stockId) => ({
    stockId,
    stockName: nameMap.get(stockId) || stockId,
  }));

  try {
    const events = await getWatchlistCalendarEvents(items);
    return NextResponse.json({ events });
  } catch {
    return NextResponse.json(
      { error: "事件日期取得失敗", events: [] },
      { status: 500 }
    );
  }
}
