import {
  parseSheetCells,
  parseSharedStrings,
  unzipXlsx,
  excelSerialToIso,
} from "./xlsx-min";
import {
  remoteFetchInit,
  sortPoints,
  type MacroFetchOpts,
  type MacroPoint,
  type MacroSeries,
} from "./macro-series";

const WP_MEDIA =
  "https://www.cier.edu.tw/wp-json/wp/v2/media?search=PMI%20Historical&per_page=10";

interface WpMedia {
  source_url?: string;
  title?: { rendered?: string };
}

async function latestAdjustedXlsxUrl(fresh?: boolean): Promise<string> {
  const res = await fetch(WP_MEDIA, remoteFetchInit(fresh, 15_000));
  if (!res.ok) throw new Error(`中經院 PMI 目錄 HTTP ${res.status}`);
  const json = (await res.json()) as WpMedia[];
  const hit = json.find((m) =>
    /Seasonally-Adjusted\.xlsx$/i.test(m.source_url ?? "")
  );
  if (!hit?.source_url) throw new Error("找不到中經院季節調整 PMI 檔");
  return hit.source_url;
}

function parseCompositePmi(buf: Buffer): MacroPoint[] {
  const files = unzipXlsx(buf);
  const sheet = files.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("中經院 PMI 試算表格式變更");
  const ssXml = files.get("xl/sharedStrings.xml");
  const shared = ssXml ? parseSharedStrings(ssXml.toString("utf8")) : [];
  const cells = parseSheetCells(sheet.toString("utf8"), shared);
  const byRow = new Map<number, { a?: string; b?: string }>();
  for (const c of cells) {
    if (c.col !== "A" && c.col !== "B") continue;
    const row = byRow.get(c.row) ?? {};
    if (c.col === "A") row.a = c.value;
    else row.b = c.value;
    byRow.set(c.row, row);
  }
  const points: MacroPoint[] = [];
  for (const row of byRow.values()) {
    const serial = Number.parseFloat(row.a ?? "");
    const value = Number.parseFloat(row.b ?? "");
    const date = excelSerialToIso(serial);
    if (!date || !Number.isFinite(value)) continue;
    points.push({ date, value });
  }
  return sortPoints(points);
}

/** 台灣製造業 PMI（中經院，季節調整綜合指數） */
export async function getTaiwanPmi(
  opts: MacroFetchOpts = {}
): Promise<MacroSeries> {
  const url = await latestAdjustedXlsxUrl(opts.fresh);
  const res = await fetch(url, remoteFetchInit(opts.fresh, 20_000));
  if (!res.ok) throw new Error(`中經院 PMI 檔案 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const points = parseCompositePmi(buf);
  if (points.length === 0) throw new Error("中經院 PMI 無有效資料");
  return {
    points,
    source: "中經院台灣製造業 PMI（季節調整）",
  };
}
