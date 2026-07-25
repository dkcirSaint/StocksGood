"use client";

import { useEffect, useMemo, useState } from "react";
import type { DailyPrice } from "@/lib/types";
import type { WatchItem } from "@/lib/watchlists";
import {
  type EpsYearKind,
  formatEstimatedEps,
  getEstimatedEpsForYear,
  parseEpsInput,
  setEstimatedEps,
} from "@/lib/estimated-eps";
import {
  collectWatchlistEstPriceTouches,
  formatTargetPrice,
} from "@/lib/estimated-price";
import Modal from "./Modal";

const TOUCH_JUMP_MS = 2500;

export default function StockPriceTargets({
  stockId,
  latestBar,
  watchItems,
  section = "form",
}: {
  stockId: string;
  latestBar: DailyPrice | null;
  watchItems: WatchItem[];
  section?: "form" | "touches";
}) {
  const [epsYear, setEpsYear] = useState<EpsYearKind>("thisYear");
  const [epsInput, setEpsInput] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [touchTick, setTouchTick] = useState(0);
  const [touchesOpen, setTouchesOpen] = useState(false);
  const [touchIndex, setTouchIndex] = useState(0);

  useEffect(() => {
    const saved = getEstimatedEpsForYear(stockId, epsYear);
    setEpsInput(saved != null ? formatEstimatedEps(saved) : "");
    setMsg(null);
  }, [stockId, epsYear]);

  useEffect(() => {
    const onEstInputsChanged = (ev: Event) => {
      // 預估 EPS 或本益比變動 → 重新計算預估股價觸價
      setTouchTick((t) => t + 1);
      const detail = (ev as CustomEvent<{ stockId?: string }>).detail;
      if (ev.type === "ff-estimated-eps-changed") {
        if (detail?.stockId && detail.stockId !== stockId) return;
        const saved = getEstimatedEpsForYear(stockId, epsYear);
        setEpsInput(saved != null ? formatEstimatedEps(saved) : "");
      }
    };
    window.addEventListener("ff-estimated-eps-changed", onEstInputsChanged);
    window.addEventListener("ff-pe-band-changed", onEstInputsChanged);
    return () => {
      window.removeEventListener("ff-estimated-eps-changed", onEstInputsChanged);
      window.removeEventListener("ff-pe-band-changed", onEstInputsChanged);
    };
  }, [stockId, epsYear]);

  const watchTouches = useMemo(
    () => collectWatchlistEstPriceTouches(watchItems, stockId, latestBar),
    [watchItems, stockId, latestBar, touchTick]
  );

  useEffect(() => {
    setTouchIndex(0);
  }, [stockId, touchTick, watchTouches.length]);

  useEffect(() => {
    if (section !== "touches" || watchTouches.length <= 1) return;
    const id = window.setInterval(() => {
      setTouchIndex((i) => (i + 1) % watchTouches.length);
    }, TOUCH_JUMP_MS);
    return () => window.clearInterval(id);
  }, [section, watchTouches.length]);

  function flashMsg(text: string) {
    setMsg(text);
    window.setTimeout(() => setMsg(null), 2500);
  }

  function handleSaveEps() {
    const eps = parseEpsInput(epsInput);
    if (epsInput.trim() && eps == null) {
      flashMsg("請輸入有效 EPS");
      return;
    }
    if (eps == null) {
      flashMsg("請輸入預估 EPS");
      return;
    }

    const result = setEstimatedEps(stockId, epsYear, eps);
    if (!result.ok) {
      flashMsg("請輸入有效 EPS");
      return;
    }

    setEpsInput(formatEstimatedEps(eps));
  }

  if (section === "touches") {
    const emptyText =
      watchItems.length === 0
        ? "追蹤列表尚無股票"
        : "追蹤列表中無股票觸及預估股價";
    const hasTouches = watchTouches.length > 0;
    const activeTouch = hasTouches
      ? watchTouches[touchIndex % watchTouches.length]
      : null;

    return (
      <>
        <button
          type="button"
          className="touch-marquee"
          title="點擊查看完整觸價內容"
          onClick={() => setTouchesOpen(true)}
        >
          <span className="touch-marquee-label">最近交易日觸價</span>
          <div className="touch-marquee-viewport">
            {activeTouch ? (
              <span
                key={`${activeTouch.stockId}-${touchIndex}`}
                className="touch-marquee-item is-jumping"
              >
                <span className="stock-target-touch-name">
                  {activeTouch.stockName}
                </span>
                <span className="stock-target-touch-code">
                  {activeTouch.stockId}
                </span>
                <span className="stock-target-touch-prices">
                  {activeTouch.touched.map((t) => (
                    <span key={t.label} className="stock-target-touch-item">
                      {t.label} {formatTargetPrice(t.price)}
                    </span>
                  ))}
                </span>
              </span>
            ) : (
              <span className="touch-marquee-empty">{emptyText}</span>
            )}
          </div>
        </button>
        <Modal
          open={touchesOpen}
          title="最近交易日觸價"
          onClose={() => setTouchesOpen(false)}
        >
          {hasTouches ? (
            <ul className="stock-target-touch-list stock-target-touch-list-modal">
              {watchTouches.map((row) => (
                <li key={row.stockId} className="stock-target-touch-row">
                  <span className="stock-target-touch-name">{row.stockName}</span>
                  <span className="stock-target-touch-code">{row.stockId}</span>
                  {row.barDate && (
                    <span className="stock-target-touch-date">{row.barDate}</span>
                  )}
                  <span className="stock-target-touch-prices">
                    {row.touched.map((t) => (
                      <span key={t.label} className="stock-target-touch-item">
                        {t.label} {formatTargetPrice(t.price)}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="stock-targets-muted">{emptyText}</p>
          )}
        </Modal>
      </>
    );
  }

  return (
    <div className="stock-targets-setting">
      <div className="stock-targets-form">
        <label className="stock-target-field">
          <span className="stock-target-label">預估EPS</span>
          <div className="stock-target-eps-row">
            <select
              className="stock-target-year"
              value={epsYear}
              onChange={(e) => setEpsYear(e.target.value as EpsYearKind)}
              aria-label="預估 EPS 年度"
            >
              <option value="thisYear">今年</option>
              <option value="nextYear">明年</option>
            </select>
            <input
              type="text"
              inputMode="decimal"
              className="stock-target-input"
              value={epsInput}
              onChange={(e) => setEpsInput(e.target.value)}
              placeholder="—"
              aria-label="預估 EPS"
            />
            <button
              type="button"
              className="stock-target-icon-btn add"
              onClick={handleSaveEps}
              title="儲存預估 EPS"
              aria-label="儲存預估 EPS"
            >
              <span aria-hidden>+</span>
            </button>
          </div>
        </label>
      </div>
      {msg && <p className="stock-target-msg">{msg}</p>}
    </div>
  );
}
