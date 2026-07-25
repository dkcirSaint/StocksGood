export type EpsYearKind = "thisYear" | "nextYear";

export interface StockEstimatedEps {
  thisYear: number | null;
  nextYear: number | null;
}

const STORAGE_KEY = "ff_estimated_eps";

function emptyEps(): StockEstimatedEps {
  return { thisYear: null, nextYear: null };
}

function loadAll(): Record<string, StockEstimatedEps> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, StockEstimatedEps> = {};
    for (const [id, val] of Object.entries(parsed)) {
      if (!val || typeof val !== "object") continue;
      const obj = val as Record<string, unknown>;
      const thisYear =
        typeof obj.thisYear === "number" && Number.isFinite(obj.thisYear)
          ? obj.thisYear
          : null;
      const nextYear =
        typeof obj.nextYear === "number" && Number.isFinite(obj.nextYear)
          ? obj.nextYear
          : null;
      if (thisYear != null || nextYear != null) {
        out[id] = { thisYear, nextYear };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function persistAll(all: Record<string, StockEstimatedEps>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function notifyEstimatedEpsChanged(stockId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("ff-estimated-eps-changed", { detail: { stockId } })
  );
}

export function getEstimatedEps(stockId: string): StockEstimatedEps {
  return loadAll()[stockId] ?? emptyEps();
}

export function getEstimatedEpsForYear(
  stockId: string,
  year: EpsYearKind
): number | null {
  return getEstimatedEps(stockId)[year];
}

/** 解析預估 EPS（允許小數，須為有限數字） */
export function parseEpsInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function formatEstimatedEps(n: number): string {
  return n.toLocaleString("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export type SetEstimatedEpsResult =
  | { ok: true; eps: StockEstimatedEps }
  | { ok: false; reason: "invalid" };

export function setEstimatedEps(
  stockId: string,
  year: EpsYearKind,
  value: number
): SetEstimatedEpsResult {
  if (!Number.isFinite(value)) {
    return { ok: false, reason: "invalid" };
  }
  const all = loadAll();
  const current = all[stockId] ?? emptyEps();
  const next: StockEstimatedEps = { ...current, [year]: value };
  all[stockId] = next;
  persistAll(all);
  notifyEstimatedEpsChanged(stockId);
  return { ok: true, eps: next };
}

export function epsYearLabel(year: EpsYearKind): string {
  return year === "thisYear" ? "今年" : "明年";
}
