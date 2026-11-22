import {
  remoteFetchInit,
  sortPoints,
  type MacroFetchOpts,
  type MacroPoint,
  type MacroSeries,
} from "./macro-series";

const BELLWETHER = [
  "https://raw.githubusercontent.com/RealMaxPower/bellwether/main/data/pmi-historical.json",
  "https://raw.githubusercontent.com/RealMaxPower/bellwether/main/data/pmi-wayback.json",
  "https://raw.githubusercontent.com/RealMaxPower/bellwether/main/data/pmi-curated.json",
];

const PRN_ISM =
  "https://www.prnewswire.com/news/institute-for-supply-management/";

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

interface BellwetherFile {
  observations?: Array<{ date?: string; value?: number }>;
}

function parseBellwether(text: string): MacroPoint[] {
  const json = JSON.parse(text) as BellwetherFile;
  const points: MacroPoint[] = [];
  for (const o of json.observations ?? []) {
    const date = (o.date ?? "").slice(0, 10);
    const value = Number(o.value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) continue;
    points.push({ date, value });
  }
  return points;
}

function parsePrnewswire(html: string): MacroPoint[] {
  const re =
    /Manufacturing PMI(?:®|&reg;)? at ([\d.]+)%?;\s*([A-Za-z]+)\s+(\d{4})/g;
  const points: MacroPoint[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const value = Number.parseFloat(m[1]);
    const mm = MONTHS[m[2].toLowerCase()];
    if (!mm || !Number.isFinite(value)) continue;
    points.push({ date: `${m[3]}-${mm}-01`, value });
  }
  return points;
}

async function fetchText(
  url: string,
  fresh?: boolean,
  timeoutMs = 15_000
): Promise<string | null> {
  try {
    const res = await fetch(url, remoteFetchInit(fresh, timeoutMs));
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** 美國 ISM 製造業 PMI（榮枯線 50） */
export async function getUsPmi(opts: MacroFetchOpts = {}): Promise<MacroSeries> {
  const [hist, way, curated, prn] = await Promise.all([
    ...BELLWETHER.map((url) => fetchText(url, opts.fresh)),
    fetchText(PRN_ISM, opts.fresh, 20_000),
  ]);

  const merged: MacroPoint[] = [];
  for (const text of [hist, way, curated]) {
    if (!text) continue;
    try {
      merged.push(...parseBellwether(text));
    } catch {
      /* 單一檔失敗時略過 */
    }
  }
  if (prn) merged.push(...parsePrnewswire(prn));

  const points = sortPoints(merged);
  if (points.length === 0) throw new Error("美國 PMI 無有效資料");
  return {
    points,
    source: "ISM 製造業 PMI",
  };
}
