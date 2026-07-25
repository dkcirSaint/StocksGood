/**
 * 使用者自行輸入的本益比區間（下緣／合理／上緣），以 localStorage 依股票代號保存。
 */

export interface PeBand {
  lower: string;
  fair: string;
  upper: string;
}

const STORAGE_KEY = "ff_pe_band";

export function emptyPeBand(): PeBand {
  return { lower: "", fair: "", upper: "" };
}

function loadAll(): Record<string, PeBand> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, PeBand> = {};
    for (const [id, val] of Object.entries(parsed)) {
      if (!val || typeof val !== "object") continue;
      const obj = val as Record<string, unknown>;
      const band: PeBand = {
        lower: typeof obj.lower === "string" ? obj.lower : "",
        fair: typeof obj.fair === "string" ? obj.fair : "",
        upper: typeof obj.upper === "string" ? obj.upper : "",
      };
      if (band.lower || band.fair || band.upper) out[id] = band;
    }
    return out;
  } catch {
    return {};
  }
}

function persistAll(all: Record<string, PeBand>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function notifyPeBandChanged(stockId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("ff-pe-band-changed", { detail: { stockId } })
  );
}

export function getPeBand(stockId: string): PeBand {
  return loadAll()[stockId] ?? emptyPeBand();
}

export function setPeBand(stockId: string, band: PeBand) {
  const all = loadAll();
  if (!band.lower && !band.fair && !band.upper) {
    delete all[stockId];
  } else {
    all[stockId] = band;
  }
  persistAll(all);
  notifyPeBandChanged(stockId);
}
