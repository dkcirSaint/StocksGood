import type {
  StockInfo,
  InvestorConference,
  ShareholderMeeting,
} from "./types";

const MOPS_BASE = "https://mopsov.twse.com.tw";
const FILE_BASE = `${MOPS_BASE}/nas/STR`;

/** FinMind 市場別 -> MOPS TYPEK */
function typekFor(type: string): string {
  switch (type) {
    case "twse":
      return "sii"; // 上市
    case "tpex":
      return "otc"; // 上櫃
    default:
      return "rotc"; // 興櫃及其他
  }
}

function rocToIso(roc: string): string | null {
  // 例如 114/01/16
  const m = roc.match(/(\d{2,3})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const year = parseInt(m[1], 10) + 1911;
  const month = m[2].padStart(2, "0");
  const day = m[3].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function fileNameFrom(cell: string): string | null {
  const m = cell.match(/fileName\.value\s*=\s*"([^"]+)"/);
  if (m && m[1]) return m[1];
  // 有些直接是純文字檔名
  const txt = stripTags(cell);
  if (/\.pdf$/i.test(txt)) return txt;
  return null;
}

function parseConferences(html: string, stockId: string): InvestorConference[] {
  const rows = html.match(/data-type='body'[^>]*>([\s\S]*?)<\/tr>/g) ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const results: InvestorConference[] = [];

  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(
      (m) => m[1]
    );
    if (cells.length < 6) continue;

    const code = stripTags(cells[0]);
    if (code !== stockId) continue;

    const rocDate = stripTags(cells[2]);
    const iso = rocToIso(rocDate);
    if (!iso) continue;

    const zhFile = fileNameFrom(cells[6] ?? "");
    const enFile = fileNameFrom(cells[7] ?? "");

    results.push({
      date: iso,
      rocDate,
      time: stripTags(cells[3] ?? ""),
      location: stripTags(cells[4] ?? ""),
      summary: stripTags(cells[5] ?? ""),
      presentationUrlZh: zhFile ? `${FILE_BASE}/${zhFile}` : null,
      presentationUrlEn: enFile ? `${FILE_BASE}/${enFile}` : null,
      videoLink: stripTags(cells[8] ?? "") || null,
      videoInfo: stripTags(cells[9] ?? "") || null,
      held: iso <= today,
    });
  }
  return results;
}

async function fetchConferencePage(
  stockId: string,
  typek: string,
  rocYear: number
): Promise<string> {
  const url = `${MOPS_BASE}/mops/web/t100sb02_1?encodeURIComponent=1&step=1&firstin=1&off=1&TYPEK=${typek}&year=${rocYear}&month=&co_id=${stockId}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Referer: `${MOPS_BASE}/mops/web/t100sb02_1`,
    },
    next: { revalidate: 60 * 30 },
  });
  if (!res.ok) throw new Error(`MOPS 法說會頁面 HTTP ${res.status}`);
  return res.text();
}

/** 取得公司近期法人說明會（含已舉行者的簡報連結） */
export async function getInvestorConferences(
  stock: StockInfo
): Promise<InvestorConference[]> {
  const nowRocYear = new Date().getFullYear() - 1911;
  const years = [nowRocYear, nowRocYear - 1];
  const typeks = [typekFor(stock.type), "sii", "otc", "rotc"];
  // 去重 TYPEK 順序
  const triedTypek = new Set<string>();

  const map = new Map<string, InvestorConference>();

  for (const typek of typeks) {
    if (triedTypek.has(typek)) continue;
    triedTypek.add(typek);

    let foundForTypek = false;
    for (const year of years) {
      try {
        const html = await fetchConferencePage(stock.stock_id, typek, year);
        const list = parseConferences(html, stock.stock_id);
        for (const c of list) {
          map.set(`${c.date}-${c.time}`, c);
          foundForTypek = true;
        }
      } catch {
        // 忽略單一年度/市場別失敗，續抓其他組合
      }
    }
    // 若已在正確市場別找到資料，不需再嘗試其他 TYPEK
    if (foundForTypek) break;
  }

  const all = Array.from(map.values()).sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  return pickLatestConference(all);
}

/** 優先回傳最近一場即將舉行的法說會，否則回傳最近一場已舉行者 */
function pickLatestConference(
  list: InvestorConference[]
): InvestorConference[] {
  if (list.length === 0) return [];
  const upcoming = list
    .filter((c) => !c.held)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (upcoming.length > 0) return [upcoming[0]];
  return [list[0]];
}

function firstDateCellIndex(cells: string[], from: number): number {
  for (let i = from; i < cells.length; i++) {
    if (/\d{2,3}\/\d{1,2}\/\d{1,2}/.test(stripTags(cells[i]))) return i;
  }
  return -1;
}

function parseShareholderMeetings(
  html: string,
  stockId: string
): ShareholderMeeting[] {
  const today = new Date().toISOString().slice(0, 10);
  const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) ?? [];
  const results: ShareholderMeeting[] = [];

  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
      stripTags(m[1])
    );
    if (cells.length < 9) continue;
    if (cells[0] !== stockId) continue;

    // 會議日期為「種類」之後的第一個民國日期欄位
    const dateIdx = firstDateCellIndex(cells, 3);
    if (dateIdx === -1) continue;
    const rocDate = cells[dateIdx];
    const iso = rocToIso(rocDate);
    if (!iso) continue;

    const type = cells[3] || "股東會";
    const method = cells[dateIdx + 3] ?? "";
    const location = cells[dateIdx + 4] ?? "";
    const boardReelection = cells[dateIdx + 6] ?? "";
    const evotingPeriod = cells[dateIdx + 10] ?? "";
    const evotingPlatform = cells[dateIdx + 11] ?? "";
    const evotingUrl = cells[dateIdx + 12] ?? "";
    const announce = cells[dateIdx + 14] ?? "";

    results.push({
      type,
      date: iso,
      rocDate,
      method,
      location,
      boardReelection,
      evotingPeriod: evotingPeriod || null,
      evotingPlatform: evotingPlatform || null,
      evotingUrl: /^https?:/.test(evotingUrl) ? evotingUrl : null,
      announceDate: /\d{2,3}\/\d{1,2}\/\d{1,2}/.test(announce)
        ? announce
        : null,
      held: iso <= today,
    });
  }
  return results;
}

async function fetchShareholderMonth(
  stockId: string,
  typek: string,
  rocYear: number,
  month: number
): Promise<ShareholderMeeting[]> {
  const mm = String(month).padStart(2, "0");
  const res = await fetch(`${MOPS_BASE}/mops/web/ajax_t108sb31`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Referer: `${MOPS_BASE}/mops/web/t108sb31_q1`,
    },
    body: new URLSearchParams({
      run: "Y",
      step: "1",
      firstin: "1",
      TYPEK: typek,
      YEAR: String(rocYear),
      co_id1: stockId,
      co_id2: stockId,
      MONTH: mm,
      SDAY: "",
      EDAY: "",
      SK: "",
    }).toString(),
    next: { revalidate: 60 * 30 },
  });
  if (!res.ok) throw new Error(`MOPS 股東會頁面 HTTP ${res.status}`);
  return parseShareholderMeetings(await res.text(), stockId);
}

/** 取得公司近期股東會（常會/臨時會），預設查當年度股東會旺季月份 */
export async function getShareholderMeetings(
  stock: StockInfo
): Promise<ShareholderMeeting[]> {
  const nowRocYear = new Date().getFullYear() - 1911;
  const typek = typekFor(stock.type);
  // 股東常會多集中於 4-8 月，臨時會偶有；先查當年度，無資料再查前一年
  const months = [4, 5, 6, 7, 8];

  async function queryYear(year: number): Promise<ShareholderMeeting[]> {
    const settled = await Promise.allSettled(
      months.map((m) => fetchShareholderMonth(stock.stock_id, typek, year, m))
    );
    const map = new Map<string, ShareholderMeeting>();
    for (const s of settled) {
      if (s.status !== "fulfilled") continue;
      for (const meeting of s.value) {
        map.set(`${meeting.date}-${meeting.type}`, meeting);
      }
    }
    return Array.from(map.values());
  }

  let meetings = await queryYear(nowRocYear);
  if (meetings.length === 0) {
    meetings = await queryYear(nowRocYear - 1);
  }
  return meetings.sort((a, b) => b.date.localeCompare(a.date));
}

export function conferencePageUrl(stock: StockInfo): string {
  const rocYear = new Date().getFullYear() - 1911;
  return `${MOPS_BASE}/mops/web/t100sb02_1?encodeURIComponent=1&step=1&firstin=1&off=1&TYPEK=${typekFor(
    stock.type
  )}&year=${rocYear}&month=&co_id=${stock.stock_id}`;
}

export function shareholderPageUrl(stock: StockInfo): string {
  // 股東會資料以 MOPS 股東會及股利專區查詢（互動式頁面，提供深連結供查證）
  return `${MOPS_BASE}/mops/web/t108sb31_q1?TYPEK=${typekFor(
    stock.type
  )}&co_id=${stock.stock_id}`;
}
