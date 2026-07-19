/**
 * 加權指數（發行量加權股價指數 / TAIEX）
 * - 優先 FinMind TaiwanStockPrice data_id=001
 * - 否則證交所 MI_INDEX
 */

import type { MarketIndexSnapshot } from "./types";

export type { MarketIndexSnapshot };

const FINMIND_API = "https://api.finmindtrade.com/api/v4/data";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let cached: { at: number; value: MarketIndexSnapshot | null } | null = null;
const CACHE_MS = 1000 * 60 * 30;

function parseNum(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;
  const s = raw.replace(/,/g, "").trim();
  if (!s || s === "--" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function recentTradeDates(count = 10): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < 30 && out.length < count; i++) {
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

function ymdFromCompact(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

async function fromFinMind(): Promise<MarketIndexSnapshot | null> {
  const start = new Date();
  start.setDate(start.getDate() - 21);
  const startDate = start.toISOString().slice(0, 10);

  const url = new URL(FINMIND_API);
  url.searchParams.set("dataset", "TaiwanStockPrice");
  url.searchParams.set("data_id", "001");
  url.searchParams.set("start_date", startDate);

  const token = process.env.FINMIND_TOKEN?.trim();
  const res = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    status?: number;
    data?: { date: string; close: number }[];
  };
  if (json.status !== 200 || !json.data?.length) return null;

  const bars = json.data
    .filter((r) => Number(r.close) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (bars.length === 0) return null;

  const last = bars[bars.length - 1];
  const prev = bars.length > 1 ? bars[bars.length - 2] : null;
  const close = Number(last.close);
  const prevClose = prev ? Number(prev.close) : null;
  const change =
    prevClose != null && Number.isFinite(prevClose) ? close - prevClose : null;
  const changePct =
    change != null && prevClose ? (change / prevClose) * 100 : null;

  return {
    name: "加權指數",
    date: last.date.slice(0, 10),
    close,
    change,
    changePct,
    source: "finmind",
  };
}

async function fromTwse(): Promise<MarketIndexSnapshot | null> {
  for (const ymd of recentTradeDates()) {
    try {
      const res = await fetch(
        `https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=${ymd}&type=ALL`,
        {
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/json,text/plain,*/*",
          },
          cache: "no-store",
          redirect: "follow",
        }
      );
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.trim().startsWith("{")) continue;
      const payload = JSON.parse(text) as {
        stat?: string;
        tables?: { fields?: string[]; data?: string[][] }[];
      };
      if (payload.stat !== "OK" || !payload.tables?.length) continue;

      for (const t of payload.tables) {
        const fields = t.fields ?? [];
        const nameIdx = fields.findIndex(
          (f) => f === "指數" || f.includes("指數")
        );
        const closeIdx = fields.findIndex((f) => f.includes("收盤"));
        if (nameIdx < 0 || closeIdx < 0 || !t.data?.length) continue;

        const row =
          t.data.find(
            (r) => String(r[nameIdx] ?? "").trim() === "發行量加權股價指數"
          ) ??
          t.data.find((r) => String(r[nameIdx] ?? "").trim() === "加權指數");
        if (!row) continue;

        const close = parseNum(row[closeIdx]);
        if (close == null || close <= 0) continue;

        const changeIdx = fields.findIndex((f) => f.includes("漲跌點數"));
        const pctIdx = fields.findIndex((f) => f.includes("漲跌百分比"));
        const signIdx = fields.findIndex((f) => f.includes("漲跌(+/-)"));
        let change = changeIdx >= 0 ? parseNum(row[changeIdx]) : null;
        let changePct = pctIdx >= 0 ? parseNum(row[pctIdx]) : null;

        // 符號可能藏在 HTML：<p style='color:green'>-</p>
        const signRaw = signIdx >= 0 ? String(row[signIdx] ?? "") : "";
        const negative =
          signRaw.includes(">-<") ||
          signRaw.includes(">-</") ||
          signRaw.trim() === "-";
        if (negative) {
          if (change != null && change > 0) change = -change;
          if (changePct != null && changePct > 0) changePct = -changePct;
        }

        return {
          name: "加權指數",
          date: ymdFromCompact(ymd),
          close,
          change,
          changePct,
          source: "twse",
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

/** 取得最新加權指數（半小時快取） */
export async function getLatestTaiex(): Promise<MarketIndexSnapshot | null> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) {
    return cached.value;
  }

  let value: MarketIndexSnapshot | null = null;
  try {
    value = await fromFinMind();
  } catch {
    value = null;
  }
  if (!value) {
    try {
      value = await fromTwse();
    } catch {
      value = null;
    }
  }

  cached = { at: now, value };
  return value;
}
