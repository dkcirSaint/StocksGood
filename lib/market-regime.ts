import type { DailyPrice } from "./types";
import type { TreasuryYieldPoint } from "./treasury-yields";
import { getUpcomingFomcMeetings } from "./fomc";

/** 近 5 個交易日 VIX 上漲點數達此值（或收盤 ≥ 30）視為急升 */
export const VIX_SPIKE_POINTS = 5;
export const VIX_PANIC_LEVEL = 30;
export const VIX_LOW_LEVEL = 20;
/** 近 15 個交易日 10 年期變動達此基點視為急升／急降 */
export const YIELD_SPIKE_BP = 25;
export const YIELD_SLOW_RISE_BP = 5;
/** 近 21 日美元漲幅達此％且 63 日為正視為走強 */
export const DXY_STRONG_21D_PCT = 1.5;

export type RegimeId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** 狀況框色帶：1～2 藍、3～4 黃、5～9 紅 */
export type RegimeTone = "bull" | "watch" | "bear";

export function regimeTone(id: RegimeId): RegimeTone {
  if (id <= 2) return "bull";
  if (id <= 4) return "watch";
  return "bear";
}

export interface RegimeDef {
  id: RegimeId;
  name: string;
  /** 一句含義 */
  meaning: string;
  /** 分類依據（用到哪些數據、什麼條件） */
  basis: string;
  /** 是否可由站內數據自動命中 */
  auto: boolean;
}

/** 編號 1＝最看多、9＝最看空；陣列順序即顯示順序 */
export const REGIME_DEFS: RegimeDef[] = [
  {
    id: 1,
    name: "偏鬆",
    meaning:
      "不怕、錢沒更貴；約一季台美都較順，但也是自滿，不是保證再漲一年。",
    basis: "VIX 未急升、10 年期未急升、美元未走強（前面狀況都未命中時的預設）。",
    auto: true,
  },
  {
    id: 2,
    name: "高利率自滿",
    meaning: "利率偏高或緩升，但市場還沒怕；能漲但緩衝薄。",
    basis: "VIX 低檔（＜20 且未急升），且 10 年期偏高或緩升（高於 63 日均，或近 15 日 +5～+24 bp）。",
    auto: true,
  },
  {
    id: 3,
    name: "緊但穩",
    meaning:
      "利率在急升，VIX 仍低；敘事還在，但不穩，一旦恐慌補上會轉成評價緊縮或恐慌。",
    basis: "10 年期近 15 日急升（≥25 bp），且 VIX 低檔（＜20 且未急升）。",
    auto: true,
  },
  {
    id: 4,
    name: "倒掛",
    meaning:
      "10 年期低於 2 年期，是約 1～2 年的衰退預警旗標，不是當季一定要空。",
    basis: "10Y−2Y ＜0，且 VIX 未急升、10 年期未急升、美元未走強。",
    auto: true,
  },
  {
    id: 5,
    name: "Fed 改口",
    meaning:
      "下次會議升／降／維持機率被大幅改寫，屬會議博弈。站內沒有 CME 機率，無法自動判定。",
    basis: "需 CME FedWatch 機率；站內只有會議日期，不自動分類。",
    auto: false,
  },
  {
    id: 6,
    name: "美元抽水",
    meaning:
      "資金偏向美元；台股／外資壓力常大於美股本身，即使美股不一定差。",
    basis: "美元指數走強（近 21 日 ≥+1.5% 且近 63 日為正）；VIX、10 年期未先命中上面狀況。",
    auto: true,
  },
  {
    id: 7,
    name: "評價緊縮",
    meaning:
      "錢突然變貴；高本益比、那斯達克與費城半導體較先痛，未必是崩盤。",
    basis: "10 年期近 15 日急升（≥25 bp），且 VIX 不是低檔。",
    auto: true,
  },
  {
    id: 8,
    name: "恐慌",
    meaning: "風險胃納關掉，資金在逃；未來約一季波動大，宜先防守。",
    basis: "VIX 急升（近 5 日 ≥+5 點或收盤 ≥30），但 10 年期沒有急降。",
    auto: true,
  },
  {
    id: 9,
    name: "怕而債跌",
    meaning:
      "VIX 急升且公債殖利率急降，是逃進公債；債息下降此時不是利多。",
    basis: "VIX 急升（近 5 日 ≥+5 點或收盤 ≥30），且 10 年期近 15 日急降（≤−25 bp）。",
    auto: true,
  },
];

export interface WindowChange {
  fromDate: string;
  toDate: string;
  from: number;
  to: number;
  delta: number;
}

export interface RegimeInputFlags {
  vixSpike: boolean;
  vixLow: boolean;
  yieldSpike: boolean;
  yieldPlunge: boolean;
  yieldHighOrSlow: boolean;
  inverted: boolean;
  dxyStrong: boolean;
}

export interface RegimeAssessment {
  id: RegimeId;
  invertedBadge: boolean;
  flags: RegimeInputFlags;
  reasons: string[];
  vix: { last: number; date: string; d5: WindowChange | null };
  y10: { last: number; date: string; d15: WindowChange | null; sma63: number | null };
  spreadBp: number | null;
  dxy: { last: number; date: string; d21pct: WindowChange | null; d63pct: WindowChange | null };
  fed: { nextEnd: string | null; sep: boolean };
}

function windowChange(
  values: Array<{ date: string; value: number }>,
  sessions: number
): WindowChange | null {
  if (values.length < 2) return null;
  const last = values[values.length - 1];
  const prev = values[Math.max(0, values.length - 1 - sessions)];
  if (prev.date === last.date) return null;
  return {
    fromDate: prev.date,
    toDate: last.date,
    from: prev.value,
    to: last.value,
    delta: last.value - prev.value,
  };
}

function sma(values: number[], n: number): number | null {
  if (values.length === 0) return null;
  const slice = values.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function classify(flags: RegimeInputFlags): RegimeId {
  if (flags.vixSpike && flags.yieldPlunge) return 9;
  if (flags.vixSpike) return 8;
  if (flags.yieldSpike && flags.vixLow) return 3;
  if (flags.yieldSpike) return 7;
  if (flags.dxyStrong) return 6;
  if (flags.vixLow && flags.yieldHighOrSlow) return 2;
  if (flags.inverted && !flags.yieldSpike && !flags.vixSpike && !flags.dxyStrong) {
    return 4;
  }
  return 1;
}

function pct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function bp(n: number): string {
  const v = Math.round(n);
  return `${v > 0 ? "+" : ""}${v} bp`;
}

function pts(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}`;
}

/** 依 VIX、公債、美元判定共用層狀況；Fed 僅附會議日期、不參與自動命中 */
export function assessMarketRegime(
  yields: TreasuryYieldPoint[],
  vix: DailyPrice[],
  dxy: DailyPrice[],
  now = new Date()
): RegimeAssessment | null {
  if (yields.length < 2 || vix.length < 2 || dxy.length < 2) return null;

  const vixSeries = vix.map((p) => ({ date: p.date, value: p.close }));
  const y10Series = yields.map((p) => ({ date: p.date, value: p.y10 }));
  const dxySeries = dxy.map((p) => ({ date: p.date, value: p.close }));

  const vixLast = vixSeries[vixSeries.length - 1];
  const yLast = yields[yields.length - 1];
  const dxyLast = dxySeries[dxySeries.length - 1];

  const vixD5 = windowChange(vixSeries, 5);
  const y10D15 = windowChange(y10Series, 15);
  const y10Sma63 = sma(y10Series.map((p) => p.value), 63);
  const dxyD21 = windowChange(dxySeries, 21);
  const dxyD63 = windowChange(dxySeries, 63);

  const vixSpike =
    vixLast.value >= VIX_PANIC_LEVEL ||
    (vixD5 != null && vixD5.delta >= VIX_SPIKE_POINTS);
  const vixLow = vixLast.value < VIX_LOW_LEVEL && !vixSpike;
  const y10Bp15 = y10D15 ? y10D15.delta * 100 : 0;
  const yieldSpike = y10D15 != null && y10Bp15 >= YIELD_SPIKE_BP;
  const yieldPlunge = y10D15 != null && y10Bp15 <= -YIELD_SPIKE_BP;
  const inverted = yLast.y10 - yLast.y2 < 0;
  const yieldHighOrSlow =
    !yieldSpike &&
    ((y10Sma63 != null && yLast.y10 > y10Sma63) ||
      (y10D15 != null && y10Bp15 >= YIELD_SLOW_RISE_BP && y10Bp15 < YIELD_SPIKE_BP));
  const d21pct = dxyD21 ? (dxyD21.delta / dxyD21.from) * 100 : 0;
  const d63pct = dxyD63 ? (dxyD63.delta / dxyD63.from) * 100 : 0;
  const dxyStrong =
    dxyD21 != null &&
    dxyD63 != null &&
    d21pct >= DXY_STRONG_21D_PCT &&
    d63pct > 0;

  const flags: RegimeInputFlags = {
    vixSpike,
    vixLow,
    yieldSpike,
    yieldPlunge,
    yieldHighOrSlow,
    inverted,
    dxyStrong,
  };
  const id = classify(flags);
  const next = getUpcomingFomcMeetings(1, now)[0] ?? null;

  const reasons: string[] = [];
  reasons.push(
    vixD5
      ? `VIX 收 ${vixLast.value.toFixed(1)}（${vixLast.date}），近 5 個交易日 ${pts(vixD5.delta)} 點（自 ${vixD5.fromDate} 的 ${vixD5.from.toFixed(1)}）。急升門檻：5 日 ≥ +${VIX_SPIKE_POINTS} 點或收盤 ≥ ${VIX_PANIC_LEVEL} → ${vixSpike ? "達到急升" : "未達急升"}；低檔門檻：收盤 < ${VIX_LOW_LEVEL} 且非急升 → ${vixLow ? "低檔" : "非低檔"}。`
      : `VIX 收 ${vixLast.value.toFixed(1)}（${vixLast.date}）。`
  );
  reasons.push(
    y10D15
      ? `10 年期 ${yLast.y10.toFixed(2)}%、2 年期 ${yLast.y2.toFixed(2)}%（${yLast.date}），近 15 個交易日 10 年期 ${bp(y10Bp15)}（自 ${y10D15.fromDate} 的 ${y10D15.from.toFixed(2)}%）。急升／急降門檻：±${YIELD_SPIKE_BP} bp → ${yieldSpike ? "急升" : yieldPlunge ? "急降" : "非急升亦非急降"}。`
      : `10 年期 ${yLast.y10.toFixed(2)}%、2 年期 ${yLast.y2.toFixed(2)}%（${yLast.date}）。`
  );
  const spreadBp = Math.round((yLast.y10 - yLast.y2) * 100);
  reasons.push(
    `10Y−2Y 利差 ${bp(spreadBp)} → ${inverted ? "倒掛" : "未倒掛"}（0 為分界）。`
  );
  if (y10Sma63 != null) {
    reasons.push(
      `10 年期相對近 63 日均 ${y10Sma63.toFixed(2)}% 為 ${yLast.y10 > y10Sma63 ? "之上" : "之下"}；緩升區間 +${YIELD_SLOW_RISE_BP}～+${YIELD_SPIKE_BP - 1} bp → ${yieldHighOrSlow ? "利率偏高或緩升" : "未達偏高／緩升"}。`
    );
  }
  reasons.push(
    dxyD21 && dxyD63
      ? `美元指數 ${dxyLast.value.toFixed(2)}（${dxyLast.date}），近 21 日 ${pct(d21pct)}、近 63 日 ${pct(d63pct)}。走強門檻：21 日 ≥ +${DXY_STRONG_21D_PCT}% 且 63 日為正 → ${dxyStrong ? "走強" : "未走強（走弱或盤整）"}。`
      : `美元指數 ${dxyLast.value.toFixed(2)}（${dxyLast.date}）。`
  );
  reasons.push(
    next
      ? `Fed Watch：下次決議日 ${next.end}${next.sep ? "（含經濟預測／點陣圖）" : ""}。站內沒有 CME 升／降息機率，狀況 5（Fed 改口）不自動命中。`
      : "Fed Watch：行程表上暫無即將到來的會議；狀況 5 不自動命中。"
  );

  const hit = REGIME_DEFS.find((d) => d.id === id);
  reasons.push(
    `依優先順序（9 怕而債跌 → 8 恐慌 → 3 緊但穩 → 7 評價緊縮 → 6 美元抽水 → 2 高利率自滿 → 4 倒掛 → 1 偏鬆）命中「狀況 ${id} ${hit?.name ?? ""}」。`
  );

  return {
    id,
    invertedBadge: inverted && id !== 4,
    flags,
    reasons,
    vix: { last: vixLast.value, date: vixLast.date, d5: vixD5 },
    y10: {
      last: yLast.y10,
      date: yLast.date,
      d15: y10D15,
      sma63: y10Sma63,
    },
    spreadBp,
    dxy: {
      last: dxyLast.value,
      date: dxyLast.date,
      d21pct: dxyD21,
      d63pct: dxyD63,
    },
    fed: { nextEnd: next?.end ?? null, sep: next?.sep ?? false },
  };
}
