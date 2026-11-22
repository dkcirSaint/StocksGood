import type { MacroPoint } from "./macro-series";
import type { RegimeId } from "./market-regime";
import { REGIME_DEFS } from "./market-regime";

/** 製造業 PMI 榮枯線 */
export const PMI_LINE = 50;

export type PmiCombo =
  | "bothExpand"
  | "bothContract"
  | "twExpandUsContract"
  | "twContractUsExpand";

export interface PmiSide {
  label: string;
  /** 確認對象：台股出口鏈或美股／全球供應鏈 */
  confirms: string;
  date: string;
  value: number;
  prevDate: string | null;
  prevValue: number | null;
  delta: number | null;
  expand: boolean;
  direction: "up" | "down" | "flat" | null;
}

export interface PmiReading {
  tw: PmiSide | null;
  us: PmiSide | null;
  combo: PmiCombo | null;
  comboName: string | null;
  comboMeaning: string | null;
  vsRegime: string | null;
}

function lastTwo(points: MacroPoint[]): [MacroPoint, MacroPoint | null] | null {
  const sorted = points
    .filter((p) => p.date && Number.isFinite(p.value))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return null;
  const last = sorted[sorted.length - 1];
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  return [last, prev];
}

function sideFrom(
  points: MacroPoint[] | null | undefined,
  label: string,
  confirms: string
): PmiSide | null {
  if (!points?.length) return null;
  const pair = lastTwo(points);
  if (!pair) return null;
  const [last, prev] = pair;
  const delta = prev ? last.value - prev.value : null;
  let direction: PmiSide["direction"] = null;
  if (delta != null) {
    if (delta > 0) direction = "up";
    else if (delta < 0) direction = "down";
    else direction = "flat";
  }
  return {
    label,
    confirms,
    date: last.date,
    value: last.value,
    prevDate: prev?.date ?? null,
    prevValue: prev?.value ?? null,
    delta,
    expand: last.value >= PMI_LINE,
    direction,
  };
}

function comboOf(tw: PmiSide | null, us: PmiSide | null): PmiCombo | null {
  if (!tw || !us) return null;
  if (tw.expand && us.expand) return "bothExpand";
  if (!tw.expand && !us.expand) return "bothContract";
  if (tw.expand && !us.expand) return "twExpandUsContract";
  return "twContractUsExpand";
}

const COMBO_COPY: Record<PmiCombo, { name: string; meaning: string }> = {
  bothExpand: {
    name: "雙擴張",
    meaning: "實質需求同步，對台美都是確認。",
  },
  bothContract: {
    name: "雙收縮",
    meaning: "製造業同步轉弱；即使資金面偏鬆，也要當心獲利下修。",
  },
  twExpandUsContract: {
    name: "台擴美縮",
    meaning: "台灣出口鏈相對好，美股週期股較弱。",
  },
  twContractUsExpand: {
    name: "台縮美擴",
    meaning: "台灣出口／亞洲鏈較弱，美股製造業還行，台股可能落後。",
  },
};

function vsRegimeLine(
  regimeId: RegimeId,
  combo: PmiCombo | null,
  tw: PmiSide | null
): string | null {
  const def = REGIME_DEFS.find((d) => d.id === regimeId);
  const tag = def ? `狀況 ${regimeId} ${def.name}` : `狀況 ${regimeId}`;
  const loose = regimeId === 1 || regimeId === 2 || regimeId === 3;
  const panic = regimeId === 8 || regimeId === 9;

  if (loose && combo === "bothExpand") {
    return `相對目前「${tag}」：資金與景氣同向。`;
  }
  if (loose && combo === "bothContract") {
    return `相對目前「${tag}」：錢鬆、景氣差，當心獲利下修。`;
  }
  if (panic && combo === "bothExpand") {
    return `相對目前「${tag}」：市場在怕，景氣還沒壞。`;
  }
  if (regimeId === 6 && tw && !tw.expand) {
    return `相對目前「${tag}」：資金抽離又碰上出口弱，台股壓力更大。`;
  }
  return null;
}

/** 台灣／美國製造業 PMI 實質面確認；不參與九種狀況判定 */
export function assessPmiReading(
  twPoints: MacroPoint[] | null | undefined,
  usPoints: MacroPoint[] | null | undefined,
  regimeId: RegimeId
): PmiReading {
  const tw = sideFrom(twPoints, "台灣 PMI", "台股出口鏈");
  const us = sideFrom(usPoints, "美國 PMI", "美股／全球供應鏈");
  const combo = comboOf(tw, us);
  const copy = combo ? COMBO_COPY[combo] : null;
  return {
    tw,
    us,
    combo,
    comboName: copy?.name ?? null,
    comboMeaning: copy?.meaning ?? null,
    vsRegime: vsRegimeLine(regimeId, combo, tw),
  };
}
