import {
  parseDateValueCsv,
  remoteFetchInit,
  sortPoints,
  type MacroFetchOpts,
  type MacroPoint,
  type MacroSeries,
} from "./macro-series";

const FRED_ID = "BAMLH0A0HYM2";
const GH_CSV =
  "https://raw.githubusercontent.com/matsutoushi/nk225-option-site/main/data/fred_cache/BAMLH0A0HYM2.csv";

function parseFredObservations(jsonText: string): MacroPoint[] {
  const json = JSON.parse(jsonText) as {
    observations?: Array<{ date?: string; value?: string }>;
  };
  const points: MacroPoint[] = [];
  for (const o of json.observations ?? []) {
    const date = o.date ?? "";
    if (o.value === "." || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const value = Number.parseFloat(o.value ?? "");
    if (!Number.isFinite(value)) continue;
    points.push({ date, value });
  }
  return sortPoints(points);
}

async function fromFredApi(fresh?: boolean): Promise<MacroPoint[] | null> {
  const key = process.env.FRED_API_KEY?.trim();
  if (!key) return null;
  const url =
    `https://api.stlouisfed.org/fred/series/observations?series_id=${FRED_ID}` +
    `&file_type=json&api_key=${encodeURIComponent(key)}&sort_order=asc`;
  const res = await fetch(url, {
    ...remoteFetchInit(fresh, 12_000),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`FRED API HTTP ${res.status}`);
  return parseFredObservations(await res.text());
}

async function fromGithub(fresh?: boolean): Promise<MacroPoint[]> {
  const res = await fetch(GH_CSV, remoteFetchInit(fresh, 15_000));
  if (!res.ok) throw new Error(`HY 利差資料 HTTP ${res.status}`);
  return parseDateValueCsv(await res.text());
}

/** ICE BofA 美國高收益債選擇權調整利差（OAS，%） */
export async function getHySpread(
  opts: MacroFetchOpts = {}
): Promise<MacroSeries> {
  let points: MacroPoint[] | null = null;
  try {
    points = await fromFredApi(opts.fresh);
  } catch {
    points = null;
  }
  if (!points || points.length === 0) {
    points = await fromGithub(opts.fresh);
  }
  if (points.length === 0) throw new Error("HY 利差無有效資料");
  return {
    points,
    source: "ICE BofA 美國高收益債 OAS（FRED BAMLH0A0HYM2）",
  };
}
