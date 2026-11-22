/**
 * 集保戶股權分散 → 大戶持股比例
 *
 * 官網查詢頁常維修／改版，改走開放資料：
 * https://opendata.tdcc.com.tw/getOD.ashx?id=1-5（當週）
 * 若需「較上期」，再嘗試 GitHub 歸檔上一週快照。
 */

import type { ChipPeriodEntry, ChipPeriodFetchItem } from "./chip-cache";
import type { LargeHolderSnapshot } from "./types";

const TDCC_OPENDATA_URL = "https://opendata.tdcc.com.tw/getOD.ashx?id=1-5";
const TDCC_ARCHIVE_BASE =
  "https://raw.githubusercontent.com/wirelessr/tdcc-opendata-archive/main/snapshots";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * 持股分級代碼（開放資料）→ 該級距最低股數
 * 1:1-999 … 12:400001-600000 … 14:800001-1000000 … 15:1000001以上
 * 16 差異、17 合計略過
 */
const LEVEL_MIN_SHARES: Record<number, number> = {
  1: 1,
  2: 1_000,
  3: 5_001,
  4: 10_001,
  5: 15_001,
  6: 20_001,
  7: 30_001,
  8: 40_001,
  9: 50_001,
  10: 100_001,
  11: 200_001,
  12: 400_001,
  13: 600_001,
  14: 800_001,
  15: 1_000_001,
};

/** 400 張以上：自 400,001 股起 */
const TIER_400_MIN_SHARES = 400_001;
/** 1000 張級距慣例：自 800,001 股起 */
const TIER_1000_MIN_SHARES = 800_001;

interface LevelRow {
  level: number;
  percent: number;
  people: number | null;
}

function scaDateToIso(scaDate: string): string {
  return `${scaDate.slice(0, 4)}-${scaDate.slice(4, 6)}-${scaDate.slice(6, 8)}`;
}

function parseCsv(text: string): {
  date: string;
  byStock: Map<string, LevelRow[]>;
} {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    throw new Error("TDCC 開放資料為空");
  }

  const header = lines[0].split(",").map((h) => h.trim());
  const iDate = header.indexOf("資料日期");
  const iId = header.indexOf("證券代號");
  const iLevel = header.indexOf("持股分級");
  const iPct = header.findIndex((h) => h.includes("比例"));
  const iPeople = header.findIndex((h) => h.includes("人數"));
  if (iDate < 0 || iId < 0 || iLevel < 0 || iPct < 0) {
    throw new Error("TDCC 開放資料欄位異常");
  }

  const byStock = new Map<string, Map<number, LevelRow>>();
  let date = "";

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < header.length) continue;
    const d = cols[iDate]?.trim();
    const id = cols[iId]?.trim();
    const level = Number(cols[iLevel]?.trim());
    const percent = Number(cols[iPct]?.trim());
    if (!d || !id || !Number.isFinite(level) || !Number.isFinite(percent)) {
      continue;
    }
    if (!date) date = d;
    if (level < 1 || level > 15) continue;
    const peopleRaw = iPeople >= 0 ? Number(cols[iPeople]?.trim()) : NaN;
    const people = Number.isFinite(peopleRaw) ? peopleRaw : null;

    let levels = byStock.get(id);
    if (!levels) {
      levels = new Map();
      byStock.set(id, levels);
    }
    // 若有重複列，後寫覆蓋前寫（數值相同）
    levels.set(level, { level, percent, people });
  }

  if (!date || byStock.size === 0) {
    throw new Error("TDCC 開放資料無法解析");
  }

  const out = new Map<string, LevelRow[]>();
  for (const [id, levels] of byStock) {
    out.set(id, [...levels.values()]);
  }

  return { date, byStock: out };
}

function tierRatio(rows: LevelRow[], minShares: number): number {
  return rows.reduce((sum, row) => {
    const min = LEVEL_MIN_SHARES[row.level];
    if (min == null || min < minShares) return sum;
    return sum + row.percent;
  }, 0);
}

function tierPeople(rows: LevelRow[], minShares: number): number | null {
  const inTier = rows.filter((row) => {
    const min = LEVEL_MIN_SHARES[row.level];
    return min != null && min >= minShares;
  });
  if (inTier.length === 0 || inTier.every((row) => row.people == null)) {
    return null;
  }
  return inTier.reduce((sum, row) => sum + (row.people ?? 0), 0);
}

function buildPeriodsForStock(
  stockId: string,
  stockName: string,
  byDate: Map<string, LevelRow[]>
): ChipPeriodFetchItem {
  const dates = [...byDate.keys()].sort((a, b) => a.localeCompare(b));
  const periods: ChipPeriodEntry[] = dates.map((scaDate) => {
    const rows = byDate.get(scaDate)!;
    const people1000 = tierPeople(rows, TIER_1000_MIN_SHARES);
    const people400 = tierPeople(rows, TIER_400_MIN_SHARES);
    return {
      date: scaDateToIso(scaDate),
      ratios: {
        "1000": tierRatio(rows, TIER_1000_MIN_SHARES),
        "400": tierRatio(rows, TIER_400_MIN_SHARES),
      },
      ...(people1000 != null && people400 != null
        ? { people: { "1000": people1000, "400": people400 } }
        : {}),
    };
  });

  return { stockId, stockName, periods };
}

function buildSnapshotsForStock(
  stockId: string,
  stockName: string,
  byDate: Map<string, LevelRow[]>
): LargeHolderSnapshot[] {
  const { periods } = buildPeriodsForStock(stockId, stockName, byDate);
  if (periods.length === 0) return [];

  const sorted = [...periods].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const out: LargeHolderSnapshot[] = [];

  for (const tier of ["1000", "400"] as const) {
    const ratio = latest.ratios[tier];
    const prevRatio = prev ? prev.ratios[tier] : null;
    const people = latest.people?.[tier] ?? null;
    const prevPeople = prev?.people?.[tier] ?? null;
    out.push({
      id: `${stockId}-${latest.date}-${tier}`,
      date: latest.date,
      stockId,
      stockName,
      tier,
      ratio,
      people,
      wowChange: prevRatio != null ? ratio - prevRatio : null,
      wowPeople:
        people != null && prevPeople != null ? people - prevPeople : null,
    });
  }

  return out;
}

async function fetchCsvText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/csv,text/plain,*/*",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`TDCC 開放資料 HTTP ${res.status}`);
  }
  return res.text();
}

/** 嘗試從歸檔抓最新日之前的上一週五快照 */
async function fetchPreviousArchive(
  latestSca: string
): Promise<{ date: string; byStock: Map<string, LevelRow[]> } | null> {
  const y = Number(latestSca.slice(0, 4));
  const m = Number(latestSca.slice(4, 6));
  const d = Number(latestSca.slice(6, 8));
  const base = new Date(Date.UTC(y, m - 1, d));

  for (let week = 1; week <= 4; week++) {
    const prev = new Date(base);
    prev.setUTCDate(base.getUTCDate() - 7 * week);
    // 對齊到該週可能的週五（歸檔檔名多為資料日）
    for (let offset = 0; offset <= 3; offset++) {
      const tryDate = new Date(prev);
      tryDate.setUTCDate(prev.getUTCDate() - offset);
      const iso = tryDate.toISOString().slice(0, 10);
      const year = iso.slice(0, 4);
      const url = `${TDCC_ARCHIVE_BASE}/${year}/${iso}.csv`;
      try {
        const text = await fetchCsvText(url);
        if (!text.includes("資料日期") && !text.includes("證券代號")) continue;
        const parsed = parseCsv(text);
        if (parsed.date < latestSca) return parsed;
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

export async function getWatchlistLargeHolderSnapshotsFromTdcc(
  items: { stockId: string; stockName: string }[]
): Promise<{
  snapshots: LargeHolderSnapshot[];
  periods: ChipPeriodFetchItem[];
  error: string | null;
}> {
  if (items.length === 0) return { snapshots: [], periods: [], error: null };

  try {
    const latestText = await fetchCsvText(TDCC_OPENDATA_URL);
    const latest = parseCsv(latestText);
    const previous = await fetchPreviousArchive(latest.date).catch(() => null);

    const all: LargeHolderSnapshot[] = [];
    const periodItems: ChipPeriodFetchItem[] = [];
    let missing = 0;

    for (const item of items) {
      const byDate = new Map<string, LevelRow[]>();
      const latestRows = latest.byStock.get(item.stockId);
      if (!latestRows?.length) {
        missing += 1;
        continue;
      }
      byDate.set(latest.date, latestRows);

      const prevRows = previous?.byStock.get(item.stockId);
      if (previous && prevRows?.length) {
        byDate.set(previous.date, prevRows);
      }

      const periodData = buildPeriodsForStock(
        item.stockId,
        item.stockName,
        byDate
      );
      periodItems.push(periodData);
      all.push(
        ...buildSnapshotsForStock(item.stockId, item.stockName, byDate)
      );
    }

    const error =
      all.length === 0
        ? missing === items.length
          ? "追蹤列表股票在集保開放資料中尚無持股分級"
          : "無法取得大戶籌碼資料"
        : null;

    return {
      snapshots: all.sort((a, b) => {
        const tierOrder = a.tier === "1000" ? 0 : 1;
        const tierOrderB = b.tier === "1000" ? 0 : 1;
        if (tierOrder !== tierOrderB) return tierOrder - tierOrderB;
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return a.stockId.localeCompare(b.stockId);
      }),
      periods: periodItems,
      error,
    };
  } catch (e) {
    return {
      snapshots: [],
      periods: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
