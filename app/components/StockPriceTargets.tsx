"use client";

import { useEffect, useMemo, useState } from "react";
import type { DailyPrice } from "@/lib/types";
import type { WatchItem } from "@/lib/watchlists";
import {
  addKeyPrice,
  collectWatchlistKeyPriceTouches,
  formatKeyPrice,
  getKeyPrices,
  MAX_KEY_PRICES,
  parsePriceInput,
  removeKeyPrice,
} from "@/lib/price-targets";
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
  const [priceInput, setPriceInput] = useState("");
  const [saved, setSaved] = useState<number[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [touchTick, setTouchTick] = useState(0);
  const [touchesOpen, setTouchesOpen] = useState(false);
  const [touchIndex, setTouchIndex] = useState(0);

  useEffect(() => {
    setSaved(getKeyPrices(stockId));
    setPriceInput("");
    setMsg(null);
  }, [stockId]);

  useEffect(() => {
    const onPricesChanged = () => {
      setSaved(getKeyPrices(stockId));
      setTouchTick((t) => t + 1);
    };
    window.addEventListener("ff-key-prices-changed", onPricesChanged);
    return () =>
      window.removeEventListener("ff-key-prices-changed", onPricesChanged);
  }, [stockId]);

  const watchTouches = useMemo(
    () => collectWatchlistKeyPriceTouches(watchItems, stockId, latestBar),
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

  function handleConfirm() {
    const price = parsePriceInput(priceInput);
    if (priceInput.trim() && price == null) {
      flashMsg("請輸入有效價格");
      return;
    }
    if (price == null) {
      flashMsg("請輸入關鍵價格");
      return;
    }

    const result = addKeyPrice(stockId, price);
    if (!result.ok) {
      if (result.reason === "full") {
        window.alert("關鍵價格已滿，最多只能儲存 4 個不重複的價格");
        return;
      }
      if (result.reason === "duplicate") {
        flashMsg("此價格已存在");
        return;
      }
      flashMsg("請輸入有效價格");
      return;
    }

    setSaved(result.prices);
    setPriceInput("");
    flashMsg("已儲存");
  }

  function handleDelete() {
    const price = parsePriceInput(priceInput);
    if (priceInput.trim() && price == null) {
      flashMsg("請輸入有效價格");
      return;
    }
    if (price == null) {
      flashMsg("請輸入要刪除的關鍵價格");
      return;
    }

    const result = removeKeyPrice(stockId, price);
    if (!result.ok) {
      flashMsg("列表中無此價格");
      return;
    }

    setSaved(result.prices);
    setPriceInput("");
    flashMsg("已刪除");
  }

  if (section === "touches") {
    const emptyText =
      watchItems.length === 0
        ? "追蹤列表尚無股票"
        : "追蹤列表中無股票觸及關鍵價格";
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
                  {activeTouch.touchedPrices.map((p) => (
                    <span key={p} className="stock-target-touch-item">
                      {formatKeyPrice(p)}
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
                    {row.touchedPrices.map((p) => (
                      <span key={p} className="stock-target-touch-item">
                        {formatKeyPrice(p)}
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
          <span className="stock-target-label">
            關鍵價格
            <span className="stock-target-cap">
              {saved.length}/{MAX_KEY_PRICES}
            </span>
          </span>
          <input
            type="text"
            inputMode="decimal"
            className="stock-target-input"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            placeholder="—"
          />
        </label>
        <div className="stock-targets-actions">
          <button
            type="button"
            className="stock-target-icon-btn add"
            onClick={handleConfirm}
            title="新增關鍵價格"
            aria-label="新增關鍵價格"
          >
            <span aria-hidden>+</span>
          </button>
          <button
            type="button"
            className="stock-target-icon-btn remove"
            onClick={handleDelete}
            title="刪除關鍵價格"
            aria-label="刪除關鍵價格"
          >
            <span aria-hidden>−</span>
          </button>
        </div>
      </div>
      {msg && <p className="stock-target-msg">{msg}</p>}
    </div>
  );
}
