import { NextRequest, NextResponse } from "next/server";
import {
  findStock,
  getMonthlyRevenue,
  getQuarterlyReports,
  getDailyPrices,
  getDailyPricesSince,
  getLatestRevenueMonth,
  getLatestQuarterDate,
  getLatestPriceDate,
  getLatestDividendYield,
} from "@/lib/finmind";
import {
  getInvestorConferences,
  getShareholderMeetings,
  conferencePageUrl,
  shareholderPageUrl,
} from "@/lib/mops";
import type { StockResult } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json(
      { error: "請輸入股票名稱或代號" },
      { status: 400 }
    );
  }

  const revLatest = req.nextUrl.searchParams.get("revLatest")?.trim() ?? "";
  const qLatest = req.nextUrl.searchParams.get("qLatest")?.trim() ?? "";
  const priceLatest = req.nextUrl.searchParams.get("priceLatest")?.trim() ?? "";

  const stock = await findStock(q).catch(() => null);
  if (!stock) {
    return NextResponse.json(
      { error: `找不到符合「${q}」的台股，請確認名稱或代號` },
      { status: 404 }
    );
  }

  const warnings: string[] = [];

  let needRevenue = true;
  let needQuarter = true;
  let needPrice = true;
  let latestRevenueMonth: string | null = null;
  let latestQuarterDate: string | null = null;
  let latestPriceDate: string | null = null;

  try {
    [latestRevenueMonth, latestQuarterDate, latestPriceDate] =
      await Promise.all([
        getLatestRevenueMonth(stock.stock_id),
        getLatestQuarterDate(stock.stock_id),
        getLatestPriceDate(stock.stock_id),
      ]);
    if (revLatest && latestRevenueMonth && revLatest === latestRevenueMonth) {
      needRevenue = false;
    }
    if (qLatest && latestQuarterDate && qLatest === latestQuarterDate) {
      needQuarter = false;
    }
    if (priceLatest && latestPriceDate && priceLatest >= latestPriceDate) {
      needPrice = false;
    }
  } catch {
    needRevenue = true;
    needQuarter = true;
    needPrice = true;
  }

  const priceFetch = async () => {
    if (!needPrice) return null;
    if (priceLatest) {
      const overlap = new Date(priceLatest);
      overlap.setDate(overlap.getDate() - 7);
      return getDailyPricesSince(
        stock.stock_id,
        overlap.toISOString().slice(0, 10)
      );
    }
    return getDailyPrices(stock.stock_id);
  };

  const [revenueRes, reportsRes, confRes, shRes, priceRes, yieldRes] =
    await Promise.allSettled([
      needRevenue ? getMonthlyRevenue(stock.stock_id, 3) : Promise.resolve(null),
      needQuarter
        ? getQuarterlyReports(stock.stock_id, 5)
        : Promise.resolve(null),
      getInvestorConferences(stock),
      getShareholderMeetings(stock),
      priceFetch(),
      getLatestDividendYield(stock.stock_id),
    ]);

  const monthlyRevenue =
    revenueRes.status === "fulfilled" && revenueRes.value
      ? revenueRes.value
      : undefined;
  if (revenueRes.status === "rejected") warnings.push("月營收資料取得失敗");

  const quarterlyReports =
    reportsRes.status === "fulfilled" && reportsRes.value
      ? reportsRes.value
      : undefined;
  if (reportsRes.status === "rejected") warnings.push("季報資料取得失敗");

  const conferences = confRes.status === "fulfilled" ? confRes.value : [];
  if (confRes.status === "rejected")
    warnings.push("法說會資料取得失敗（可點下方連結至公開資訊觀測站查詢）");

  const shareholderMeetings = shRes.status === "fulfilled" ? shRes.value : [];
  if (shRes.status === "rejected")
    warnings.push("股東會資料取得失敗（可點下方連結至公開資訊觀測站查詢）");

  const dailyPrices =
    priceRes.status === "fulfilled" && priceRes.value
      ? priceRes.value
      : undefined;
  if (priceRes.status === "rejected") warnings.push("K 線價格資料取得失敗");

  const dividendYield =
    yieldRes.status === "fulfilled" ? yieldRes.value : null;

  const result = {
    stock,
    dailyPrices,
    monthlyRevenue,
    quarterlyReports,
    conferences,
    shareholderMeetings,
    mopsConferenceUrl: conferencePageUrl(stock),
    mopsShareholderUrl: shareholderPageUrl(stock),
    warnings,
    dividendYield,
    financialsMeta: {
      latestRevenueMonth,
      latestQuarterDate,
      latestPriceDate,
      revenueFromCache: !needRevenue,
      quarterFromCache: !needQuarter,
      priceFromCache: !needPrice,
    },
  };

  return NextResponse.json(result);
}
