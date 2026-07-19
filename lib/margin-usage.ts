/**
 * 個股融資使用率 = 融資今日餘額 / 融資限額 × 100
 * - 優先 FinMind TaiwanStockMarginPurchaseShortSale
 * - 否則證交所 MI_MARGN（上市）
 */

import type { StockMarginUsageSnapshot } from "./types";

export type { StockMarginUsageSnapshot };

const FINMIND_API = "https://api.finmindtrade.com/api/v4/data";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const cache = new Map<
  string,
  { at: number; value: StockMarginUsageSnapshot | null }
>();
const CACHE_MS = 1000 * 60 * 30;

function parseNum(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;
  const s = raw.replace(/,/g, "").trim();
  if (!s || s === "--" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function ymdFromYmdCompact(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function recentTradeDates(count = 12): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < 40 && out.length < count; i++) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    const wd = x.getDay();
    if (wd === 0 || wd === 6) continue;
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const day = String(x.getDate()).padStart(2, "0");
    out.push(`${y}${m}${day}`);
  }
  return out;
}

function calcUsage(balance: number, limit: number): number | null {
  if (!Number.isFinite(balance) || !Number.isFinite(limit) || limit <= 0) {
    return null;
  }
  const rate = (balance / limit) * 100;
  if (!Number.isFinite(rate) || rate < 0 || rate > 200) return null;
  return Math.round(rate * 100) / 100;
}

async function fromFinMind(
  stockId: string
): Promise<StockMarginUsageSnapshot | null> {
  const start = new Date();
  start.setDate(start.getDate() - 21);
  const startDate = start.toISOString().slice(0, 10);

  const url = new URL(FINMIND_API);
  url.searchParams.set("dataset", "TaiwanStockMarginPurchaseShortSale");
  url.searchParams.set("data_id", stockId);
  url.searchParams.set("start_date", startDate);

  const token = process.env.FINMIND_TOKEN?.trim();
  const res = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    status?: number;
    data?: {
      date: string;
      MarginPurchaseTodayBalance?: number;
      MarginPurchaseLimit?: number;
    }[];
  };
  if (json.status !== 200 || !json.data?.length) return null;

  const sorted = [...json.data].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const row = sorted[i];
    const balance = Number(row.MarginPurchaseTodayBalance);
    const limit = Number(row.MarginPurchaseLimit);
    const rate = calcUsage(balance, limit);
    if (rate == null) continue;
    return {
      stockId,
      date: row.date.slice(0, 10),
      rate,
      balance,
      limit,
      source: "finmind",
    };
  }
  return null;
}

type TwseTable = { fields: string[]; rows: string[][] };

function asTables(payload: Record<string, unknown>): TwseTable[] {
  if (Array.isArray(payload.tables)) {
    return (payload.tables as { fields?: string[]; data?: string[][] }[])
      .filter((t) => Array.isArray(t?.data) && t.data.length > 0)
      .map((t) => ({
        fields: Array.isArray(t.fields) ? t.fields : [],
        rows: t.data as string[][],
      }));
  }
  if (Array.isArray(payload.data)) {
    return [
      {
        fields: Array.isArray(payload.fields)
          ? (payload.fields as string[])
          : [],
        rows: payload.data as string[][],
      },
    ];
  }
  return [];
}

function fieldIndex(fields: string[], candidates: string[]): number {
  for (const c of candidates) {
    const i = fields.findIndex((f) => f === c || f.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

async function fromTwse(
  stockId: string
): Promise<StockMarginUsageSnapshot | null> {
  for (const ymd of recentTradeDates()) {
    try {
      const res = await fetch(
        `https://www.twse.com.tw/exchangeReport/MI_MARGN?response=json&date=${ymd}&selectType=STOCK`,
        {
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/json,text/plain,*/*",
          },
          cache: "no-store",
        }
      );
      if (!res.ok) continue;
      const payload = (await res.json()) as Record<string, unknown>;
      if (payload.stat !== "OK") continue;

      const tables = asTables(payload);
      const stockTable =
        tables.find((t) => {
          const idIdx = fieldIndex(t.fields, ["代號", "證券代號"]);
          return idIdx >= 0 && t.rows.length > 10;
        }) ?? tables[tables.length - 1];
      if (!stockTable) continue;

      const idIdx = fieldIndex(stockTable.fields, ["代號", "證券代號"]);
      if (idIdx < 0) continue;

      const todayIdxs: number[] = [];
      const limitIdxs: number[] = [];
      stockTable.fields.forEach((f, i) => {
        if (f.includes("今日餘額")) todayIdxs.push(i);
        if (f === "限額" || f.includes("融資限額")) limitIdxs.push(i);
      });
      // 融資欄位在融券之前：取第一組今日餘額／限額
      const balIdx = todayIdxs[0];
      const limIdx = limitIdxs[0];
      if (balIdx == null || limIdx == null) continue;

      const row = stockTable.rows.find(
        (r) => String(r[idIdx] ?? "").trim() === stockId
      );
      if (!row) continue;

      const balance = parseNum(row[balIdx]);
      const limit = parseNum(row[limIdx]);
      if (balance == null || limit == null) continue;
      const rate = calcUsage(balance, limit);
      if (rate == null) continue;

      return {
        stockId,
        date: ymdFromYmdCompact(ymd),
        rate,
        balance,
        limit,
        source: "twse",
      };
    } catch {
      continue;
    }
  }
  return null;
}

/** 取得個股最新融資使用率（半小時快取） */
export async function getStockMarginUsage(
  stockId: string
): Promise<StockMarginUsageSnapshot | null> {
  const id = stockId.trim();
  if (!id) return null;

  const now = Date.now();
  const hit = cache.get(id);
  if (hit && now - hit.at < CACHE_MS) {
    return hit.value;
  }

  let value: StockMarginUsageSnapshot | null = null;
  try {
    value = await fromFinMind(id);
  } catch {
    value = null;
  }
  if (!value) {
    try {
      value = await fromTwse(id);
    } catch {
      value = null;
    }
  }

  cache.set(id, { at: now, value });
  return value;
}
