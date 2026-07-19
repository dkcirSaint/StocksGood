import type { MonthlyRevenuePoint, QuarterlyReport } from "./types";

const CACHE_KEY = "ff_financial_cache";
const ALIAS_KEY = "ff_stock_alias";

export interface StockFinancialCache {
  stockId: string;
  monthlyRevenue: MonthlyRevenuePoint[];
  quarterlyReports: QuarterlyReport[];
  latestRevenueMonth: string;
  latestQuarterDate: string;
  savedAt: number;
}

function readAll(): Record<string, StockFinancialCache> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, StockFinancialCache>) {
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
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

export function rememberStockAlias(name: string, stockId: string) {
  if (typeof window === "undefined") return;
  const aliases = readAliases();
  aliases[name.trim()] = stockId;
  aliases[stockId] = stockId;
  window.localStorage.setItem(ALIAS_KEY, JSON.stringify(aliases));
}

/** 以代號或曾查詢過的名稱取得本地快取 */
export function getFinancialCacheForQuery(
  query: string
): StockFinancialCache | null {
  const q = query.trim();
  if (!q) return null;
  const all = readAll();
  if (all[q]) return all[q];
  const aliases = readAliases();
  const stockId = aliases[q];
  return stockId && all[stockId] ? all[stockId] : null;
}

export function getFinancialCache(
  stockId: string
): StockFinancialCache | null {
  return readAll()[stockId] ?? null;
}

function trimRevenue(items: MonthlyRevenuePoint[]): MonthlyRevenuePoint[] {
  return items
    .slice()
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth))
    .slice(0, 3);
}

function trimQuarters(items: QuarterlyReport[]): QuarterlyReport[] {
  return items
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);
}

export function saveFinancialCache(
  stockId: string,
  data: {
    monthlyRevenue?: MonthlyRevenuePoint[];
    quarterlyReports?: QuarterlyReport[];
    latestRevenueMonth: string;
    latestQuarterDate: string;
  }
) {
  if (typeof window === "undefined") return;
  const all = readAll();
  const prev = all[stockId];
  const monthlyRevenue = trimRevenue(
    data.monthlyRevenue ?? prev?.monthlyRevenue ?? []
  );
  const quarterlyReports = trimQuarters(
    data.quarterlyReports ?? prev?.quarterlyReports ?? []
  );
  all[stockId] = {
    stockId,
    monthlyRevenue,
    quarterlyReports,
    latestRevenueMonth: data.latestRevenueMonth,
    latestQuarterDate: data.latestQuarterDate,
    savedAt: Date.now(),
  };
  writeAll(all);
}
