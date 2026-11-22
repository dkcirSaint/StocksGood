/**
 * FOMC 會議日程（美東日期），取自聯準會官方行事曆：
 * https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
 * 官方每年公布隔年日程，清單用完時需在此補上新年度。
 */

export interface FomcMeeting {
  /** 會議首日 YYYY-MM-DD */
  start: string;
  /** 會議末日（公布利率決議當天）YYYY-MM-DD */
  end: string;
  /** 是否同時公布經濟預測摘要（SEP，含點陣圖） */
  sep: boolean;
}

export const FOMC_MEETINGS: FomcMeeting[] = [
  { start: "2026-01-27", end: "2026-01-28", sep: false },
  { start: "2026-03-17", end: "2026-03-18", sep: true },
  { start: "2026-04-28", end: "2026-04-29", sep: false },
  { start: "2026-06-16", end: "2026-06-17", sep: true },
  { start: "2026-07-28", end: "2026-07-29", sep: false },
  { start: "2026-09-15", end: "2026-09-16", sep: true },
  { start: "2026-10-27", end: "2026-10-28", sep: false },
  { start: "2026-12-08", end: "2026-12-09", sep: true },
  { start: "2027-01-26", end: "2027-01-27", sep: false },
  { start: "2027-03-16", end: "2027-03-17", sep: true },
  { start: "2027-04-27", end: "2027-04-28", sep: false },
  { start: "2027-06-08", end: "2027-06-09", sep: true },
  { start: "2027-07-27", end: "2027-07-28", sep: false },
  { start: "2027-09-14", end: "2027-09-15", sep: true },
  { start: "2027-10-26", end: "2027-10-27", sep: false },
  { start: "2027-12-07", end: "2027-12-08", sep: true },
];

/** 美東當地日期 YYYY-MM-DD（以 formatToParts 組字串，避免各環境日期格式不一） */
function newYorkYmd(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** 尚未結束（含今天正在開會）的前 n 次會議 */
export function getUpcomingFomcMeetings(n: number, now = new Date()): FomcMeeting[] {
  const today = newYorkYmd(now);
  return FOMC_MEETINGS.filter((m) => m.end >= today).slice(0, n);
}
