"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const LEGACY_KEY = "ff_holdings";
const ACCOUNTS_KEY = "ff_holding_accounts";
const BY_ACCOUNT_KEY = "ff_account_holdings";
const SELECTED_KEY = "ff_selected_holding_account";

export interface Holding {
  stockId: string;
  stockName: string;
  shares: number;
  totalCost: number;
}

export interface HoldingAccount {
  id: string;
  name: string;
}

export interface HoldingRow extends Holding {
  avgCost: number;
  currentPrice: number | null;
  marketValue: number | null;
  pnl: number | null;
  pnlPct: number | null;
  weight: number | null;
}

function isPositiveNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function parseHolding(raw: unknown): Holding | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.stockId !== "string" || !o.stockId.trim()) return null;
  if (typeof o.stockName !== "string") return null;
  if (!isPositiveNumber(o.shares) || !isPositiveNumber(o.totalCost)) return null;
  return {
    stockId: o.stockId.trim(),
    stockName: o.stockName.trim() || o.stockId.trim(),
    shares: o.shares,
    totalCost: o.totalCost,
  };
}

function parseHoldingList(raw: unknown): Holding[] {
  if (!Array.isArray(raw)) return [];
  const out: Holding[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const h = parseHolding(item);
    if (!h || seen.has(h.stockId)) continue;
    seen.add(h.stockId);
    out.push(h);
  }
  return out;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 容量不足時忽略 */
  }
}

function dropLegacyHoldings() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* 忽略 */
  }
}

function genAccountId(): string {
  return `ha_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function loadAccounts(): HoldingAccount[] {
  const parsed = readJson<unknown>(ACCOUNTS_KEY, []);
  if (!Array.isArray(parsed)) return [];
  const out: HoldingAccount[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id.trim()) continue;
    if (o.id === "unassigned") continue;
    if (typeof o.name !== "string" || !o.name.trim()) continue;
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    out.push({ id: o.id, name: o.name.trim() });
  }
  return out;
}

function loadByAccount(): Record<string, Holding[]> {
  const parsed = readJson<unknown>(BY_ACCOUNT_KEY, {});
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: Record<string, Holding[]> = {};
  for (const [id, list] of Object.entries(parsed as Record<string, unknown>)) {
    if (id === "unassigned") continue;
    out[id] = parseHoldingList(list);
  }
  return out;
}

function loadSelectedId(): string | null {
  const raw = readJson<unknown>(SELECTED_KEY, null);
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export function addOrMergeHolding(
  holdings: Holding[],
  incoming: Holding
): Holding[] {
  const idx = holdings.findIndex((h) => h.stockId === incoming.stockId);
  if (idx < 0) return [...holdings, incoming];
  const existing = holdings[idx];
  const next = holdings.slice();
  next[idx] = {
    stockId: existing.stockId,
    stockName: incoming.stockName || existing.stockName,
    shares: existing.shares + incoming.shares,
    totalCost: existing.totalCost + incoming.totalCost,
  };
  return next;
}

export function removeHolding(
  holdings: Holding[],
  stockId: string
): Holding[] {
  return holdings.filter((h) => h.stockId !== stockId);
}

export function deriveHoldingRows(
  holdings: Holding[],
  quotes: Record<string, number>
): HoldingRow[] {
  const rows = holdings.map((h) => {
    const currentPrice = Number.isFinite(quotes[h.stockId])
      ? quotes[h.stockId]
      : null;
    const avgCost = h.shares > 0 ? h.totalCost / h.shares : 0;
    const marketValue =
      currentPrice != null ? currentPrice * h.shares : null;
    const pnl = marketValue != null ? marketValue - h.totalCost : null;
    const pnlPct =
      pnl != null && h.totalCost > 0 ? pnl / h.totalCost : null;
    return {
      ...h,
      avgCost,
      currentPrice,
      marketValue,
      pnl,
      pnlPct,
      weight: null as number | null,
    };
  });
  const totalMv = rows.reduce((sum, r) => sum + (r.marketValue ?? 0), 0);
  return rows.map((r) => ({
    ...r,
    weight:
      r.marketValue != null && totalMv > 0 ? r.marketValue / totalMv : null,
  }));
}

/** 已有現價的損益加總；無持股或全部尚無現價時回 null */
export function sumHoldingPnl(rows: HoldingRow[]): number | null {
  let sum = 0;
  let hasPnl = false;
  for (const r of rows) {
    if (r.pnl == null) continue;
    sum += r.pnl;
    hasPnl = true;
  }
  return hasPnl ? sum : null;
}

function resolveSelectedId(
  saved: string | null,
  accounts: HoldingAccount[]
): string | null {
  if (saved && accounts.some((a) => a.id === saved)) return saved;
  return accounts[0]?.id ?? null;
}

export interface UseHoldings {
  ready: boolean;
  accounts: HoldingAccount[];
  selectedId: string | null;
  selectedName: string;
  holdings: Holding[];
  byAccount: Record<string, Holding[]>;
  allStockIds: string[];
  selectAccount: (id: string) => void;
  createAccount: (name: string) => { ok: boolean; error?: string };
  deleteSelectedAccount: () => { ok: boolean; error?: string };
  addOrMerge: (accountId: string, item: Holding) => { ok: boolean; error?: string };
  remove: (accountId: string, stockId: string) => void;
}

export function useHoldings(): UseHoldings {
  const [accounts, setAccounts] = useState<HoldingAccount[]>([]);
  const [byAccount, setByAccount] = useState<Record<string, Holding[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    dropLegacyHoldings();
    const loadedAccounts = loadAccounts();
    const loadedByAccount = loadByAccount();
    setAccounts(loadedAccounts);
    setByAccount(loadedByAccount);
    setSelectedId(resolveSelectedId(loadSelectedId(), loadedAccounts));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    writeJson(ACCOUNTS_KEY, accounts);
  }, [ready, accounts]);

  useEffect(() => {
    if (!ready) return;
    writeJson(BY_ACCOUNT_KEY, byAccount);
  }, [ready, byAccount]);

  useEffect(() => {
    if (!ready) return;
    if (selectedId) writeJson(SELECTED_KEY, selectedId);
    else {
      try {
        window.localStorage.removeItem(SELECTED_KEY);
      } catch {
        /* 忽略 */
      }
    }
  }, [ready, selectedId]);

  const resolvedId = useMemo(
    () => resolveSelectedId(selectedId, accounts),
    [selectedId, accounts]
  );

  const selectedName = useMemo(() => {
    if (!resolvedId) return "";
    return accounts.find((a) => a.id === resolvedId)?.name ?? "";
  }, [resolvedId, accounts]);

  const holdings = useMemo(() => {
    if (!resolvedId) return [];
    return byAccount[resolvedId] ?? [];
  }, [resolvedId, byAccount]);

  const allStockIds = useMemo(() => {
    const ids = new Set<string>();
    for (const list of Object.values(byAccount)) {
      for (const h of list) ids.add(h.stockId);
    }
    return [...ids];
  }, [byAccount]);

  const selectAccount = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const createAccount = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: "請輸入帳號名稱" };
    if (accounts.some((a) => a.name === trimmed)) {
      return { ok: false, error: `帳號「${trimmed}」已存在` };
    }
    const createdId = genAccountId();
    setAccounts((prev) => {
      if (prev.some((a) => a.name === trimmed || a.id === createdId)) return prev;
      return [...prev, { id: createdId, name: trimmed }];
    });
    setSelectedId(createdId);
    return { ok: true };
  }, [accounts]);

  const deleteSelectedAccount = useCallback(() => {
    if (!resolvedId) return { ok: false, error: "尚無帳號可刪" };
    const remaining = accounts.filter((a) => a.id !== resolvedId);
    setAccounts(remaining);
    setByAccount((prev) => {
      if (!(resolvedId in prev)) return prev;
      const next = { ...prev };
      delete next[resolvedId];
      return next;
    });
    setSelectedId(resolveSelectedId(null, remaining));
    return { ok: true };
  }, [resolvedId, accounts]);

  const addOrMerge = useCallback(
    (accountId: string, item: Holding) => {
      if (!accountId) return { ok: false, error: "請先建立並選擇帳號" };
      if (!accounts.some((a) => a.id === accountId)) {
        return { ok: false, error: "找不到這個帳號" };
      }
      setByAccount((prev) => ({
        ...prev,
        [accountId]: addOrMergeHolding(prev[accountId] ?? [], item),
      }));
      setSelectedId(accountId);
      return { ok: true };
    },
    [accounts]
  );

  const remove = useCallback((accountId: string, stockId: string) => {
    setByAccount((prev) => ({
      ...prev,
      [accountId]: removeHolding(prev[accountId] ?? [], stockId),
    }));
  }, []);

  return {
    ready,
    accounts,
    selectedId: resolvedId,
    selectedName,
    holdings,
    byAccount,
    allStockIds,
    selectAccount,
    createAccount,
    deleteSelectedAccount,
    addOrMerge,
    remove,
  };
}
