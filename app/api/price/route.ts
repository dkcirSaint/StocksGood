import { NextRequest, NextResponse } from "next/server";
import {
  findStock,
  getDailyPrices,
  getDailyPricesSince,
  getLatestPriceDate,
} from "@/lib/finmind";

export const dynamic = "force-dynamic";

/** 僅更新 K 線（供追蹤列表背景預熱，不抓 MOPS / 財報） */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  const priceLatest = req.nextUrl.searchParams.get("priceLatest")?.trim() ?? "";

  if (!id) {
    return NextResponse.json({ error: "請提供股票代號" }, { status: 400 });
  }

  const stock = await findStock(id).catch(() => null);
  if (!stock) {
    return NextResponse.json(
      { error: `找不到股票「${id}」` },
      { status: 404 }
    );
  }

  let latestPriceDate: string | null = null;
  let needPrice = true;

  try {
    latestPriceDate = await getLatestPriceDate(stock.stock_id);
    if (priceLatest && latestPriceDate && priceLatest >= latestPriceDate) {
      needPrice = false;
    }
  } catch {
    needPrice = true;
  }

  let dailyPrices: Awaited<ReturnType<typeof getDailyPrices>> | undefined;
  if (needPrice) {
    try {
      if (priceLatest) {
        const overlap = new Date(priceLatest);
        overlap.setDate(overlap.getDate() - 7);
        dailyPrices = await getDailyPricesSince(
          stock.stock_id,
          overlap.toISOString().slice(0, 10)
        );
      } else {
        dailyPrices = await getDailyPrices(stock.stock_id);
      }
    } catch {
      return NextResponse.json(
        { error: "K 線資料取得失敗" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    stock,
    dailyPrices,
    latestPriceDate,
    priceFromCache: !needPrice,
  });
}
