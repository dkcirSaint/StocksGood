/**
 * 融資使用率走勢的本地快取（localStorage）。
 * - 每檔股票只保存「半年內」的資料點，超過即淘汰。
 * - 更新時只需向後端抓最後一筆之後的增量，避免每次抓全部。
 */

import type { MarginUsagePoint } from "./types";

const CACHE_KEY = "ff_margin_usage_history";
/** 最多快取檔數，超出時 LRU 淘汰最久未使用 */
const MAX_CACHED_STOCKS = 30;

interface Entry {
  points: MarginUsagePoint[];
  savedAt: number;
}

/** 半年前的日期界線（YYYY-MM-DD）；早於此界線的資料一律不保留 */
export function halfYearCutoff(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}

/** 只保留半年內、有效且依日期排序的點位 */
export function pruneToHalfYear(points: MarginUsagePoint[]): MarginUsagePoint[] {
  const min = halfYearCutoff();
  const map = new Map<string, MarginUsagePoint>();
  for (const p of points) {
    if (!p || typeof p.date !== "string") continue;
    const date = p.date.slice(0, 10);
    if (date < min) continue;
    if (typeof p.rate !== "number" || !Number.isFinite(p.rate)) continue;
    map.set(date, { date, rate: p.rate });
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function readAll(): Record<string, Entry> {
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

function writeAll(all: Record<string, Entry>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(all));
}

function evictIfNeeded(all: Record<string, Entry>, keepId: string) {
  const keys = Object.keys(all);
  if (keys.length < MAX_CACHED_STOCKS) return;
  const victims = keys
    .filter((k) => k !== keepId)
    .sort((a, b) => (all[a].savedAt ?? 0) - (all[b].savedAt ?? 0));
  while (Object.keys(all).length >= MAX_CACHED_STOCKS && victims.length > 0) {
    delete all[victims.shift()!];
  }
}

/** 僅保留 keep 內股票的融資使用率快取，其餘刪除 */
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
}

/** 讀取本地快取（已裁切至半年內） */
export function getMarginUsageCache(stockId: string): {
  points: MarginUsagePoint[];
  savedAt: number;
} | null {
  const all = readAll();
  const entry = all[stockId];
  if (!entry || !Array.isArray(entry.points)) return null;
  const points = pruneToHalfYear(entry.points);
  if (points.length === 0) return null;
  return { points, savedAt: entry.savedAt ?? 0 };
}

/** 合併新舊點位並裁切至半年內 */
export function mergeMarginUsagePoints(
  existing: MarginUsagePoint[],
  incoming: MarginUsagePoint[]
): MarginUsagePoint[] {
  return pruneToHalfYear([...existing, ...incoming]);
}

/** 寫入本地快取（自動裁切至半年內、LRU 淘汰） */
export function saveMarginUsageCache(
  stockId: string,
  points: MarginUsagePoint[]
): MarginUsagePoint[] {
  if (typeof window === "undefined") return pruneToHalfYear(points);
  const pruned = pruneToHalfYear(points);
  const all = readAll();
  evictIfNeeded(all, stockId);
  all[stockId] = { points: pruned, savedAt: Date.now() };
  writeAll(all);
  return pruned;
}
