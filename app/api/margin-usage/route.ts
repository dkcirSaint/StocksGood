import { NextRequest, NextResponse } from "next/server";
import { getStockMarginUsage } from "@/lib/margin-usage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 個股融資使用率 */
export async function GET(req: NextRequest) {
  const stockId = req.nextUrl.searchParams.get("stockId")?.trim() ?? "";
  if (!stockId) {
    return NextResponse.json(
      { error: "缺少 stockId", marginUsage: null },
      { status: 400 }
    );
  }

  try {
    const marginUsage = await getStockMarginUsage(stockId);
    return NextResponse.json({ marginUsage });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : String(e),
        marginUsage: null,
      },
      { status: 500 }
    );
  }
}
