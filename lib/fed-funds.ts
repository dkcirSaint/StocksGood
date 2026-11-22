import {
  parseDateValueCsv,
  remoteFetchInit,
  type MacroFetchOpts,
} from "./macro-series";

const NY_FED_SEARCH =
  "https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json";
const NY_FED_LAST_N =
  "https://markets.newyorkfed.org/api/rates/unsecured/effr/last/520.json";

const FRED_CSV = (id: string, start: string) =>
  `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${start}`;

export interface FedFundsPoint {
  date: string;
  targetFrom: number;
  targetTo: number;
  effective: number | null;
}

export interface FedFundsQuote {
  /** 有效利率日期 YYYY-MM-DD */
  date: string;
  /** 目標區間下緣（%） */
  targetFrom: number;
  /** 目標區間上緣（%） */
  targetTo: number;
  /** 有效聯邦基金利率（%）；缺資料為 null */
  effective: number | null;
  source: string;
  points: FedFundsPoint[];
}

type NyFedRow = {
  effectiveDate?: string;
  type?: string;
  percentRate?: number;
  targetRateFrom?: number;
  targetRateTo?: number;
};

function num(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function twoYearsAgoYmd(now = new Date()): string {
  return ymdUtc(
    new Date(Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), now.getUTCDate()))
  );
}

function sortPoints(points: FedFundsPoint[]): FedFundsPoint[] {
  const byDate = new Map<string, FedFundsPoint>();
  for (const p of points) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) continue;
    byDate.set(p.date, p);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function toQuote(points: FedFundsPoint[], source: string): FedFundsQuote | null {
  const last = points[points.length - 1];
  if (!last) return null;
  return { ...last, source, points };
}

function parseNyFedRates(json: { refRates?: NyFedRow[] }): FedFundsPoint[] {
  const out: FedFundsPoint[] = [];
  for (const row of json.refRates ?? []) {
    if ((row.type ?? "EFFR").toUpperCase() !== "EFFR") continue;
    const date = row.effectiveDate ?? "";
    const targetFrom = num(row.targetRateFrom);
    const targetTo = num(row.targetRateTo);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || targetFrom == null || targetTo == null) {
      continue;
    }
    out.push({
      date,
      targetFrom,
      targetTo,
      effective: num(row.percentRate),
    });
  }
  return sortPoints(out);
}

async function nyFedJson(
  url: string,
  fresh?: boolean
): Promise<{ refRates?: NyFedRow[] }> {
  const res = await fetch(url, {
    ...remoteFetchInit(fresh, 15_000),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`紐約聯準會利率 HTTP ${res.status}`);
  return (await res.json()) as { refRates?: NyFedRow[] };
}

async function fromNyFed(fresh?: boolean): Promise<FedFundsQuote | null> {
  const start = twoYearsAgoYmd();
  const end = ymdUtc(new Date());
  let points: FedFundsPoint[] = [];
  try {
    const json = await nyFedJson(
      `${NY_FED_SEARCH}?startDate=${start}&endDate=${end}`,
      fresh
    );
    points = parseNyFedRates(json);
  } catch {
    points = [];
  }
  if (points.length === 0) {
    points = parseNyFedRates(await nyFedJson(NY_FED_LAST_N, fresh));
  }
  return toQuote(points, "紐約聯準會");
}

function parseFredObsAll(
  jsonText: string
): Array<{ date: string; value: number }> {
  const json = JSON.parse(jsonText) as {
    observations?: Array<{ date?: string; value?: string }>;
  };
  const out: Array<{ date: string; value: number }> = [];
  for (const o of json.observations ?? []) {
    const date = o.date ?? "";
    if (o.value === "." || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const value = Number.parseFloat(o.value ?? "");
    if (!Number.isFinite(value)) continue;
    out.push({ date, value });
  }
  return out;
}

async function fredSeries(
  seriesId: string,
  start: string,
  fresh?: boolean
): Promise<Array<{ date: string; value: number }>> {
  const key = process.env.FRED_API_KEY?.trim();
  if (!key) return [];
  const url =
    `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}` +
    `&file_type=json&sort_order=asc&observation_start=${start}` +
    `&api_key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    ...remoteFetchInit(fresh, 12_000),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`FRED API HTTP ${res.status}`);
  return parseFredObsAll(await res.text());
}

function mergeFred(
  lower: Array<{ date: string; value: number }>,
  upper: Array<{ date: string; value: number }>,
  eff: Array<{ date: string; value: number }>
): FedFundsPoint[] {
  const lMap = new Map(lower.map((p) => [p.date, p.value]));
  const uMap = new Map(upper.map((p) => [p.date, p.value]));
  const eMap = new Map(eff.map((p) => [p.date, p.value]));
  const dates = [
    ...new Set([...lMap.keys(), ...uMap.keys(), ...eMap.keys()]),
  ].sort();
  const out: FedFundsPoint[] = [];
  let l: number | null = null;
  let u: number | null = null;
  for (const date of dates) {
    if (lMap.has(date)) l = lMap.get(date) ?? l;
    if (uMap.has(date)) u = uMap.get(date) ?? u;
    if (l == null || u == null) continue;
    out.push({
      date,
      targetFrom: l,
      targetTo: u,
      effective: eMap.has(date) ? (eMap.get(date) ?? null) : null,
    });
  }
  return sortPoints(out);
}

async function fromFredApi(fresh?: boolean): Promise<FedFundsQuote | null> {
  const start = twoYearsAgoYmd();
  const [lower, upper, eff] = await Promise.all([
    fredSeries("DFEDTARL", start, fresh),
    fredSeries("DFEDTARU", start, fresh),
    fredSeries("DFF", start, fresh),
  ]);
  if (lower.length === 0 || upper.length === 0) return null;
  return toQuote(
    mergeFred(lower, upper, eff),
    "FRED（DFEDTARL／DFEDTARU／DFF）"
  );
}

async function fredCsvSeries(
  seriesId: string,
  start: string,
  fresh?: boolean
): Promise<Array<{ date: string; value: number }>> {
  const res = await fetch(FRED_CSV(seriesId, start), {
    ...remoteFetchInit(fresh, 15_000),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`FRED CSV HTTP ${res.status}`);
  return parseDateValueCsv(await res.text());
}

async function fromFredCsv(fresh?: boolean): Promise<FedFundsQuote | null> {
  const start = twoYearsAgoYmd();
  const [lower, upper, eff] = await Promise.all([
    fredCsvSeries("DFEDTARL", start, fresh),
    fredCsvSeries("DFEDTARU", start, fresh),
    fredCsvSeries("DFF", start, fresh),
  ]);
  if (lower.length === 0 || upper.length === 0) return null;
  return toQuote(
    mergeFred(lower, upper, eff),
    "FRED（DFEDTARL／DFEDTARU／DFF）"
  );
}

/** 目前聯邦基金利率：目標區間、有效利率，以及近兩年日資料 */
export async function getFedFundsQuote(
  opts: MacroFetchOpts = {}
): Promise<FedFundsQuote> {
  const fresh = opts.fresh;
  const attempts: Array<() => Promise<FedFundsQuote | null>> = [
    () => fromNyFed(fresh),
    () => fromFredApi(fresh),
    () => fromFredCsv(fresh),
  ];
  let lastError: unknown;
  for (const run of attempts) {
    try {
      const quote = await run();
      if (quote) return quote;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("聯邦基金利率無有效資料");
}
