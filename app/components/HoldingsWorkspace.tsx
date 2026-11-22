"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DailyPrice } from "@/lib/types";
import {
  deriveHoldingRows,
  sumHoldingPnl,
  useHoldings,
  type HoldingRow,
} from "@/lib/holdings";
import {
  getPriceCache,
  getPriceCacheForQuery,
  mergeDailyPrices,
  savePriceCache,
} from "@/lib/price-cache";
import { rememberStockAlias } from "@/lib/financial-cache";
import HoldingsPieChart from "./HoldingsPieChart";

interface PriceApiPayload {
  error?: string;
  stock?: {
    stock_id: string;
    stock_name: string;
    industry_category: string;
    type: string;
  };
  dailyPrices?: DailyPrice[];
  latestPriceDate?: string | null;
}

function latestClose(prices: DailyPrice[] | undefined): number | null {
  if (!prices?.length) return null;
  const close = prices[prices.length - 1].close;
  return Number.isFinite(close) && close > 0 ? close : null;
}

function formatShares(n: number): string {
  return n.toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}

function formatMoney(n: number): string {
  return n.toLocaleString("zh-TW", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPrice(n: number): string {
  return n.toLocaleString("zh-TW", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPnlPct(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${Math.abs(n * 100).toFixed(1)}%`;
}

function formatPnlWithPct(pnl: number, pnlPct: number | null): string {
  if (pnlPct == null) return formatMoney(pnl);
  return `${formatMoney(pnl)}(${formatPnlPct(pnlPct)})`;
}

function pnlClass(pnl: number | null): string {
  if (pnl == null || pnl === 0) return "na";
  return pnl > 0 ? "up" : "down";
}

function formatAccountOption(name: string, pnl: number | null): string {
  return `${name}　${pnl != null ? formatMoney(pnl) : "—"}`;
}

type HoldingsSortKey = "stockId" | "shares" | "pnl" | "weight";
type HoldingsSortDir = "desc" | "asc";

function compareNullableNumber(
  a: number | null,
  b: number | null,
  dir: HoldingsSortDir
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const diff = a - b;
  return dir === "asc" ? diff : -diff;
}

function compareHoldings(
  a: HoldingRow,
  b: HoldingRow,
  key: HoldingsSortKey,
  dir: HoldingsSortDir
): number {
  if (key === "stockId") {
    const cmp = a.stockId.localeCompare(b.stockId, "zh-TW", { numeric: true });
    return dir === "asc" ? cmp : -cmp;
  }
  if (key === "shares") return compareNullableNumber(a.shares, b.shares, dir);
  if (key === "pnl") return compareNullableNumber(a.pnl, b.pnl, dir);
  return compareNullableNumber(a.weight, b.weight, dir);
}

function parsePositive(raw: string, label: string): number {
  const n = Number(String(raw).trim().replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label}須為大於 0 的數字`);
  }
  return n;
}

async function fetchPriceQuote(
  query: string,
  opts: { force: boolean; signal?: AbortSignal }
): Promise<{
  stockId: string;
  stockName: string;
  industryCategory: string;
  type: string;
  close: number | null;
}> {
  const q = query.trim();
  const cache = getPriceCache(q) ?? getPriceCacheForQuery(q);
  if (!opts.force) {
    const cachedClose = latestClose(cache?.dailyPrices);
    if (cache && cachedClose != null) {
      return {
        stockId: cache.stockId,
        stockName: cache.stockName,
        industryCategory: cache.industryCategory,
        type: cache.type,
        close: cachedClose,
      };
    }
  }

  const params = new URLSearchParams({ id: q });
  if (cache?.latestDate) params.set("priceLatest", cache.latestDate);
  const res = await fetch(`/api/price?${params.toString()}`, {
    signal: opts.signal,
  });
  const data = (await res.json()) as PriceApiPayload;
  if (!res.ok || !data.stock?.stock_id) {
    throw new Error(data.error || `找不到股票「${q}」`);
  }

  const merged = data.dailyPrices?.length
    ? mergeDailyPrices(cache?.dailyPrices ?? [], data.dailyPrices)
    : cache?.dailyPrices ?? [];
  if (merged.length > 0) {
    savePriceCache(data.stock.stock_id, {
      stockName: data.stock.stock_name,
      industryCategory: data.stock.industry_category,
      type: data.stock.type,
      dailyPrices: merged,
      latestDate: data.latestPriceDate ?? undefined,
    });
  }
  rememberStockAlias(data.stock.stock_name, data.stock.stock_id);

  return {
    stockId: data.stock.stock_id,
    stockName: data.stock.stock_name,
    industryCategory: data.stock.industry_category,
    type: data.stock.type,
    close: latestClose(merged),
  };
}

export default function HoldingsWorkspace({
  refreshNonce = 0,
  onRefreshingChange,
}: {
  refreshNonce?: number;
  onRefreshingChange?: (busy: boolean) => void;
}) {
  const {
    ready,
    accounts,
    selectedId,
    selectedName,
    holdings,
    byAccount,
    allStockIds,
    selectAccount,
    createAccount,
    deleteSelectedAccount,
    addOrMerge,
    remove,
  } = useHoldings();
  const [accountName, setAccountName] = useState("");
  const [query, setQuery] = useState("");
  const [shares, setShares] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<HoldingsSortKey | null>(null);
  const [sortDir, setSortDir] = useState<HoldingsSortDir>("desc");

  const rows = useMemo(
    () => deriveHoldingRows(holdings, quotes),
    [holdings, quotes]
  );
  const accountTotals = useMemo(
    () =>
      accounts.map((account) => ({
        id: account.id,
        name: account.name,
        pnl: sumHoldingPnl(deriveHoldingRows(byAccount[account.id] ?? [], quotes)),
      })),
    [accounts, byAccount, quotes]
  );
  const selectedAccountPnl =
    accountTotals.find((account) => account.id === selectedId)?.pnl ?? null;
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return rows.slice().sort((a, b) => compareHoldings(a, b, sortKey, sortDir));
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: HoldingsSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setSortDir("desc");
  }
  const holdingsKey = allStockIds.join(",");
  const holdingsKeyRef = useRef(holdingsKey);
  holdingsKeyRef.current = holdingsKey;
  const onRefreshingChangeRef = useRef(onRefreshingChange);
  onRefreshingChangeRef.current = onRefreshingChange;

  const setBusy = useCallback((busy: boolean) => {
    setRefreshing(busy);
    onRefreshingChangeRef.current?.(busy);
  }, []);

  const applyQuote = useCallback((stockId: string, close: number | null) => {
    if (close == null) return;
    setQuotes((prev) =>
      prev[stockId] === close ? prev : { ...prev, [stockId]: close }
    );
  }, []);

  const refreshQuotes = useCallback(
    async (ids: string[], force: boolean, signal?: AbortSignal) => {
      if (ids.length === 0) return;
      setBusy(true);
      try {
        for (const id of ids) {
          if (signal?.aborted) break;
          try {
            const quote = await fetchPriceQuote(id, { force, signal });
            if (signal?.aborted) break;
            applyQuote(quote.stockId, quote.close);
          } catch (err) {
            if ((err as Error).name === "AbortError") break;
          }
        }
      } finally {
        if (!signal?.aborted) setBusy(false);
      }
    },
    [applyQuote, setBusy]
  );

  useEffect(() => {
    if (!ready) return;
    const ids = holdingsKey ? holdingsKey.split(",") : [];
    const missing: string[] = [];
    for (const id of ids) {
      const close = latestClose(getPriceCache(id)?.dailyPrices);
      if (close != null) applyQuote(id, close);
      else missing.push(id);
    }
    if (missing.length === 0) return;
    const ctrl = new AbortController();
    void refreshQuotes(missing, false, ctrl.signal);
    return () => {
      ctrl.abort();
      setBusy(false);
    };
  }, [ready, holdingsKey, applyQuote, refreshQuotes, setBusy]);

  useEffect(() => {
    if (!ready || refreshNonce === 0) return;
    const ids = holdingsKeyRef.current
      ? holdingsKeyRef.current.split(",")
      : [];
    const ctrl = new AbortController();
    void refreshQuotes(ids, true, ctrl.signal);
    return () => {
      ctrl.abort();
      setBusy(false);
    };
  }, [ready, refreshNonce, refreshQuotes, setBusy]);

  function handleCreateAccount(e: FormEvent) {
    e.preventDefault();
    const result = createAccount(accountName);
    if (!result.ok) {
      setMessage(result.error ?? "無法新增帳號");
      return;
    }
    setAccountName("");
    setMessage(`已新增帳號「${accountName.trim()}」`);
  }

  function handleDeleteAccount() {
    const name = selectedName;
    const result = deleteSelectedAccount();
    if (!result.ok) {
      setMessage(result.error ?? "無法刪除帳號");
      return;
    }
    setMessage(`已刪除帳號「${name}」`);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!selectedId) {
      setMessage("請先建立帳號，再把股票加入該帳號");
      return;
    }
    const q = query.trim();
    if (!q) {
      setMessage("請輸入股票名稱或代號");
      return;
    }
    let shareCount: number;
    let cost: number;
    try {
      shareCount = parsePositive(shares, "股數");
      cost = parsePositive(totalCost, "總成本");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "輸入無效");
      return;
    }

    setAdding(true);
    try {
      const quote = await fetchPriceQuote(q, { force: false });
      const added = addOrMerge(selectedId, {
        stockId: quote.stockId,
        stockName: quote.stockName,
        shares: shareCount,
        totalCost: cost,
      });
      if (!added.ok) {
        setMessage(added.error ?? "加入失敗");
        return;
      }
      applyQuote(quote.stockId, quote.close);
      setQuery("");
      setShares("");
      setTotalCost("");
      setMessage(`已加入 ${quote.stockName}（${quote.stockId}）到「${selectedName}」`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "加入失敗");
    } finally {
      setAdding(false);
    }
  }

  const hasRows = rows.length > 0;

  if (!ready) {
    return (
      <div className="holdings-workspace">
        <p className="holdings-empty">讀取庫存中…</p>
      </div>
    );
  }

  const emptyHint =
    accounts.length === 0
      ? "請先在上方建立帳號，再把股票加入該帳號。"
      : "這個帳號尚無庫存，請輸入股票後按＋加入。";

  return (
    <div className="holdings-workspace">
      <form className="holdings-account-bar" onSubmit={handleCreateAccount}>
        <label className="holdings-field holdings-field-select holdings-field-account">
          <span>帳號</span>
          <select
            value={selectedId ?? ""}
            onChange={(e) => selectAccount(e.target.value)}
            disabled={accounts.length === 0}
            aria-label="選擇庫存帳號"
          >
            {accounts.length === 0 ? (
              <option value="">請先建立帳號</option>
            ) : (
              accountTotals.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatAccountOption(account.name, account.pnl)}
                </option>
              ))
            )}
          </select>
        </label>
        <p className="holdings-account-bar-pnl">
          <span>總損益</span>
          <strong className={pnlClass(selectedAccountPnl)}>
            {selectedAccountPnl != null ? formatMoney(selectedAccountPnl) : "—"}
          </strong>
        </p>
        <label className="holdings-field holdings-field-new-account">
          <span>新帳號</span>
          <input
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="例如：證券戶 A"
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          className="holdings-add"
          title="新增帳號"
          aria-label="新增帳號"
        >
          ＋
        </button>
        <button
          type="button"
          className="holdings-account-remove"
          onClick={handleDeleteAccount}
          disabled={!selectedId}
          title="刪除目前帳號"
          aria-label="刪除目前帳號"
        >
          －
        </button>
      </form>

      <form className="holdings-form" onSubmit={(e) => void handleAdd(e)}>
        <label className="holdings-field holdings-field-query">
          <span>股票名稱或代號</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例如：台積電 或 2330"
            autoComplete="off"
          />
        </label>
        <label className="holdings-field">
          <span>股數</span>
          <input
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            inputMode="decimal"
            placeholder="例如：1000"
          />
        </label>
        <label className="holdings-field">
          <span>總成本</span>
          <input
            value={totalCost}
            onChange={(e) => setTotalCost(e.target.value)}
            inputMode="decimal"
            placeholder="例如：850000"
          />
        </label>
        <button
          type="submit"
          className="holdings-add"
          disabled={adding || !ready || accounts.length === 0}
          title="加入庫存"
          aria-label="加入庫存"
        >
          {adding ? "…" : "＋"}
        </button>
      </form>
      {message && <p className="holdings-msg">{message}</p>}

      {!hasRows ? (
        <p className="holdings-empty">{emptyHint}</p>
      ) : (
        <>
          <div className="holdings-table-wrap">
            <table className="fin holdings-table">
              <thead>
                <tr>
                  <SortHeader
                    label="股票代號"
                    column="stockId"
                    align="left"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <th>股票名稱</th>
                  <SortHeader
                    label="股數"
                    column="shares"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <th>總成本</th>
                  <th>成本均價</th>
                  <th>目前價格</th>
                  <SortHeader
                    label="損益"
                    column="pnl"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="持股比例"
                    column="weight"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <th />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <HoldingTableRow
                    key={row.stockId}
                    row={row}
                    onRemove={() => selectedId && remove(selectedId, row.stockId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {refreshing && (
            <p className="holdings-msg holdings-msg-dim">更新現價中…</p>
          )}
          <HoldingsPieChart
            rows={rows}
            title={selectedName ? `持股比例・${selectedName}` : "持股比例"}
          />
        </>
      )}
    </div>
  );
}

function SortHeader({
  label,
  column,
  align = "right",
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  column: HoldingsSortKey;
  align?: "left" | "right";
  sortKey: HoldingsSortKey | null;
  sortDir: HoldingsSortDir;
  onSort: (key: HoldingsSortKey) => void;
}) {
  const active = sortKey === column;
  return (
    <th className={align === "left" ? "holdings-th-sortable-left" : undefined}>
      <button
        type="button"
        className={`holdings-sort${active ? " active" : ""}`}
        onClick={() => onSort(column)}
        aria-sort={
          active ? (sortDir === "asc" ? "ascending" : "descending") : "none"
        }
      >
        {label}
        {active && (
          <span className="holdings-sort-ind" aria-hidden="true">
            {sortDir === "desc" ? "▼" : "▲"}
          </span>
        )}
      </button>
    </th>
  );
}

function HoldingTableRow({
  row,
  onRemove,
}: {
  row: HoldingRow;
  onRemove: () => void;
}) {
  const pnlCls =
    row.pnl == null ? "na" : row.pnl > 0 ? "up" : row.pnl < 0 ? "down" : "na";
  return (
    <tr>
      <td>{row.stockId}</td>
      <td className="holdings-name">{row.stockName}</td>
      <td>{formatShares(row.shares)}</td>
      <td>{formatMoney(row.totalCost)}</td>
      <td>{formatPrice(row.avgCost)}</td>
      <td>
        {row.currentPrice != null ? formatPrice(row.currentPrice) : "—"}
      </td>
      <td className={`holdings-pnl ${pnlCls}`}>
        {row.pnl != null ? formatPnlWithPct(row.pnl, row.pnlPct) : "—"}
      </td>
      <td>
        {row.weight != null ? `${(row.weight * 100).toFixed(1)}%` : "—"}
      </td>
      <td className="holdings-actions">
        <button type="button" className="holdings-remove" onClick={onRemove}>
          刪除
        </button>
      </td>
    </tr>
  );
}
