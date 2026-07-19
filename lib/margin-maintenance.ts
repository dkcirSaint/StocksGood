/**
 * 大盤融資維持率
 * - 優先 FinMind TaiwanTotalExchangeMarginMaintenance（付費方案）
 * - 否則以證交所資料估算：Σ(融資張數×1000×收盤價)／(融資金額仟元×1000)×100
 */

import type { MarginMaintenanceSnapshot } from "./types";

export type { MarginMaintenanceSnapshot };

const FINMIND_API = "https://api.finmindtrade.com/api/v4/data";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let cached: { at: number; value: MarginMaintenanceSnapshot | null } | null =
  null;
const CACHE_MS = 1000 * 60 * 30;

function ymdFromYmdCompact(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function parseNum(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;
  const s = raw.replace(/,/g, "").trim();
  if (!s || s === "--" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
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

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json,text/plain,*/*",
    },
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const text = await res.text();
  if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) {
    throw new Error("非 JSON 回應");
  }
  return JSON.parse(text) as Record<string, unknown>;
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

  // 舊版 creditList / data
  if (Array.isArray(payload.creditList)) {
    return [
      {
        fields: Array.isArray(payload.creditFields)
          ? (payload.creditFields as string[])
          : [],
        rows: payload.creditList as string[][],
      },
    ];
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

  // MI_INDEX 舊版 data1/fields1 …
  const out: TwseTable[] = [];
  for (const [key, val] of Object.entries(payload)) {
    if (!key.startsWith("data") || !Array.isArray(val) || val.length === 0) {
      continue;
    }
    const suffix = key.slice(4);
    const fieldsKey = suffix ? `fields${suffix}` : "fields";
    const fields = payload[fieldsKey];
    if (!Array.isArray(fields)) continue;
    out.push({ fields: fields as string[], rows: val as string[][] });
  }
  return out;
}

function fieldIndex(fields: string[], candidates: string[]): number {
  for (const c of candidates) {
    const i = fields.findIndex((f) => f === c || f.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

function isLikelyEtf(id: string, name: string): boolean {
  const n = name.toUpperCase();
  if (n.includes("ETF") || n.includes("指數股票型") || n.includes("受益憑證")) {
    return true;
  }
  // 常見 ETF／ETN：00xx、008xx，以及部分主動式 ETF 代號含字母
  if (/^00\d{2}$/.test(id) || /^008\d{2}$/.test(id) || /[A-Z]$/i.test(id)) {
    return true;
  }
  return false;
}

async function fromFinMind(): Promise<MarginMaintenanceSnapshot | null> {
  const start = new Date();
  start.setDate(start.getDate() - 40);
  const startDate = start.toISOString().slice(0, 10);

  const url = new URL(FINMIND_API);
  url.searchParams.set("dataset", "TaiwanTotalExchangeMarginMaintenance");
  url.searchParams.set("start_date", startDate);

  const token = process.env.FINMIND_TOKEN?.trim();
  const res = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    status?: number;
    data?: { date: string; TotalExchangeMarginMaintenance: number }[];
  };
  if (json.status !== 200 || !json.data?.length) return null;

  const sorted = [...json.data].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  const rate = Number(last.TotalExchangeMarginMaintenance);
  if (!Number.isFinite(rate) || rate <= 0) return null;

  return {
    date: last.date.slice(0, 10),
    rate,
    source: "finmind",
  };
}

function pickPriceMap(tables: TwseTable[]): Map<string, number> {
  const closeMap = new Map<string, number>();
  for (const t of tables) {
    const idIdx = fieldIndex(t.fields, ["證券代號", "代號"]);
    const closeIdx = fieldIndex(t.fields, ["收盤價"]);
    if (idIdx < 0 || closeIdx < 0) continue;
    for (const row of t.rows) {
      const id = String(row[idIdx] ?? "").trim();
      const close = parseNum(row[closeIdx]);
      if (id && close != null && close > 0) closeMap.set(id, close);
    }
    if (closeMap.size > 0) break;
  }
  return closeMap;
}

async function fromTwseEstimate(): Promise<MarginMaintenanceSnapshot | null> {
  for (const ymd of recentTradeDates()) {
    try {
      const marginPayload = await fetchJson(
        `https://www.twse.com.tw/exchangeReport/MI_MARGN?response=json&date=${ymd}&selectType=ALL`
      );
      if (marginPayload.stat !== "OK") continue;

      const marginTables = asTables(marginPayload);
      if (marginTables.length === 0) continue;

      // 信用交易統計（含融資金額）
      const summary =
        marginTables.find((t) =>
          t.rows.some((r) => String(r[0] ?? "").includes("融資金額"))
        ) ?? marginTables[0];
      const amountRow = summary.rows.find((row) =>
        String(row[0] ?? "").includes("融資金額")
      );
      if (!amountRow) continue;
      const financingAmountThousand = parseNum(amountRow[amountRow.length - 1]);
      if (!financingAmountThousand || financingAmountThousand <= 0) continue;

      // 個股融資餘額表
      const stockTable =
        marginTables.find((t) => {
          const idIdx = fieldIndex(t.fields, ["代號", "證券代號"]);
          return idIdx >= 0 && t.rows.length > 10;
        }) ?? marginTables[marginTables.length - 1];

      const idIdx = fieldIndex(stockTable.fields, ["代號", "證券代號"]);
      const nameIdx = fieldIndex(stockTable.fields, ["名稱", "證券名稱"]);
      const todayIdxs: number[] = [];
      stockTable.fields.forEach((f, i) => {
        if (f.includes("今日餘額")) todayIdxs.push(i);
      });
      const balIdx = todayIdxs[0] ?? 6;
      if (idIdx < 0) continue;

      const indexPayload = await fetchJson(
        `https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=${ymd}&type=ALLBUT0999`
      );
      if (indexPayload.stat !== "OK") continue;
      const closeMap = pickPriceMap(asTables(indexPayload));
      if (closeMap.size === 0) continue;

      let marketValue = 0;
      let used = 0;
      for (const row of stockTable.rows) {
        const id = String(row[idIdx] ?? "").trim();
        const name = String(row[nameIdx >= 0 ? nameIdx : 1] ?? "").trim();
        if (!id || isLikelyEtf(id, name)) continue;
        const lots = parseNum(row[balIdx]);
        const close = closeMap.get(id);
        if (lots == null || lots <= 0 || close == null) continue;
        marketValue += lots * 1000 * close;
        used += 1;
      }

      if (used < 50 || marketValue <= 0) continue;

      const rate = (marketValue / (financingAmountThousand * 1000)) * 100;
      if (!Number.isFinite(rate) || rate < 50 || rate > 500) continue;

      return {
        date: ymdFromYmdCompact(ymd),
        rate: Math.round(rate * 100) / 100,
        source: "twse_estimate",
      };
    } catch {
      continue;
    }
  }
  return null;
}

/** 取得最新大盤融資維持率（半小時快取） */
export async function getLatestMarginMaintenance(): Promise<MarginMaintenanceSnapshot | null> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) {
    return cached.value;
  }

  let value: MarginMaintenanceSnapshot | null = null;
  try {
    value = await fromFinMind();
  } catch {
    value = null;
  }
  if (!value) {
    try {
      value = await fromTwseEstimate();
    } catch {
      value = null;
    }
  }

  cached = { at: now, value };
  return value;
}
