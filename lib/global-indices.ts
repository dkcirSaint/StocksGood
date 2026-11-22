import type { DailyPrice } from "./types";
import { getDailyPrices } from "./finmind";

export type GlobalIndexKey =
  | "twii"
  | "otc"
  | "sox"
  | "nasdaq"
  | "kospi"
  | "dxy"
  | "vix";

export interface GlobalIndexDef {
  key: GlobalIndexKey;
  name: string;
  source: "yahoo" | "finmind" | "tpex";
  /** Yahoo Finance 代號 */
  symbol?: string;
  /** FinMind TaiwanStockPrice data_id */
  finmindId?: string;
  showVolumeMa?: boolean;
  volumeUnit?: string;
}

export const GLOBAL_INDICES: GlobalIndexDef[] = [
  {
    key: "twii",
    name: "台灣指數",
    source: "yahoo",
    symbol: "^TWII",
    finmindId: "001",
    showVolumeMa: true,
    volumeUnit: "股",
  },
  {
    key: "otc",
    name: "櫃買指數",
    source: "tpex",
    finmindId: "101",
    showVolumeMa: true,
    volumeUnit: "股",
  },
  { key: "sox", name: "費城半導體", source: "yahoo", symbol: "^SOX" },
  { key: "nasdaq", name: "那斯達克", source: "yahoo", symbol: "^IXIC" },
  { key: "kospi", name: "KOSPI", source: "yahoo", symbol: "^KS11" },
  { key: "dxy", name: "美元指數", source: "yahoo", symbol: "DX-Y.NYB" },
  { key: "vix", name: "VIX 恐慌指數", source: "yahoo", symbol: "^VIX" },
];

const INDEX_BY_KEY = new Map(GLOBAL_INDICES.map((d) => [d.key, d]));

export function getGlobalIndexDef(key: string): GlobalIndexDef | null {
  return INDEX_BY_KEY.get(key as GlobalIndexKey) ?? null;
}

export type GlobalIndexFetchOpts = {
  /** true：略過 Next Data Cache，強制向來源拉最新資料 */
  fresh?: boolean;
};

function remoteFetchInit(fresh?: boolean): RequestInit {
  return {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; FindFortune/1.0)",
    },
    ...(fresh
      ? { cache: "no-store" as const }
      : { next: { revalidate: 60 * 30 } }),
  };
}

interface YahooChartResult {
  timestamp?: number[];
  meta?: { gmtoffset?: number };
  indicators?: {
    quote?: Array<{
      open?: (number | null)[];
      high?: (number | null)[];
      low?: (number | null)[];
      close?: (number | null)[];
      volume?: (number | null)[];
    }>;
  };
}

function toLocalYmd(unixSec: number, gmtOffsetSec: number): string {
  const d = new Date((unixSec + gmtOffsetSec) * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchYahooPrices(
  symbol: string,
  fresh?: boolean
): Promise<DailyPrice[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=2y&interval=1d`;
  const res = await fetch(url, remoteFetchInit(fresh));
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`);

  const json = (await res.json()) as {
    chart?: { result?: YahooChartResult[]; error?: { description?: string } };
  };
  const result = json.chart?.result?.[0];
  if (!result) {
    throw new Error(json.chart?.error?.description || "Yahoo Finance 無資料");
  }

  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  const offset = result.meta?.gmtoffset ?? 0;
  if (!quote || timestamps.length === 0) return [];

  const out: DailyPrice[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = quote.close?.[i];
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    if (
      close == null ||
      open == null ||
      high == null ||
      low == null ||
      !Number.isFinite(close) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low)
    ) {
      continue;
    }
    const volume = quote.volume?.[i];
    out.push({
      date: toLocalYmd(timestamps[i], offset),
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) && volume != null && volume > 0 ? volume : 0,
    });
  }
  return out;
}

function parseNum(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;
  const n = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

/** 民國 YY/MM/DD 或 YYY/MM/DD → YYYY-MM-DD */
function rocToIso(roc: string): string | null {
  const m = roc.trim().match(/^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const year = Number(m[1]) + 1911;
  return `${year}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/**
 * 櫃買中心「日成交量值指數」：收盤、成交張數。
 * 無開高低時，用前收合成 K 棒，張數 × 1000 轉成股。
 */
async function fetchTpexOtcPrices(fresh?: boolean): Promise<DailyPrice[]> {
  const url =
    "https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingIndex?response=json";
  const res = await fetch(url, remoteFetchInit(fresh));
  if (!res.ok) throw new Error(`櫃買指數 HTTP ${res.status}`);
  const json = (await res.json()) as {
    tables?: { title?: string; fields?: string[]; data?: unknown[][] }[];
  };
  const table = json.tables?.find((t) => (t.title ?? "").includes("櫃買"));
  const rows = table?.data ?? json.tables?.[0]?.data ?? [];
  const closes: { date: string; close: number; volume: number }[] = [];
  for (const row of rows) {
    const date = rocToIso(String(row[0] ?? ""));
    const close = parseNum(row[4]);
    const lots = parseNum(row[1]);
    if (!date || close == null) continue;
    closes.push({
      date,
      close,
      volume: lots != null && lots > 0 ? Math.round(lots * 1000) : 0,
    });
  }
  closes.sort((a, b) => a.date.localeCompare(b.date));
  return closes.map((p, i) => {
    const prev = i > 0 ? closes[i - 1].close : p.close;
    return {
      date: p.date,
      open: prev,
      high: Math.max(prev, p.close),
      low: Math.min(prev, p.close),
      close: p.close,
      volume: p.volume,
    };
  });
}

async function fetchFinmindIfEnough(
  dataId: string,
  fresh?: boolean
): Promise<DailyPrice[] | null> {
  try {
    const prices = await getDailyPrices(dataId, 730, { fresh });
    return prices.length >= 60 ? prices : null;
  } catch {
    return null;
  }
}

/** 近兩年日 K。台股指數優先 FinMind（有 token 時較完整），否則改走 Yahoo／櫃買中心。 */
export async function getGlobalIndexPrices(
  key: GlobalIndexKey,
  opts: GlobalIndexFetchOpts = {}
): Promise<DailyPrice[]> {
  const def = INDEX_BY_KEY.get(key);
  if (!def) throw new Error(`未知指數 ${key}`);
  const fresh = opts.fresh;

  if (def.finmindId) {
    const fromFm = await fetchFinmindIfEnough(def.finmindId, fresh);
    if (fromFm) return fromFm;
  }

  if (def.source === "tpex" || key === "otc") {
    return fetchTpexOtcPrices(fresh);
  }
  if (!def.symbol) throw new Error(`${def.name} 缺少 Yahoo 代號`);
  return fetchYahooPrices(def.symbol, fresh);
}
