"use client";

import type { StockCalendarEvent } from "@/lib/types";
import {
  type MacdAnalysis,
  macdEntryExitStatusLabel,
} from "@/lib/indicators";
import {
  daysFromToday,
  eventKindClass,
  formatRelativeDays,
} from "@/lib/calendar-event-utils";

function MacdBlock({ analysis }: { analysis: MacdAnalysis | null }) {
  const statusLabel = analysis
    ? macdEntryExitStatusLabel(analysis.kind, analysis.status)
    : null;
  const statusClass =
    analysis?.status === "confirmed"
      ? "confirmed"
      : analysis?.status === "watching"
        ? "watching"
        : analysis?.status === "expired"
          ? "expired"
          : null;

  return (
    <div className="insights-block insights-block--macd">
      <h3 className="insights-title">MACD 分析</h3>
      {!analysis ? (
        <p className="insights-muted">K 線資料不足，無法計算</p>
      ) : (
        <div className="insights-macd-layers">
          <div className="insights-macd-layer">
            <span className="insights-macd-layer-label">戰術</span>
            <div className="insights-macd-layer-tags">
              {analysis.tactical === "weak" && (
                <span className="macd-tactical weak">短波段轉弱</span>
              )}
              {analysis.tactical === "strong" && (
                <span className="macd-tactical strong">短波段轉強</span>
              )}
              {analysis.tactical === "golden_cross" && (
                <span className="macd-tactical golden-cross">剛金叉</span>
              )}
              {analysis.tactical === "death_cross" && (
                <span className="macd-tactical death-cross">剛死叉</span>
              )}
              {analysis.tactical == null && (
                <span className="analysis-neutral">—</span>
              )}
            </div>
          </div>
          <div className="insights-macd-layer">
            <span className="insights-macd-layer-label">結構</span>
            <div className="insights-macd-layer-tags">
              {analysis.kind === "high" && (
                <span className="analysis-tag high">頂背離</span>
              )}
              {analysis.kind === "low" && (
                <span className="analysis-tag low">底背離</span>
              )}
              {analysis.kind == null && (
                <span className="analysis-neutral">無背離</span>
              )}
            </div>
          </div>
          <div className="insights-macd-layer insights-macd-layer--entry">
            <span className="insights-macd-layer-label">進出場</span>
            <div className="insights-macd-layer-tags">
              {statusLabel && statusClass ? (
                <span className={`macd-status ${statusClass}`}>{statusLabel}</span>
              ) : (
                <span className="analysis-neutral">—</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EventsBlock({
  events,
  eventsLoading,
}: {
  events: StockCalendarEvent[];
  eventsLoading: boolean;
}) {
  return (
    <div className="insights-block">
      <h3 className="insights-title">即將到來</h3>
      {eventsLoading ? (
        <p className="insights-muted">載入事件中…</p>
      ) : events.length === 0 ? (
        <p className="insights-muted">近一年無即將到來的已公告事件</p>
      ) : (
        <ul className="insights-events">
          {events.map((ev) => {
            const days = daysFromToday(ev.date);
            return (
              <li key={ev.id} className="insights-event">
                <span className="insights-event-date">{ev.date}</span>
                <span className={`evt-badge ${eventKindClass(ev.kind)}`}>
                  {ev.label}
                </span>
                <span className="insights-event-when">
                  {formatRelativeDays(days)}
                </span>
                {ev.detail && (
                  <span className="insights-event-detail">{ev.detail}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function StockInsightsPanel({
  events,
  eventsLoading,
  analysis,
  section = "all",
}: {
  events: StockCalendarEvent[];
  eventsLoading: boolean;
  analysis: MacdAnalysis | null;
  section?: "all" | "events" | "macd";
}) {
  if (section === "macd") {
    return (
      <section
        className="insights-panel insights-panel--macd-only"
        aria-label="MACD 分析"
      >
        <MacdBlock analysis={analysis} />
      </section>
    );
  }

  if (section === "events") {
    return (
      <section
        className="insights-panel insights-panel--events-only"
        aria-label="即將到來"
      >
        <EventsBlock events={events} eventsLoading={eventsLoading} />
      </section>
    );
  }

  return (
    <section className="insights-panel" aria-label="即將到來與乖離狀況">
      <EventsBlock events={events} eventsLoading={eventsLoading} />
      <div className="insights-divider" aria-hidden />
      <MacdBlock analysis={analysis} />
    </section>
  );
}
