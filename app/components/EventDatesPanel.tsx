"use client";

import type { StockCalendarEvent } from "@/lib/types";
import { currentYearBounds, eventKindClass } from "@/lib/calendar-event-utils";

export default function EventDatesPanel({
  events,
  loading,
  filterStockId,
  filterStockName,
  listName,
  itemCount,
  onPickStock,
}: {
  events: StockCalendarEvent[];
  loading: boolean;
  filterStockId: string | null;
  filterStockName: string | null;
  listName: string | null;
  itemCount: number;
  onPickStock: (stockId: string) => void;
}) {
  const { year } = currentYearBounds();
  const subtitle = filterStockId
    ? `${filterStockName ?? filterStockId}（${filterStockId}）`
    : listName
      ? `「${listName}」共 ${itemCount} 檔`
      : null;

  return (
    <section className="section evt-panel">
      <h2>
        <span className="dot" />
        事件日期
      </h2>
      <p className="evt-sub">
        {year} 年已公告事件日期
        {subtitle ? ` · ${subtitle}` : ""}
      </p>

      {loading && <div className="evt-loading">載入事件中…</div>}

      {!loading && itemCount === 0 && (
        <p className="empty">
          請先在追蹤列表加入股票，即可彙整除息日、除權日、增減資等事件（僅限列表內標的）。
        </p>
      )}

      {!loading && itemCount > 0 && events.length === 0 && (
        <p className="empty">
          {filterStockId
            ? `此股票 ${year} 年尚無已公告的重要事件。`
            : `追蹤列表中的股票 ${year} 年尚無已公告的重要事件。`}
        </p>
      )}

      {!loading && events.length > 0 && (
        <ul className="evt-list">
          {events.map((ev) => (
            <li key={ev.id} className="evt-row">
              <button
                type="button"
                className="evt-pick"
                onClick={() => onPickStock(ev.stockId)}
                title={`查看 ${ev.stockName}`}
              >
                <span className="evt-date">{ev.date}</span>
                <span className="evt-stock">
                  {ev.stockName}
                  <span className="evt-code">{ev.stockId}</span>
                </span>
              </button>
              <span className={`evt-badge ${eventKindClass(ev.kind)}`}>
                {ev.label}
              </span>
              {ev.detail && <span className="evt-detail">{ev.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
