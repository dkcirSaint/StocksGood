export interface MacroPoint {
  /** YYYY-MM-DD */
  date: string;
  value: number;
}

export interface MacroSeries {
  points: MacroPoint[];
  source: string;
}

export type MacroFetchOpts = {
  /** true：略過 Next Data Cache，強制向來源拉最新資料 */
  fresh?: boolean;
};

export function remoteFetchInit(
  fresh?: boolean,
  timeoutMs = 20_000
): RequestInit {
  return {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FindFortune/1.0)" },
    ...(fresh
      ? { cache: "no-store" as const, signal: AbortSignal.timeout(timeoutMs) }
      : { next: { revalidate: 60 * 60 } }),
  };
}

export function sortPoints(points: MacroPoint[]): MacroPoint[] {
  const byDate = new Map<string, MacroPoint>();
  for (const p of points) {
    if (!p.date || !Number.isFinite(p.value)) continue;
    byDate.set(p.date, p);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function parseDateValueCsv(text: string): MacroPoint[] {
  const points: MacroPoint[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^date[,;]/i.test(line)) continue;
    const m = line.match(/^(\d{4}-\d{2}-\d{2})[,;\s]+(\d+(?:\.\d+)?|\.)/);
    if (!m || m[2] === ".") continue;
    const value = Number.parseFloat(m[2]);
    if (!Number.isFinite(value)) continue;
    points.push({ date: m[1], value });
  }
  return sortPoints(points);
}
