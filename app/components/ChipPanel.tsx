"use client";

import type { LargeHolderSnapshot } from "@/lib/types";
import {
  formatPeople,
  formatRatioPct,
  formatWowWithPeople,
} from "@/lib/chip-utils";

function WowCell({
  change,
  peopleChange,
}: {
  change: number | null;
  peopleChange: number | null;
}) {
  if (change == null && peopleChange == null) {
    return <span className="chip-na">—</span>;
  }
  const dir = change ?? peopleChange ?? 0;
  const cls = dir > 0 ? "up" : dir < 0 ? "down" : "na";
  return (
    <span className={cls}>{formatWowWithPeople(change, peopleChange)}</span>
  );
}

function TierTable({
  tier,
  label,
  rows,
}: {
  tier: "1000" | "400";
  label: string;
  rows: LargeHolderSnapshot[];
}) {
  const tierRows = rows.filter((r) => r.tier === tier);
  if (tierRows.length === 0) {
    return (
      <div className="chip-tier">
        <h3 className="chip-tier-title">{label}</h3>
        <p className="empty">尚無資料</p>
      </div>
    );
  }

  return (
    <div className="chip-tier">
      <h3 className="chip-tier-title">{label}</h3>
      <div className="chip-table-wrap">
        <table className="chip-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>大戶持股比例</th>
              <th>人數</th>
              <th>較上期</th>
            </tr>
          </thead>
          <tbody>
            {tierRows.map((row) => (
              <tr key={row.id}>
                <td className="chip-date">{row.date}</td>
                <td className="chip-ratio">{formatRatioPct(row.ratio)}</td>
                <td className="chip-people">
                  {row.people != null ? formatPeople(row.people) : (
                    <span className="chip-na">—</span>
                  )}
                </td>
                <td className="chip-wow">
                  <WowCell
                    change={row.wowChange}
                    peopleChange={row.wowPeople}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ChipPanel({
  snapshots,
  loading,
  error,
  filterStockId,
  filterStockName,
  listName,
  itemCount,
}: {
  snapshots: LargeHolderSnapshot[];
  loading: boolean;
  error: string | null;
  filterStockId: string | null;
  filterStockName: string | null;
  listName: string | null;
  itemCount: number;
  onPickStock: (stockId: string) => void;
}) {
  const subtitle = filterStockId
    ? `${filterStockName ?? filterStockId}（${filterStockId}）`
    : listName
      ? `「${listName}」共 ${itemCount} 檔`
      : null;

  const rows = filterStockId
    ? snapshots.filter((s) => s.stockId === filterStockId)
    : snapshots;

  const latestLabel =
    rows.length > 0
      ? rows.reduce((max, r) => (r.date > max ? r.date : max), rows[0].date)
      : null;

  return (
    <section className="section chip-panel">
      <h2>
        <span className="dot" />
        大戶籌碼
      </h2>
      <p className="chip-sub">
        最近一期公布{latestLabel ? ` · ${latestLabel}` : ""}
        {subtitle ? ` · ${subtitle}` : ""}
      </p>

      {loading && <div className="chip-loading">載入籌碼資料中…</div>}

      {!loading && error && (
        <div className="chip-error">{error}</div>
      )}

      {!loading && itemCount === 0 && (
        <p className="empty">
          請先在追蹤列表加入股票，即可查看大戶持股（僅限列表內標的）。
        </p>
      )}

      {!loading && itemCount > 0 && rows.length === 0 && !error && (
        <p className="empty">
          {filterStockId
            ? "此股票尚無大戶持股資料。"
            : "追蹤列表中的股票尚無大戶持股資料。"}
        </p>
      )}

      {!loading && rows.length > 0 && (
        <>
          <TierTable tier="1000" label="1000 張以上大戶" rows={rows} />
          <TierTable tier="400" label="400 張以上大戶" rows={rows} />
        </>
      )}

      <p className="chip-note">
        資料來源：TDCC 集保戶股權分散表（開放資料）。較上期為與上一期公布日相比。
      </p>
    </section>
  );
}
