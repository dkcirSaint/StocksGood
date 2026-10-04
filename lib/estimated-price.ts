/**
 * 預估股價 = 預估 EPS × 本益比（上緣／合理／下緣）× 今年／明年。
 * 資料皆來自使用者輸入（localStorage）。
 *
 * 觸價通知：以最新收盤價對照某年度的 下緣 < 合理 < 上緣，
 * 取單一互斥區間（低於下緣／低於合理／高於合理／高於上緣）。
 */

import type { DailyPrice } from "./types";
import { getPriceCache } from "./price-cache";
import { getEstimatedEps } from "./estimated-eps";
import { getPeBand } from "./pe-band";

export interface EstPriceTarget {
  label: string;
  price: number;
}

const YEARS: { key: "thisYear" | "nextYear"; label: string }[] = [
  { key: "thisYear", label: "今年" },
  { key: "nextYear", label: "明年" },
];

const BANDS: { key: "upper" | "fair" | "lower"; label: string }[] = [
  { key: "upper", label: "上緣" },
  { key: "fair", label: "合理" },
  { key: "lower", label: "下緣" },
];

function parsePe(raw: string): number | null {
  const n = Number(raw.trim().replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 由 EPS 與本益比字串算出預估股價（無效回 null） */
function estPriceFrom(eps: number, peStr: string): number | null {
  const pe = parsePe(peStr);
  if (pe == null) return null;
  const price = Math.round(eps * pe * 100) / 100;
  return Number.isFinite(price) && price > 0 ? price : null;
}

export function formatTargetPrice(n: number): string {
  return n.toLocaleString("zh-TW", { maximumFractionDigits: 1 });
}

/** 依使用者輸入的預估 EPS 與本益比，計算今年／明年 × 上緣／合理／下緣 的預估股價 */
export function getEstPriceTargets(stockId: string): EstPriceTarget[] {
  const eps = getEstimatedEps(stockId);
  const band = getPeBand(stockId);
  const out: EstPriceTarget[] = [];
  for (const y of YEARS) {
    const e = eps[y.key];
    if (e == null || !Number.isFinite(e)) continue;
    for (const b of BANDS) {
      const price = estPriceFrom(e, band[b.key]);
      if (price == null) continue;
      out.push({ label: `${y.label}${b.label}`, price });
    }
  }
  return out;
}

// ── 觸價通知：區間判定 ───────────────────────────────────────────

export type EstZone = "低於下緣" | "低於合理" | "高於合理" | "高於上緣";

export interface EstPriceBand {
  lower: number;
  fair: number;
  upper: number;
}

/**
 * 以收盤價對照 下緣 < 合理 < 上緣，取單一互斥區間。
 * 需三線齊全且遞增；close 恰等於合理時不列入。
 */
export function classifyZone(
  close: number,
  lower: number,
  fair: number,
  upper: number
): EstZone | null {
  if (!Number.isFinite(close)) return null;
  if (!(lower < fair && fair < upper)) return null;
  if (close < lower) return "低於下緣";
  if (close < fair) return "低於合理";
  if (close > upper) return "高於上緣";
  if (close > fair) return "高於合理";
  return null; // close === fair
}

/** 區間對應的臨界價（供顯示） */
export function refPriceForZone(zone: EstZone, band: EstPriceBand): number {
  switch (zone) {
    case "低於下緣":
      return band.lower;
    case "低於合理":
    case "高於合理":
      return band.fair;
    case "高於上緣":
      return band.upper;
  }
}

/** 取得今年／明年的預估股價區間（缺任一線則該年度為 null） */
export function getEstPriceBandsByYear(stockId: string): {
  thisYear: EstPriceBand | null;
  nextYear: EstPriceBand | null;
} {
  const eps = getEstimatedEps(stockId);
  const band = getPeBand(stockId);

  const build = (yearKey: "thisYear" | "nextYear"): EstPriceBand | null => {
    const e = eps[yearKey];
    if (e == null || !Number.isFinite(e)) return null;
    const lower = estPriceFrom(e, band.lower);
    const fair = estPriceFrom(e, band.fair);
    const upper = estPriceFrom(e, band.upper);
    if (lower == null || fair == null || upper == null) return null;
    return { lower, fair, upper };
  };

  return { thisYear: build("thisYear"), nextYear: build("nextYear") };
}

export interface EstNotifyEntry {
  yearLabel: "今年" | "明年";
  zone: EstZone;
  close: number;
  refPrice: number;
}

export interface EstNotifyRow {
  stockId: string;
  stockName: string;
  barDate: string;
  entries: EstNotifyEntry[];
}

/** 依單檔最新收盤價，判定今年／明年落在哪個區間 */
export function evaluateEstPriceNotify(
  stockId: string,
  latestBar: DailyPrice | null
): EstNotifyEntry[] {
  if (!latestBar || !Number.isFinite(latestBar.close)) return [];
  const bands = getEstPriceBandsByYear(stockId);
  const close = latestBar.close;
  const entries: EstNotifyEntry[] = [];
  for (const y of YEARS) {
    const b = bands[y.key];
    if (!b) continue;
    const zone = classifyZone(close, b.lower, b.fair, b.upper);
    if (!zone) continue;
    entries.push({
      yearLabel: y.label as "今年" | "明年",
      zone,
      close,
      refPrice: refPriceForZone(zone, b),
    });
  }
  return entries;
}

/** 彙整追蹤列表內各股最新收盤價的觸價通知（區間判定） */
export function collectWatchlistEstPriceNotifications(
  items: { stockId: string; stockName: string }[],
  currentStockId?: string,
  currentLatestBar?: DailyPrice | null
): EstNotifyRow[] {
  const rows: EstNotifyRow[] = [];

  for (const item of items) {
    let latestBar: DailyPrice | null = null;
    if (item.stockId === currentStockId && currentLatestBar) {
      latestBar = currentLatestBar;
    } else {
      const cache = getPriceCache(item.stockId);
      const prices = cache?.dailyPrices;
      if (prices?.length) {
        latestBar = prices[prices.length - 1];
      }
    }
    if (!latestBar) continue;

    const entries = evaluateEstPriceNotify(item.stockId, latestBar);
    if (entries.length === 0) continue;

    rows.push({
      stockId: item.stockId,
      stockName: item.stockName,
      barDate: latestBar.date,
      entries,
    });
  }

  return rows.sort((a, b) => a.stockId.localeCompare(b.stockId));
}
