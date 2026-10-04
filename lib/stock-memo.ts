/**
 * 個股筆記（memo）：使用者自行輸入的文字，以 localStorage 依股票代號保存。
 */

const STORAGE_KEY = "ff_stock_memo";

/** 單檔筆記長度上限，避免 localStorage 被單一股票塞爆 */
export const MAX_MEMO_LENGTH = 2000;

function loadAll(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [id, val] of Object.entries(parsed)) {
      if (typeof val !== "string") continue;
      const text = val.slice(0, MAX_MEMO_LENGTH);
      if (text.trim()) out[id] = text;
    }
    return out;
  } catch {
    return {};
  }
}

function persistAll(all: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* 容量不足時忽略，不影響其他操作 */
  }
}

export function notifyStockMemoChanged(stockId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("ff-stock-memo-changed", { detail: { stockId } })
  );
}

export function getStockMemo(stockId: string): string {
  return loadAll()[stockId] ?? "";
}

export function setStockMemo(stockId: string, memo: string) {
  const all = loadAll();
  const text = memo.slice(0, MAX_MEMO_LENGTH);
  if (!text.trim()) {
    delete all[stockId];
  } else {
    all[stockId] = text;
  }
  persistAll(all);
  notifyStockMemoChanged(stockId);
}

/** 僅保留 keep 內股票的筆記，其餘刪除 */
export function pruneToIds(keep: Set<string>) {
  if (typeof window === "undefined") return;
  const all = loadAll();
  let changed = false;
  for (const id of Object.keys(all)) {
    if (!keep.has(id)) {
      delete all[id];
      changed = true;
    }
  }
  if (changed) persistAll(all);
}
