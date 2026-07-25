/**
 * 預估股價 = 預估 EPS × 本益比（上緣／合理／下緣）× 今年／明年。
 * 資料皆來自使用者輸入（localStorage）。
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
      const pe = parsePe(band[b.key]);
      if (pe == null) continue;
      const price = Math.round(e * pe * 100) / 100;
      if (!Number.isFinite(price) || price <= 0) continue;
      out.push({ label: `${y.label}${b.label}`, price });
    }
  }
  return out;
}

/** 最近一個交易日 K 線高低價是否觸及任一預估股價 */
export function evaluateEstPriceTouches(
  targets: EstPriceTarget[],
  latestBar: DailyPrice | null
): EstPriceTarget[] {
  if (!latestBar || targets.length === 0) return [];
  return targets.filter(
    (t) => latestBar.low <= t.price && t.price <= latestBar.high
  );
}

export interface EstPriceTouchRow {
  stockId: string;
  stockName: string;
  barDate: string;
  touched: EstPriceTarget[];
}

/** 彙整追蹤列表內各股於最近交易日觸及的預估股價 */
export function collectWatchlistEstPriceTouches(
  items: { stockId: string; stockName: string }[],
  currentStockId?: string,
  currentLatestBar?: DailyPrice | null
): EstPriceTouchRow[] {
  const rows: EstPriceTouchRow[] = [];

  for (const item of items) {
    const targets = getEstPriceTargets(item.stockId);
    if (targets.length === 0) continue;

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

    const touched = evaluateEstPriceTouches(targets, latestBar);
    if (!latestBar || touched.length === 0) continue;

    rows.push({
      stockId: item.stockId,
      stockName: item.stockName,
      barDate: latestBar.date,
      touched,
    });
  }

  return rows.sort((a, b) => a.stockId.localeCompare(b.stockId));
}
