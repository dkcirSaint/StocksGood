"use client";

import dynamic from "next/dynamic";
import { getUpcomingFomcMeetings, type FomcMeeting } from "@/lib/fomc";
import type { FedFundsQuote } from "@/lib/fed-funds";

const FedFundsChart = dynamic(() => import("./FedFundsChart"), {
  ssr: false,
  loading: () => <div className="chart-canvas" />,
});

const CME_FEDWATCH_URL =
  "https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html";
const FED_CALENDAR_URL =
  "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/** 聯準會於會議末日美東時間 14:00 公布利率決議 */
const ANNOUNCE_HOUR_ET = 14;

function weekdayOf(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function monthDay(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${m}/${d}`;
}

/** 美東該日 14:00 對應的實際時間點（自動處理夏令時間） */
function announceInstant(endYmd: string): Date {
  const [y, m, d] = endYmd.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const nyHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hourCycle: "h23",
    }).format(probe)
  );
  const offsetHours = nyHour - 12; // 美東與 UTC 的時差（-4 或 -5）
  return new Date(Date.UTC(y, m - 1, d, ANNOUNCE_HOUR_ET - offsetHours));
}

function formatTaipei(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

function daysUntil(target: Date, now: Date): number {
  return Math.ceil((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function MeetingCard({ meeting, now }: { meeting: FomcMeeting; now: Date }) {
  const announce = announceInstant(meeting.end);
  const days = daysUntil(announce, now);
  const endDay = meeting.end.slice(8);
  const sameMonth = meeting.start.slice(0, 7) === meeting.end.slice(0, 7);

  return (
    <li className="fomc-card">
      <div className="fomc-card-head">
        <span className="fomc-card-date">
          {monthDay(meeting.start)}–
          {sameMonth ? Number(endDay) : monthDay(meeting.end)}
        </span>
        <span className="fomc-card-week">
          （週{weekdayOf(meeting.start)}–週{weekdayOf(meeting.end)}）
        </span>
        {meeting.sep && (
          <span className="fomc-card-badge" title="同時公布經濟預測摘要（含點陣圖）">
            經濟預測／點陣圖
          </span>
        )}
      </div>
      <div className="fomc-card-meta">
        利率決議：台灣時間 {formatTaipei(announce)} 公布
        <span className="fomc-card-countdown">
          {days > 0 ? `還有 ${days} 天` : "今日公布"}
        </span>
      </div>
    </li>
  );
}

function formatRate(n: number): string {
  return `${n.toFixed(2)}%`;
}

function RateCard({
  quote,
  loading,
  error,
}: {
  quote: FedFundsQuote | null;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <div className="fedwatch-rate fomc-card">
      <p className="fedwatch-rate-kicker">目前聯邦基金利率</p>
      {quote ? (
        <>
          <div className="fedwatch-rate-range">
            <span className="fedwatch-rate-label">目標區間</span>
            <span className="fomc-card-date">
              {formatRate(quote.targetFrom)} – {formatRate(quote.targetTo)}
            </span>
          </div>
          <p className="fedwatch-rate-meta">
            {quote.effective != null
              ? `有效利率 ${formatRate(quote.effective)}（${quote.date}）`
              : `日期 ${quote.date}`}
          </p>
          <p className="fedwatch-rate-source">資料來源：{quote.source}</p>
        </>
      ) : loading ? (
        <p className="fedwatch-rate-meta">載入中…</p>
      ) : (
        <p className="fedwatch-rate-meta">
          {error ? `利率載入失敗：${error}` : "暫無利率資料"}
        </p>
      )}
    </div>
  );
}

export default function FedWatchPanel({
  nowMs,
  quote,
  quoteLoading,
  quoteError,
}: {
  nowMs?: number;
  quote?: FedFundsQuote | null;
  quoteLoading?: boolean;
  quoteError?: string | null;
}) {
  const now = new Date(nowMs ?? Date.now());
  const meetings = getUpcomingFomcMeetings(2, now);

  return (
    <div className="fedwatch">
      <RateCard
        quote={quote ?? null}
        loading={quoteLoading}
        error={quoteError}
      />
      {quote && quote.points.length > 1 ? (
        <FedFundsChart data={quote.points} source={quote.source} />
      ) : quoteLoading ? (
        <div className="chart-canvas" />
      ) : null}
      <h3 className="fedwatch-title">接下來兩次 FOMC 利率會議</h3>
      {meetings.length > 0 ? (
        <ul className="fomc-list">
          {meetings.map((m) => (
            <MeetingCard key={m.start} meeting={m} now={now} />
          ))}
        </ul>
      ) : (
        <p className="empty">
          會議日程已過期，請至聯準會官網確認最新日程後更新 lib/fomc.ts。
        </p>
      )}

      <div className="fedwatch-links">
        <a
          className="btn"
          href={CME_FEDWATCH_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          開啟 CME FedWatch（利率機率）
        </a>
        <a href={FED_CALENDAR_URL} target="_blank" rel="noopener noreferrer">
          聯準會官方會議行事曆
        </a>
      </div>
      <p className="fedwatch-note">
        各次會議的升息／降息機率請以 CME FedWatch 官方頁面為準；本站不擷取 CME 資料。
      </p>
    </div>
  );
}
