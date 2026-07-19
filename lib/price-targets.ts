import type { DailyPrice } from "./types";
import { getPriceCache } from "./price-cache";

const STORAGE_KEY = "ff_key_prices";
export const MAX_KEY_PRICES = 4;

function loadAll(): Record<string, number[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number[]> = {};
    for (const [id, val] of Object.entries(parsed)) {
      if (!Array.isArray(val)) continue;
      const prices = val
        .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0)
        .slice(0, MAX_KEY_PRICES);
      if (prices.length > 0) out[id] = prices;
    }
    return out;
  } catch {
    return {};
  }
}

function persistAll(all: Record<string, number[]>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function notifyKeyPricesChanged(stockId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("ff-key-prices-changed", { detail: { stockId } })
  );
}

export function getKeyPrices(stockId: string): number[] {
  const prices = loadAll()[stockId];
  return Array.isArray(prices) ? prices : [];
}

/** 解析使用者輸入的價格字串 */
export function parsePriceInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function formatKeyPrice(n: number): string {
  return n.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
}

export type AddKeyPriceResult =
  | { ok: true; prices: number[] }
  | { ok: false; reason: "invalid" | "full" | "duplicate" };

export function addKeyPrice(stockId: string, price: number): AddKeyPriceResult {
  const all = loadAll();
  const current = all[stockId] ?? [];

  if (current.some((p) => p === price)) {
    return { ok: false, reason: "duplicate" };
  }
  if (current.length >= MAX_KEY_PRICES) {
    return { ok: false, reason: "full" };
  }

  const next = [...current, price];
  all[stockId] = next;
  persistAll(all);
  notifyKeyPricesChanged(stockId);
  return { ok: true, prices: next };
}

export type RemoveKeyPriceResult =
  | { ok: true; prices: number[] }
  | { ok: false; reason: "invalid" | "missing" };

export function removeKeyPrice(
  stockId: string,
  price: number
): RemoveKeyPriceResult {
  const all = loadAll();
  const current = all[stockId] ?? [];
  if (!current.some((p) => p === price)) {
    return { ok: false, reason: "missing" };
  }

  const next = current.filter((p) => p !== price);
  if (next.length === 0) {
    delete all[stockId];
  } else {
    all[stockId] = next;
  }
  persistAll(all);
  notifyKeyPricesChanged(stockId);
  return { ok: true, prices: next };
}

/** 最近一個交易日 K 線高低價是否觸及關鍵價格 */
export function evaluateKeyPriceTouches(
  keyPrices: number[],
  latestBar: DailyPrice | null
): number[] {
  if (!latestBar || !Array.isArray(keyPrices) || keyPrices.length === 0) {
    return [];
  }
  return keyPrices.filter((p) => latestBar.low <= p && p <= latestBar.high);
}

export interface StockKeyPriceTouchRow {
  stockId: string;
  stockName: string;
  barDate: string;
  touchedPrices: number[];
}

/** 彙整追蹤列表內各股於最近交易日的關鍵價格觸價 */
export function collectWatchlistKeyPriceTouches(
  items: { stockId: string; stockName: string }[],
  currentStockId?: string,
  currentLatestBar?: DailyPrice | null
): StockKeyPriceTouchRow[] {
  const rows: StockKeyPriceTouchRow[] = [];

  for (const item of items) {
    const keyPrices = getKeyPrices(item.stockId);
    if (keyPrices.length === 0) continue;

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

    const touched = evaluateKeyPriceTouches(keyPrices, latestBar);
    if (!latestBar || touched.length === 0) continue;

    rows.push({
      stockId: item.stockId,
      stockName: item.stockName,
      barDate: latestBar.date,
      touchedPrices: touched,
    });
  }

  return rows.sort((a, b) => a.stockId.localeCompare(b.stockId));
}
