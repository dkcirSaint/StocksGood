"use client";

import { useMemo } from "react";
import Modal from "./Modal";
import type { Watchlist } from "@/lib/watchlists";
import { collectGoldPicks, type GoldPick, type GoldPickBand } from "@/lib/gold-picks";
import { formatTargetPrice } from "@/lib/estimated-price";

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatClose(n: number): string {
  return n.toLocaleString("zh-TW", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function GoldPickModal({
  open,
  onClose,
  lists,
  onPickStock,
}: {
  open: boolean;
  onClose: () => void;
  lists: Watchlist[];
  onPickStock: (stockId: string) => void;
}) {
  const groups = useMemo(
    () => (open ? collectGoldPicks(lists) : []),
    [open, lists]
  );
  const hasLists = lists.some((l) => l.items.length > 0);

  function pick(id: string) {
    onPickStock(id);
    onClose();
  }

  return (
    <Modal open={open} title="撿黃金" onClose={onClose}>
      <div className="gold-pick">
        <p className="gold-pick-lead">
          現價低於今年或明年下緣／合理價（預估 EPS × 本益比）的追蹤股票。低於下緣者只列在「低於下緣」；其餘低於合理者列在「低於合理」。潛在獲利％
          =（對照價 − 現價）／現價。依追蹤列表分組，％由大到小。
        </p>

        {!hasLists ? (
          <p className="gold-pick-empty">追蹤列表尚無股票。</p>
        ) : groups.length === 0 ? (
          <p className="gold-pick-empty">
            目前沒有現價低於下緣或合理價的股票。請確認已填預估
            EPS 與本益比「下緣」或「合理」，且本地有最新收盤價。
          </p>
        ) : (
          groups.map((g) => (
            <section key={g.listId} className="gold-pick-group">
              <h4 className="gold-pick-list">{g.listName}</h4>
              <GoldPickBandTable
                band="下緣"
                picks={g.belowLower}
                onPick={pick}
              />
              <GoldPickBandTable
                band="合理"
                picks={g.belowFair}
                onPick={pick}
              />
            </section>
          ))
        )}
      </div>
    </Modal>
  );
}

function GoldPickBandTable({
  band,
  picks,
  onPick,
}: {
  band: GoldPickBand;
  picks: GoldPick[];
  onPick: (id: string) => void;
}) {
  if (picks.length === 0) return null;
  const priceLabel = band === "下緣" ? "下緣價" : "合理價";
  return (
    <div className="gold-pick-band">
      <h5
        className={`gold-pick-band-title${
          band === "下緣" ? " gold-pick-band-lower" : " gold-pick-band-fair"
        }`}
      >
        低於{band}
      </h5>
      <div className="gold-pick-table-wrap">
        <table className="fin gold-pick-table">
          <thead>
            <tr>
              <th>股票代號</th>
              <th>股票名稱</th>
              <th>現價</th>
              <th>{priceLabel}</th>
              <th>潛在獲利</th>
            </tr>
          </thead>
          <tbody>
            {picks.map((p) => (
              <GoldPickRow
                key={`${p.stockId}-${p.yearLabel}-${p.band}`}
                pick={p}
                onPick={onPick}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GoldPickRow({
  pick,
  onPick,
}: {
  pick: GoldPick;
  onPick: (id: string) => void;
}) {
  return (
    <tr>
      <td>
        <button
          type="button"
          className="gold-pick-stock"
          onClick={() => onPick(pick.stockId)}
          title="查詢此股票"
        >
          {pick.stockId}
        </button>
      </td>
      <td className="gold-pick-name">{pick.stockName}</td>
      <td title={pick.closeDate}>{formatClose(pick.close)}</td>
      <td>
        {formatTargetPrice(pick.fair)}
        <span className="gold-pick-year">{pick.yearLabel}</span>
      </td>
      <td className="up">{formatPct(pick.upsidePct)}</td>
    </tr>
  );
}
