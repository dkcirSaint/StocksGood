"use client";

import { useEffect, useRef, useState } from "react";
import {
  MAX_MEMO_LENGTH,
  getStockMemo,
  setStockMemo,
} from "@/lib/stock-memo";

const SAVE_DELAY_MS = 600;

export default function StockMemo({
  stockId,
  stockName,
}: {
  stockId: string;
  stockName?: string;
}) {
  const [text, setText] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 切換個股時載入該檔筆記；先清掉待寫入的計時器，避免寫到上一檔
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setText(getStockMemo(stockId));
  }, [stockId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleChange(value: string) {
    const next = value.slice(0, MAX_MEMO_LENGTH);
    setText(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setStockMemo(stockId, next);
      timerRef.current = null;
    }, SAVE_DELAY_MS);
  }

  function flushSave() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setStockMemo(stockId, text);
  }

  return (
    <section className="section stock-memo-panel">
      <h2>
        <span className="dot" />
        筆記
      </h2>
      <textarea
        className="stock-memo-input"
        rows={5}
        value={text}
        maxLength={MAX_MEMO_LENGTH}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={flushSave}
        placeholder={
          stockName
            ? `記下 ${stockName} 的觀察重點…`
            : "記下這檔股票的觀察重點…"
        }
        aria-label="個股筆記"
      />
    </section>
  );
}
