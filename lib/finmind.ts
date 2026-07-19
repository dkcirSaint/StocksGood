import type {
  StockInfo,
  MonthlyRevenuePoint,
  QuarterlyReport,
  FinancialMetric,
  DailyPrice,
} from "./types";

const FINMIND_API = "https://api.finmindtrade.com/api/v4/data";

interface FinMindResponse<T> {
  msg: string;
  status: number;
  data: T[];
}

export type FinMindFetchOpts = {
  /** true：略過 Next Data Cache，強制向 FinMind 拉最新資料（定時掃描前更新用） */
  fresh?: boolean;
};

async function finmind<T>(
  dataset: string,
  params: Record<string, string> = {},
  opts: FinMindFetchOpts = {}
): Promise<T[]> {
  const url = new URL(FINMIND_API);
  url.searchParams.set("dataset", dataset);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  const token = process.env.FINMIND_TOKEN;
  const headers = token
    ? { Authorization: `Bearer ${token.trim()}` }
    : undefined;

  const res = await fetch(url.toString(), {
    headers,
    ...(opts.fresh
      ? { cache: "no-store" as const }
      : // 一般查詢：半小時內可重用快取
        { next: { revalidate: 60 * 30 } }),
  });
  if (!res.ok) {
    throw new Error(`FinMind ${dataset} 回應 HTTP ${res.status}`);
  }
  const json = (await res.json()) as FinMindResponse<T>;
  if (json.status !== 200) {
    throw new Error(`FinMind ${dataset} 錯誤：${json.msg}`);
  }
  return json.data ?? [];
}

let stockListCache: { at: number; data: StockInfo[] } | null = null;

export async function getStockList(): Promise<StockInfo[]> {
  const now = Date.now();
  if (stockListCache && now - stockListCache.at < 1000 * 60 * 60 * 12) {
    return stockListCache.data;
  }
  const raw = await finmind<{
    industry_category: string;
    stock_id: string;
    stock_name: string;
    type: string;
  }>("TaiwanStockInfo");

  // 去重（同一檔可能有多筆），只保留 4 碼數字代號的個股/ETF
  const seen = new Map<string, StockInfo>();
  for (const r of raw) {
    if (!r.stock_id || seen.has(r.stock_id)) continue;
    if (!/^\d{4,6}$/.test(r.stock_id)) continue;
    seen.set(r.stock_id, {
      stock_id: r.stock_id,
      stock_name: r.stock_name,
      industry_category: r.industry_category,
      type: r.type,
    });
  }
  const data = Array.from(seen.values());
  stockListCache = { at: now, data };
  return data;
}

/** 以代號或名稱查詢，回傳最相符的個股 */
export async function findStock(query: string): Promise<StockInfo | null> {
  const list = await getStockList();
  const q = query.trim();
  if (!q) return null;

  // 1) 代號完全相符
  const byId = list.find((s) => s.stock_id === q);
  if (byId) return byId;

  // 2) 名稱完全相符
  const byName = list.find((s) => s.stock_name === q);
  if (byName) return byName;

  // 3) 名稱包含
  const contains = list.filter((s) => s.stock_name.includes(q));
  if (contains.length > 0) {
    // 優先較短名稱（通常為主體公司）
    contains.sort((a, b) => a.stock_name.length - b.stock_name.length);
    return contains[0];
  }

  // 4) 代號前綴
  const byPrefix = list.find((s) => s.stock_id.startsWith(q));
  return byPrefix ?? null;
}

function isoYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** 取得近 N 個月的月營收，並計算月增率與年增率 */
export async function getMonthlyRevenue(
  stockId: string,
  months = 3
): Promise<MonthlyRevenuePoint[]> {
  // 為了計算年增率，需多抓約 15 個月資料
  const start = new Date();
  start.setMonth(start.getMonth() - (months + 14));
  const startDate = start.toISOString().slice(0, 10);

  const raw = await finmind<{
    revenue: number;
    revenue_month: number;
    revenue_year: number;
  }>("TaiwanStockMonthRevenue", { data_id: stockId, start_date: startDate });

  // 依年月排序
  const sorted = raw
    .map((r) => ({
      year: r.revenue_year,
      month: r.revenue_month,
      revenue: r.revenue,
    }))
    .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));

  const index = new Map<string, number>();
  for (const r of sorted) index.set(isoYearMonth(r.year, r.month), r.revenue);

  const result: MonthlyRevenuePoint[] = [];
  const lastN = sorted.slice(-months);
  for (const r of lastN) {
    const prevMonthDate = new Date(r.year, r.month - 2, 1);
    const prevKey = isoYearMonth(
      prevMonthDate.getFullYear(),
      prevMonthDate.getMonth() + 1
    );
    const yoyKey = isoYearMonth(r.year - 1, r.month);

    const prev = index.get(prevKey);
    const yoy = index.get(yoyKey);

    result.push({
      yearMonth: isoYearMonth(r.year, r.month),
      revenueYear: r.year,
      revenueMonth: r.month,
      revenue: r.revenue,
      momGrowth:
        prev && prev !== 0 ? (r.revenue - prev) / prev : null,
      yoyGrowth: yoy && yoy !== 0 ? (r.revenue - yoy) / yoy : null,
    });
  }
  // 由新到舊
  return result.reverse();
}

/** 查 FinMind 上該股最新已公告的營收月份 */
export async function getLatestRevenueMonth(
  stockId: string
): Promise<string | null> {
  const start = new Date();
  start.setMonth(start.getMonth() - 5);
  const raw = await finmind<{
    revenue_year: number;
    revenue_month: number;
  }>("TaiwanStockMonthRevenue", {
    data_id: stockId,
    start_date: start.toISOString().slice(0, 10),
  });
  if (raw.length === 0) return null;
  let best = raw[0];
  for (const r of raw) {
    const cur = r.revenue_year * 12 + r.revenue_month;
    const bestKey = best.revenue_year * 12 + best.revenue_month;
    if (cur > bestKey) best = r;
  }
  return isoYearMonth(best.revenue_year, best.revenue_month);
}

/** 查 FinMind 上該股最新已公告的季報季底日 */
export async function getLatestQuarterDate(
  stockId: string
): Promise<string | null> {
  const start = new Date();
  start.setMonth(start.getMonth() - 18);
  const raw = await finmind<{ date: string }>(
    "TaiwanStockFinancialStatements",
    { data_id: stockId, start_date: start.toISOString().slice(0, 10) }
  );
  const dates = [...new Set(raw.map((r) => r.date))].sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

/** 查 FinMind 上該股最新收盤日 */
export async function getLatestPriceDate(
  stockId: string
): Promise<string | null> {
  const start = new Date();
  start.setDate(start.getDate() - 14);
  const raw = await finmind<{ date: string; close: number }>(
    "TaiwanStockPrice",
    { data_id: stockId, start_date: start.toISOString().slice(0, 10) }
  );
  const dates = raw.filter((r) => r.close > 0).map((r) => r.date);
  if (dates.length === 0) return null;
  return dates.sort().pop() ?? null;
}

/** 取得每日 K 線資料（含成交量）。預設抓約 14 個月，供 1 年顯示與 MACD 暖身 */
export async function getDailyPrices(
  stockId: string,
  days = 400,
  opts: FinMindFetchOpts = {}
): Promise<DailyPrice[]> {
  const start = new Date();
  start.setDate(start.getDate() - days);
  return getDailyPricesSince(
    stockId,
    start.toISOString().slice(0, 10),
    opts
  );
}

/** 自指定日期起取得 K 線（含當日） */
export async function getDailyPricesSince(
  stockId: string,
  startDate: string,
  opts: FinMindFetchOpts = {}
): Promise<DailyPrice[]> {
  const raw = await finmind<{
    date: string;
    open: number;
    max: number;
    min: number;
    close: number;
    Trading_Volume: number;
  }>(
    "TaiwanStockPrice",
    { data_id: stockId, start_date: startDate },
    opts
  );

  return raw
    .map((r) => ({
      date: r.date,
      open: r.open,
      high: r.max,
      low: r.min,
      close: r.close,
      volume: r.Trading_Volume,
    }))
    .filter((d) => d.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// 季報要呈現的關鍵科目（FinMind type -> 顯示名稱）
const FINANCIAL_FIELDS: { key: string; label: string }[] = [
  { key: "Revenue", label: "營業收入" },
  { key: "GrossProfit", label: "營業毛利" },
  { key: "OperatingIncome", label: "營業利益" },
  { key: "PreTaxIncome", label: "稅前淨利" },
  { key: "IncomeAfterTaxes", label: "稅後淨利" },
  { key: "EPS", label: "每股盈餘 (EPS)" },
];

function quarterLabel(date: string): string {
  const [y, m] = date.split("-").map(Number);
  const q = Math.ceil(m / 3);
  return `${y} Q${q}`;
}

/** 取得近 N 季季報（預設四季） */
export async function getQuarterlyReports(
  stockId: string,
  quarters = 4
): Promise<QuarterlyReport[]> {
  const start = new Date();
  start.setMonth(start.getMonth() - 18); // 約 6 季資料供擷取四季
  const startDate = start.toISOString().slice(0, 10);

  const raw = await finmind<{
    date: string;
    type: string;
    value: number;
    origin_name: string;
  }>("TaiwanStockFinancialStatements", {
    data_id: stockId,
    start_date: startDate,
  });

  // 依季底日期分組
  const byDate = new Map<string, Map<string, number>>();
  for (const r of raw) {
    if (!byDate.has(r.date)) byDate.set(r.date, new Map());
    byDate.get(r.date)!.set(r.type, r.value);
  }

  const dates = Array.from(byDate.keys()).sort(); // 舊到新
  const lastDates = dates.slice(-quarters);

  const reports: QuarterlyReport[] = lastDates.map((date) => {
    const metricMap = byDate.get(date)!;
    const metrics: FinancialMetric[] = FINANCIAL_FIELDS.map((f) => ({
      key: f.key,
      label: f.label,
      value: metricMap.has(f.key) ? metricMap.get(f.key)! : null,
    }));
    return { quarter: quarterLabel(date), date, metrics };
  });

  // 由新到舊
  return reports.reverse();
}
