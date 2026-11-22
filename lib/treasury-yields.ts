/**
 * 美國公債殖利率：取自美國財政部每日殖利率曲線（Daily Treasury Par Yield Curve Rates）。
 * 官方僅公布每日收盤值，無開高低。
 */

export interface TreasuryYieldPoint {
  /** YYYY-MM-DD（美東日期） */
  date: string;
  /** 2 年期殖利率（%） */
  y2: number;
  /** 10 年期殖利率（%） */
  y10: number;
}

function csvUrl(year: number): string {
  return (
    "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/" +
    `daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve` +
    `&field_tdr_date_value=${year}&page&_format=csv`
  );
}

function parseCsvLine(line: string): string[] {
  return line.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
}

/** MM/DD/YYYY → YYYY-MM-DD */
function toIsoDate(mdy: string): string | null {
  const m = mdy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

export type TreasuryYieldFetchOpts = {
  /** true：略過 Next Data Cache，強制向財政部拉最新資料 */
  fresh?: boolean;
};

function remoteFetchInit(fresh?: boolean): RequestInit {
  return {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FindFortune/1.0)" },
    ...(fresh
      ? { cache: "no-store" as const }
      : { next: { revalidate: 60 * 60 } }),
  };
}

async function fetchYear(
  year: number,
  fresh?: boolean
): Promise<TreasuryYieldPoint[]> {
  const res = await fetch(csvUrl(year), remoteFetchInit(fresh));
  if (!res.ok) throw new Error(`美國財政部殖利率 HTTP ${res.status}`);
  const lines = (await res.text()).split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  // 依欄名取值，財政部曾調整欄位（例如新增 1.5 Month），不可寫死欄位位置
  const header = parseCsvLine(lines[0]);
  const dateIdx = header.indexOf("Date");
  const y2Idx = header.indexOf("2 Yr");
  const y10Idx = header.indexOf("10 Yr");
  if (dateIdx < 0 || y2Idx < 0 || y10Idx < 0) {
    throw new Error("美國財政部殖利率欄位格式變更");
  }

  const out: TreasuryYieldPoint[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const date = toIsoDate(cols[dateIdx] ?? "");
    const y2 = Number.parseFloat(cols[y2Idx] ?? "");
    const y10 = Number.parseFloat(cols[y10Idx] ?? "");
    if (!date || !Number.isFinite(y2) || !Number.isFinite(y10)) continue;
    out.push({ date, y2, y10 });
  }
  return out;
}

/** 取今年與去年的資料（足以涵蓋近一年），依日期遞增排序 */
export async function getTreasuryYields(
  opts: TreasuryYieldFetchOpts = {}
): Promise<TreasuryYieldPoint[]> {
  const year = new Date().getUTCFullYear();
  const [prev, curr] = await Promise.all([
    fetchYear(year - 1, opts.fresh),
    fetchYear(year, opts.fresh),
  ]);
  const byDate = new Map<string, TreasuryYieldPoint>();
  for (const p of [...prev, ...curr]) byDate.set(p.date, p);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
