import type { LargeHolderSnapshot, LargeHolderTier } from "./types";

const STORAGE_KEY = "ff_chip_cache";
export const MAX_CHIP_PERIODS = 2;

export interface ChipPeriodEntry {
  date: string;
  ratios: Record<LargeHolderTier, number>;
}

export interface StockChipCacheEntry {
  stockId: string;
  stockName: string;
  periods: ChipPeriodEntry[];
  savedAt: number;
}

export interface ChipPeriodFetchItem {
  stockId: string;
  stockName: string;
  periods: ChipPeriodEntry[];
}

function readAll(): Record<string, StockChipCacheEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== "object" || !parsed) return {};
    const out: Record<string, StockChipCacheEntry> = {};
    for (const [id, val] of Object.entries(parsed)) {
      if (!val || typeof val !== "object") continue;
      const entry = val as StockChipCacheEntry;
      if (!Array.isArray(entry.periods)) continue;
      out[id] = {
        stockId: entry.stockId ?? id,
        stockName: entry.stockName ?? id,
        periods: normalizePeriods(entry.periods),
        savedAt: typeof entry.savedAt === "number" ? entry.savedAt : 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, StockChipCacheEntry>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function normalizePeriods(periods: ChipPeriodEntry[]): ChipPeriodEntry[] {
  const map = new Map<string, ChipPeriodEntry>();
  for (const p of periods) {
    if (!p?.date || typeof p.date !== "string") continue;
    const ratios = p.ratios;
    if (
      typeof ratios?.["1000"] !== "number" ||
      typeof ratios?.["400"] !== "number" ||
      !Number.isFinite(ratios["1000"]) ||
      !Number.isFinite(ratios["400"])
    ) {
      continue;
    }
    map.set(p.date, {
      date: p.date,
      ratios: { "1000": ratios["1000"], "400": ratios["400"] },
    });
  }
  return [...map.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_CHIP_PERIODS);
}

function mergePeriods(
  existing: ChipPeriodEntry[],
  incoming: ChipPeriodEntry[]
): ChipPeriodEntry[] {
  const map = new Map<string, ChipPeriodEntry>();
  for (const p of [...existing, ...incoming]) {
    map.set(p.date, p);
  }
  return [...map.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_CHIP_PERIODS);
}

export function periodsToSnapshots(
  stockId: string,
  stockName: string,
  periods: ChipPeriodEntry[]
): LargeHolderSnapshot[] {
  const sorted = [...periods].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return [];

  const latest = sorted[sorted.length - 1];
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const out: LargeHolderSnapshot[] = [];

  for (const tier of ["1000", "400"] as const) {
    const ratio = latest.ratios[tier];
    const prevRatio = prev ? prev.ratios[tier] : null;
    out.push({
      id: `${stockId}-${latest.date}-${tier}`,
      date: latest.date,
      stockId,
      stockName,
      tier,
      ratio,
      wowChange: prevRatio != null ? ratio - prevRatio : null,
    });
  }

  return out;
}

/** 合併爬蟲結果寫入本地，每檔最多保留最近兩期 */
export function saveChipCacheFromFetch(items: ChipPeriodFetchItem[]) {
  if (typeof window === "undefined" || items.length === 0) return;

  const all = readAll();
  const now = Date.now();

  for (const item of items) {
    if (item.periods.length === 0) continue;
    const prev = all[item.stockId];
    all[item.stockId] = {
      stockId: item.stockId,
      stockName: item.stockName,
      periods: mergePeriods(prev?.periods ?? [], item.periods),
      savedAt: now,
    };
  }

  writeAll(all);
}

export function getChipSnapshotsFromCache(
  items: { stockId: string; stockName: string }[]
): LargeHolderSnapshot[] {
  if (typeof window === "undefined" || items.length === 0) return [];

  const all = readAll();
  const snapshots: LargeHolderSnapshot[] = [];

  for (const item of items) {
    const entry = all[item.stockId];
    if (!entry?.periods.length) continue;
    snapshots.push(
      ...periodsToSnapshots(
        item.stockId,
        item.stockName || entry.stockName,
        entry.periods
      )
    );
  }

  return snapshots.sort((a, b) => {
    const tierOrder = a.tier === "1000" ? 0 : 1;
    const tierOrderB = b.tier === "1000" ? 0 : 1;
    if (tierOrder !== tierOrderB) return tierOrder - tierOrderB;
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return a.stockId.localeCompare(b.stockId);
  });
}
