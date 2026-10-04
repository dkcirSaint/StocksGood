import type { StockCalendarEvent } from "./types";
import { taiwanCurrentYear } from "./calendar-event-utils";

const CACHE_KEY = "ff_event_cache";
const MAX_CACHED_STOCKS = 30;

export interface StockEventCacheEntry {
  stockId: string;
  stockName: string;
  year: number;
  events: StockCalendarEvent[];
  savedAt: number;
}

function readAll(): Record<string, StockEventCacheEntry> {
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

function writeAll(data: Record<string, StockEventCacheEntry>) {
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
}

function touchEntry(all: Record<string, StockEventCacheEntry>, stockId: string) {
  const entry = all[stockId];
  if (entry) entry.savedAt = Date.now();
}

function evictIfNeeded(all: Record<string, StockEventCacheEntry>, keepId: string) {
  const keys = Object.keys(all);
  if (keys.length < MAX_CACHED_STOCKS) return;

  const victims = keys
    .filter((k) => k !== keepId)
    .sort((a, b) => (all[a].savedAt ?? 0) - (all[b].savedAt ?? 0));

  while (Object.keys(all).length >= MAX_CACHED_STOCKS && victims.length > 0) {
    delete all[victims.shift()!];
  }
}

/** 僅保留 keep 內股票的行事曆事件快取，其餘刪除 */
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

export function mergeCalendarEvents(
  existing: StockCalendarEvent[],
  incoming: StockCalendarEvent[]
): StockCalendarEvent[] {
  const map = new Map<string, StockCalendarEvent>();
  for (const ev of existing) map.set(ev.id, ev);
  for (const ev of incoming) map.set(ev.id, ev);
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function getEventCache(
  stockId: string,
  year = taiwanCurrentYear()
): StockEventCacheEntry | null {
  const all = readAll();
  const raw = all[stockId];
  if (!raw || raw.year !== year || raw.events.length === 0) return null;

  touchEntry(all, stockId);
  writeAll(all);

  return {
    ...raw,
    events: [...raw.events].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function getWatchlistEventsFromCache(
  items: { stockId: string; stockName: string }[],
  year = taiwanCurrentYear()
): StockCalendarEvent[] {
  const merged: StockCalendarEvent[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const cache = getEventCache(item.stockId, year);
    if (!cache) continue;
    for (const ev of cache.events) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      merged.push(ev);
    }
  }

  return merged.sort((a, b) => a.date.localeCompare(b.date));
}

export function saveEventCache(
  stockId: string,
  stockName: string,
  events: StockCalendarEvent[],
  year = taiwanCurrentYear()
) {
  if (typeof window === "undefined" || events.length === 0) return;

  const all = readAll();
  evictIfNeeded(all, stockId);

  const prev = all[stockId];
  const merged =
    prev && prev.year === year
      ? mergeCalendarEvents(prev.events, events)
      : mergeCalendarEvents([], events);

  if (merged.length === 0) return;

  all[stockId] = {
    stockId,
    stockName,
    year,
    events: merged,
    savedAt: Date.now(),
  };
  writeAll(all);
}

/** 將 API 回傳的合併事件依股票代號分檔寫入本地 */
export function saveWatchlistEventsToCache(
  events: StockCalendarEvent[],
  year = taiwanCurrentYear()
) {
  const byStock = new Map<string, StockCalendarEvent[]>();
  for (const ev of events) {
    if (!byStock.has(ev.stockId)) byStock.set(ev.stockId, []);
    byStock.get(ev.stockId)!.push(ev);
  }
  for (const [stockId, list] of byStock) {
    saveEventCache(stockId, list[0]?.stockName ?? stockId, list, year);
  }
}
