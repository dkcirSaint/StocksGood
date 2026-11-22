import type { DailyPrice } from "./types";

const CACHE_KEY = "ff_price_cache_v2";
const LEGACY_CACHE_KEY = "ff_price_cache";
const ALIAS_KEY = "ff_stock_alias";

/** 約兩年交易日，供 1 年顯示與 MA240 暖身 */
const MAX_CALENDAR_DAYS = 730;

/** 最多快取檔數，超出時 LRU 淘汰最久未使用 */
const MAX_CACHED_STOCKS = 30;

export interface StockPriceCache {
  stockId: string;
  stockName: string;
  industryCategory: string;
  type: string;
  dailyPrices: DailyPrice[];
  latestDate: string;
  savedAt: number;
}

function readAliases(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ALIAS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function dropLegacyCache() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_CACHE_KEY);
  } catch {
    /* 無法存取時忽略 */
  }
}

function readAll(): Record<string, StockPriceCache> {
  if (typeof window === "undefined") return {};
  dropLegacyCache();
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, StockPriceCache>) {
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
}

function touchEntry(all: Record<string, StockPriceCache>, stockId: string) {
  const entry = all[stockId];
  if (entry) entry.savedAt = Date.now();
}

function evictIfNeeded(all: Record<string, StockPriceCache>, keepId: string) {
  const keys = Object.keys(all);
  if (keys.length < MAX_CACHED_STOCKS) return;

  const victims = keys
    .filter((k) => k !== keepId)
    .sort((a, b) => (all[a].savedAt ?? 0) - (all[b].savedAt ?? 0));

  while (Object.keys(all).length >= MAX_CACHED_STOCKS && victims.length > 0) {
    const id = victims.shift()!;
    delete all[id];
  }
}

function cutoffDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - MAX_CALENDAR_DAYS);
  return d.toISOString().slice(0, 10);
}

export function trimDailyPrices(prices: DailyPrice[]): DailyPrice[] {
  const min = cutoffDate();
  return prices
    .filter((p) => p.date >= min && p.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function latestPriceDate(prices: DailyPrice[]): string {
  if (prices.length === 0) return "";
  return prices[prices.length - 1].date;
}

export function mergeDailyPrices(
  existing: DailyPrice[],
  incoming: DailyPrice[]
): DailyPrice[] {
  const map = new Map<string, DailyPrice>();
  for (const p of existing) map.set(p.date, p);
  for (const p of incoming) map.set(p.date, p);
  return trimDailyPrices([...map.values()]);
}

export function getPriceCache(stockId: string): StockPriceCache | null {
  const all = readAll();
  const raw = all[stockId];
  if (!raw) return null;
  const dailyPrices = trimDailyPrices(raw.dailyPrices);
  if (dailyPrices.length === 0) return null;

  touchEntry(all, stockId);
  writeAll(all);

  return {
    ...raw,
    dailyPrices,
    latestDate: latestPriceDate(dailyPrices),
  };
}

export function getPriceCacheForQuery(query: string): StockPriceCache | null {
  const q = query.trim();
  if (!q) return null;
  const all = readAll();
  if (all[q]) return getPriceCache(q);
  const stockId = readAliases()[q];
  return stockId ? getPriceCache(stockId) : null;
}

/** 僅保留 keep 內股票的價格快取與別名，其餘刪除 */
export function pruneToIds(keep: Set<string>) {
  if (typeof window === "undefined") return;

  const all = readAll();
  let changed = false;
  for (const id of Object.keys(all)) {
    if (!keep.has(id)) {
      delete all[id];
      changed = true;
    }
  }
  if (changed) writeAll(all);

  // 別名：只保留指向被保留股票的項目
  const aliases = readAliases();
  let aliasChanged = false;
  for (const [name, id] of Object.entries(aliases)) {
    if (!keep.has(id)) {
      delete aliases[name];
      aliasChanged = true;
    }
  }
  if (aliasChanged) {
    window.localStorage.setItem(ALIAS_KEY, JSON.stringify(aliases));
  }
}

export function savePriceCache(
  stockId: string,
  data: {
    stockName: string;
    industryCategory: string;
    type: string;
    dailyPrices: DailyPrice[];
    latestDate?: string;
  }
) {
  if (typeof window === "undefined") return;
  const dailyPrices = trimDailyPrices(data.dailyPrices);
  if (dailyPrices.length === 0) return;

  const all = readAll();
  evictIfNeeded(all, stockId);
  all[stockId] = {
    stockId,
    stockName: data.stockName,
    industryCategory: data.industryCategory,
    type: data.type,
    dailyPrices,
    latestDate: data.latestDate ?? latestPriceDate(dailyPrices),
    savedAt: Date.now(),
  };
  writeAll(all);
}
