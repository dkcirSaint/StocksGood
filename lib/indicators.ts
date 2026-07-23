export interface MacdPoint {
  /** DIF = EMA(fast) - EMA(slow) */
  dif: number;
  /** DEA = EMA(signal) of DIF（訊號線） */
  dea: number;
  /** 柱狀 = DIF - DEA */
  hist: number;
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values.length > 0 ? values[0] : 0;
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** 計算 MACD（預設 12/26/9），輸出與輸入等長 */
export function computeMacd(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9
): MacdPoint[] {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const dif = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const dea = ema(dif, signal);
  return closes.map((_, i) => ({
    dif: dif[i],
    dea: dea[i],
    hist: dif[i] - dea[i],
  }));
}

/** high = 頂背離（看跌）；low = 底背離（看漲） */
export type MacdDivergenceKind = "high" | "low";

/**
 * 第一層戰術動能：
 * - weak：DIF >= DEA，且近 5 日內至少 4 日 DIF-DEA 收斂（短波段轉弱）
 * - strong：DIF < DEA，且近 5 日內至少 4 日 DIF-DEA 遞增（短波段轉強）
 * - golden_cross：近 5 日內 DIF 由下向上穿越 DEA（剛金叉）
 * - death_cross：近 5 日內 DIF 由上向下穿越 DEA（剛死叉）
 */
export type MacdTacticalKind =
  | "weak"
  | "strong"
  | "golden_cross"
  | "death_cross"
  | null;

/**
 * 第三層背離狀態：
 * - watching：背離成立且仍在有效區間，尚未出現確認交叉（觀察中）
 * - confirmed：背離成立且已出現 DIF/DEA 確認交叉（可作為進場依據）
 * - expired：背離已失效（動能重新超越前一轉折，背離前提被破壞）
 */
export type MacdDivergenceStatus = "watching" | "confirmed" | "expired";

export interface MacdAnalysis {
  /** 第一層：短波段戰術動能 */
  tactical: MacdTacticalKind;
  /** 第二層：標準背離類型 */
  kind: MacdDivergenceKind | null;
  /** 最新一根的 DIF */
  dif: number;
  /** 最新一根的 DEA */
  dea: number;
  ratio: number | null;
  /** 第三層：是否已出現確認用的 DIF/DEA 交叉（頂背離死叉、底背離金叉） */
  reversal: boolean;
  /** 第三層：背離狀態；kind 為 null 時為 null */
  status: MacdDivergenceStatus | null;
  /** 形成背離的兩個轉折點索引（前、後） */
  pivotIndices?: [number, number];
}

/** 進出場狀態短標籤（底背離→進場、頂背離→出場） */
export function macdEntryExitStatusLabel(
  kind: MacdDivergenceKind | null,
  status: MacdDivergenceStatus | null
): string | null {
  if (!kind || !status) return null;
  if (kind === "low") {
    switch (status) {
      case "watching":
        return "等金叉";
      case "confirmed":
        return "可偏多進場";
      case "expired":
        return "暫緩";
    }
  }
  switch (status) {
    case "watching":
      return "等死叉";
    case "confirmed":
      return "可減碼／出場";
    case "expired":
      return "訊號取消";
  }
}

/** @deprecated 使用 MacdAnalysis */
export type MacdDivergenceAnalysis = MacdAnalysis;

export interface MacdBar {
  high: number;
  low: number;
  close: number;
}

/** swing 轉折視窗（左右各 k 根）；僅用於「前一個」已確認的波峰/波谷 */
const PIVOT_WINDOW = 3;
/** 當前這一段的高/低點距今需在此範圍內，才視為即時背離 */
const RECENT_PIVOT_MAX_AGE = 20;
/** 前一個波峰/波谷距今的最大範圍 */
const PREV_PIVOT_MAX_AGE = 60;
/** 第一層戰術：近 N 個交易日內比較 DIF-DEA 方向 */
const TACTICAL_COMPARE_DAYS = 5;
/** 第一層戰術：至少幾日同方向（5 日 4 日同向） */
const TACTICAL_MIN_SAME_DIR = 4;

/** 找出區域波峰索引：vals[i] 嚴格大於左右各 k 根 */
function findPivotHighs(vals: number[], k: number): number[] {
  const out: number[] = [];
  for (let i = k; i < vals.length - k; i++) {
    let isPivot = true;
    for (let j = 1; j <= k; j++) {
      if (!(vals[i] > vals[i - j]) || !(vals[i] > vals[i + j])) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) out.push(i);
  }
  return out;
}

/** 找出區域波谷索引：vals[i] 嚴格小於左右各 k 根 */
function findPivotLows(vals: number[], k: number): number[] {
  const out: number[] = [];
  for (let i = k; i < vals.length - k; i++) {
    let isPivot = true;
    for (let j = 1; j <= k; j++) {
      if (!(vals[i] < vals[i - j]) || !(vals[i] < vals[i + j])) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) out.push(i);
  }
  return out;
}

/** 自 fromIdx 起（含）是否出現死叉（DIF 由上向下穿越 DEA） */
function hasDeathCross(macd: MacdPoint[], fromIdx: number): boolean {
  for (let i = Math.max(fromIdx, 1); i < macd.length; i++) {
    if (macd[i - 1].dif > macd[i - 1].dea && macd[i].dif <= macd[i].dea) {
      return true;
    }
  }
  return false;
}

/** 自 fromIdx 起（含）是否出現金叉（DIF 由下向上穿越 DEA） */
function hasGoldenCross(macd: MacdPoint[], fromIdx: number): boolean {
  for (let i = Math.max(fromIdx, 1); i < macd.length; i++) {
    if (macd[i - 1].dif < macd[i - 1].dea && macd[i].dif >= macd[i].dea) {
      return true;
    }
  }
  return false;
}

/** 在 [from, to] 區間找最大值索引 */
function argMax(vals: number[], from: number, to: number): number {
  let idx = from;
  for (let i = from + 1; i <= to; i++) {
    if (vals[i] > vals[idx]) idx = i;
  }
  return idx;
}

/** 在 [from, to] 區間找最小值索引 */
function argMin(vals: number[], from: number, to: number): number {
  let idx = from;
  for (let i = from + 1; i <= to; i++) {
    if (vals[i] < vals[idx]) idx = i;
  }
  return idx;
}

/** 近 compareDays 個交易日內，DIF-DEA 至少 minSameDir 日朝指定方向變化 */
function hasSpreadTrend(
  spread: number[],
  endIdx: number,
  compareDays: number,
  minSameDir: number,
  direction: "up" | "down"
): boolean {
  if (endIdx < compareDays) return false;
  let count = 0;
  for (let i = endIdx - compareDays + 1; i <= endIdx; i++) {
    const delta = spread[i] - spread[i - 1];
    if (direction === "down" && delta < 0) count++;
    if (direction === "up" && delta > 0) count++;
  }
  return count >= minSameDir;
}

/** 近 lookbackDays 個交易日內最近一次 DIF/DEA 交叉（含當天） */
function findRecentCross(
  macd: MacdPoint[],
  lookbackDays: number
): "golden_cross" | "death_cross" | null {
  const n = macd.length;
  if (n < 2) return null;

  const startIdx = Math.max(1, n - lookbackDays);
  let lastCross: "golden_cross" | "death_cross" | null = null;

  for (let i = startIdx; i < n; i++) {
    const prev = macd[i - 1];
    const curr = macd[i];
    if (
      !Number.isFinite(prev.dif) ||
      !Number.isFinite(prev.dea) ||
      !Number.isFinite(curr.dif) ||
      !Number.isFinite(curr.dea)
    ) {
      continue;
    }
    if (prev.dif < prev.dea && curr.dif >= curr.dea) {
      lastCross = "golden_cross";
    } else if (prev.dif > prev.dea && curr.dif <= curr.dea) {
      lastCross = "death_cross";
    }
  }

  return lastCross;
}

/**
 * 第一層戰術動能（5 日 4 日同向 + 近 5 日交叉）：
 * - 近 5 日有交叉 → 剛金叉／剛死叉（優先，避免交叉後被忽略）
 * - 短波段轉弱：DIF >= DEA，且 DIF-DEA 收斂
 * - 短波段轉強：DIF < DEA，且 DIF-DEA 遞增
 */
function detectTacticalMomentum(macd: MacdPoint[]): MacdTacticalKind {
  const n = macd.length;
  if (n < TACTICAL_COMPARE_DAYS + 1) return null;

  const last = macd[n - 1];
  if (!Number.isFinite(last.dif) || !Number.isFinite(last.dea)) return null;

  const recentCross = findRecentCross(macd, TACTICAL_COMPARE_DAYS);
  if (recentCross) return recentCross;

  const spread = macd.map((m) => m.dif - m.dea);
  const endIdx = n - 1;

  if (
    last.dif >= last.dea &&
    hasSpreadTrend(
      spread,
      endIdx,
      TACTICAL_COMPARE_DAYS,
      TACTICAL_MIN_SAME_DIR,
      "down"
    )
  ) {
    return "weak";
  }

  if (
    last.dif < last.dea &&
    hasSpreadTrend(
      spread,
      endIdx,
      TACTICAL_COMPARE_DAYS,
      TACTICAL_MIN_SAME_DIR,
      "up"
    )
  ) {
    return "strong";
  }

  return null;
}

/**
 * 標準 MACD 背離判斷（即時版，每個交易日皆可判定）：
 * - 「前一個」波峰/波谷用已確認的 swing 轉折（過去的點，不影響即時性）。
 * - 「當前」的高/低點直接取前一轉折之後到今天為止的最高/最低，
 *   不需等待右側 K 棒確認，因此最新一根就能算出結果。
 *
 * 頂背離（看跌）：當前段高點高於前一波峰，但 DIF 對應值較低，且皆在零軸之上。
 * 底背離（看漲）：當前段低點低於前一波谷，但 DIF 對應值較高，且皆在零軸之下。
 * reversal 表示是否已出現確認交叉（頂背離死叉 / 底背離金叉）。
 */
function analyzeMacdDivergenceCore(
  bars: MacdBar[],
  macd: MacdPoint[]
): MacdAnalysis {
  const n = bars.length;
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const dif = macd.map((m) => m.dif);
  const tactical = detectTacticalMomentum(macd);

  const last = macd[n - 1];
  if (!Number.isFinite(last.dif) || !Number.isFinite(last.dea)) {
    return {
      tactical,
      kind: null,
      dif: last.dif,
      dea: last.dea,
      ratio: null,
      reversal: false,
      status: null,
    };
  }

  // 頂背離：前一個已確認波峰 vs 當前段最高點
  const highPivots = findPivotHighs(highs, PIVOT_WINDOW);
  let highResult: MacdDivergenceAnalysis | null = null;
  if (highPivots.length >= 1) {
    const p = highPivots[highPivots.length - 1];
    if (n - 1 - p <= PREV_PIVOT_MAX_AGE && p + 1 <= n - 1) {
      const cur = argMax(highs, p + 1, n - 1);
      const recent = n - 1 - cur <= RECENT_PIVOT_MAX_AGE;
      const higherHigh = highs[cur] > highs[p];
      const lowerMacdHigh = dif[cur] < dif[p];
      const aboveZero = dif[p] > 0 && dif[cur] > 0;
      if (recent && higherHigh && lowerMacdHigh && aboveZero) {
        // 自當前高點起是否出現死叉（確認）
        const confirmed = hasDeathCross(macd, cur);
        // 動能是否已重新超越前一波峰（背離失效）
        const invalidated = last.dif > dif[p];
        const status: MacdDivergenceStatus = confirmed
          ? "confirmed"
          : invalidated
            ? "expired"
            : "watching";
        highResult = {
          tactical,
          kind: "high",
          dif: last.dif,
          dea: last.dea,
          ratio: null,
          reversal: confirmed,
          status,
          pivotIndices: [p, cur],
        };
      }
    }
  }

  // 底背離：前一個已確認波谷 vs 當前段最低點
  const lowPivots = findPivotLows(lows, PIVOT_WINDOW);
  let lowResult: MacdDivergenceAnalysis | null = null;
  if (lowPivots.length >= 1) {
    const p = lowPivots[lowPivots.length - 1];
    if (n - 1 - p <= PREV_PIVOT_MAX_AGE && p + 1 <= n - 1) {
      const cur = argMin(lows, p + 1, n - 1);
      const recent = n - 1 - cur <= RECENT_PIVOT_MAX_AGE;
      const lowerLow = lows[cur] < lows[p];
      const higherMacdLow = dif[cur] > dif[p];
      const belowZero = dif[p] < 0 && dif[cur] < 0;
      if (recent && lowerLow && higherMacdLow && belowZero) {
        // 自當前低點起是否出現金叉（確認）
        const confirmed = hasGoldenCross(macd, cur);
        // 動能是否已重新跌破前一波谷（背離失效）
        const invalidated = last.dif < dif[p];
        const status: MacdDivergenceStatus = confirmed
          ? "confirmed"
          : invalidated
            ? "expired"
            : "watching";
        lowResult = {
          tactical,
          kind: "low",
          dif: last.dif,
          dea: last.dea,
          ratio: null,
          reversal: confirmed,
          status,
          pivotIndices: [p, cur],
        };
      }
    }
  }

  // 若兩者皆成立，取當前點較新的
  if (highResult && lowResult) {
    return highResult.pivotIndices![1] >= lowResult.pivotIndices![1]
      ? highResult
      : lowResult;
  }
  if (highResult) return highResult;
  if (lowResult) return lowResult;

  return {
    tactical,
    kind: null,
    dif: last.dif,
    dea: last.dea,
    ratio: null,
    reversal: false,
    status: null,
  };
}

/**
 * MACD 三層分析：
 * 1. 戰術（5 日 4 日同向）短波段轉弱／轉強
 * 2. 結構：標準背離（價格 vs DIF）
 * 3. 進出場：確認交叉（死叉／金叉）
 */
export function analyzeMacd(bars: MacdBar[]): MacdAnalysis | null {
  const n = bars.length;
  if (n < 35) return null;
  const closes = bars.map((b) => b.close);
  const macd = computeMacd(closes);
  return analyzeMacdDivergenceCore(bars, macd);
}

/** @deprecated 使用 analyzeMacd */
export function analyzeMacdDivergence(bars: MacdBar[]): MacdAnalysis | null {
  return analyzeMacd(bars);
}

/** 以標準背離判斷回傳類型 */
export function getMacdDivergence(bars: MacdBar[]): MacdDivergenceKind | null {
  return analyzeMacd(bars)?.kind ?? null;
}

/** 簡單移動平均；資料不足 period 根時為 null */
export function computeSma(
  closes: number[],
  period: number
): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    return sum / period;
  });
}

export const MA_PERIODS = [5, 10, 20, 60] as const;

export type MaPeriod = (typeof MA_PERIODS)[number];

export const MA_COLORS: Record<MaPeriod, string> = {
  5: "#f6c454",
  10: "#e879f9",
  20: "#4f8cff",
  60: "#2ecc8f",
};
