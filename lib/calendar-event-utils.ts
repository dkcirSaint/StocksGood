import type { StockCalendarEvent, StockEventKind } from "./types";

export function taiwanTodayYmd(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

export function addMonthsYmd(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1 + months, d);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function parseYmd(s: string | null | undefined): string | null {
  if (!s || s === "None") return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** 台灣時區的當前西元年 */
export function taiwanCurrentYear(): number {
  const ymd = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Taipei",
  });
  return parseInt(ymd.slice(0, 4), 10);
}

export function currentYearBounds(): { year: number; start: string; end: string } {
  const year = taiwanCurrentYear();
  return { year, start: `${year}-01-01`, end: `${year}-12-31` };
}

/** 事件日期是否落在今年（台灣時區） */
export function inCurrentYear(dateStr: string): boolean {
  const { start, end } = currentYearBounds();
  return dateStr >= start && dateStr <= end;
}

/** 公告日是否落在今年 */
export function isAnnouncedThisYear(
  announcementDate: string | null | undefined
): boolean {
  const d = parseYmd(announcementDate);
  return d != null && inCurrentYear(d);
}

export function inFutureWindow(
  dateStr: string,
  start: string,
  end: string
): boolean {
  return dateStr >= start && dateStr <= end;
}

/** 事件日期距今日（台灣）的天數；正數為未來 */
export function daysFromToday(dateStr: string): number {
  const today = taiwanTodayYmd();
  const [ty, tm, td] = today.split("-").map(Number);
  const [y, m, d] = dateStr.split("-").map(Number);
  const t0 = Date.UTC(ty, tm - 1, td);
  const t1 = Date.UTC(y, m - 1, d);
  return Math.round((t1 - t0) / 86_400_000);
}

export function formatRelativeDays(days: number): string {
  if (days === 0) return "今天";
  if (days === 1) return "明天";
  if (days > 0) return `${days} 天後`;
  return "已過";
}

/** 台灣時區當週週一～週日 */
export function taiwanWeekBounds(
  ymd = taiwanTodayYmd()
): { start: string; end: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const day = utc.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(utc);
  monday.setUTCDate(utc.getUTCDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (dt: Date) => {
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };
  return { start: fmt(monday), end: fmt(sunday) };
}

export function pushCalendarEvent(
  events: StockCalendarEvent[],
  seen: Set<string>,
  item: Omit<StockCalendarEvent, "id">
) {
  const id = `${item.stockId}-${item.date}-${item.kind}`;
  if (seen.has(id)) return;
  seen.add(id);
  events.push({ ...item, id });
}

export function buildMopsCalendarEvents(
  result: {
    stock: { stock_id: string; stock_name: string };
    shareholderMeetings: { date: string; type: string; held: boolean }[];
    conferences: { date: string; time: string; held: boolean }[];
  }
): StockCalendarEvent[] {
  const events: StockCalendarEvent[] = [];
  const seen = new Set<string>();
  const { stock_id: stockId, stock_name: stockName } = result.stock;

  for (const m of result.shareholderMeetings) {
    if (!inCurrentYear(m.date)) continue;
    pushCalendarEvent(events, seen, {
      stockId,
      stockName,
      date: m.date,
      kind: "shareholder_meeting",
      label: "股東會",
      detail: m.held ? `${m.type}（已召開）` : m.type,
    });
  }

  for (const c of result.conferences) {
    if (!inCurrentYear(c.date)) continue;
    pushCalendarEvent(events, seen, {
      stockId,
      stockName,
      date: c.date,
      kind: "investor_conference",
      label: "法人說明會",
      detail: c.held
        ? `已舉行${c.time ? ` · ${c.time}` : ""}`
        : c.time || undefined,
    });
  }

  return events;
}

export function eventKindClass(kind: StockEventKind): string {
  switch (kind) {
    case "ex_dividend":
    case "ex_rights":
    case "cash_payment":
      return "evt-dividend";
    case "cash_increase":
      return "evt-increase";
    case "capital_reduction":
      return "evt-reduction";
    case "delisting":
      return "evt-delisting";
    case "stock_split":
    case "par_value_change":
      return "evt-corporate";
    case "shareholder_meeting":
      return "evt-meeting";
    case "investor_conference":
      return "evt-conference";
    default:
      return "evt-other";
  }
}
