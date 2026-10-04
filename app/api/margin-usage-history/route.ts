import { NextRequest, NextResponse } from "next/server";
import { getStockMarginUsageHistory } from "@/lib/margin-usage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 個股融資使用率歷史走勢（近半年）；可帶 start 做增量更新 */
export async function GET(req: NextRequest) {
  const stockId = req.nextUrl.searchParams.get("stockId")?.trim() ?? "";
  const start = req.nextUrl.searchParams.get("start")?.trim() || undefined;

  if (!stockId) {
    return NextResponse.json(
      { error: "缺少 stockId", points: [] },
      { status: 400 }
    );
  }

  try {
    const points = await getStockMarginUsageHistory(stockId, start);
    return NextResponse.json({ points });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : String(e),
        points: [],
      },
      { status: 500 }
    );
  }
}
