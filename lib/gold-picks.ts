import { getPriceCache } from "./price-cache";
import { getEstPriceTargets } from "./estimated-price";
import type { Watchlist } from "./watchlists";

export type GoldPickBand = "下緣" | "合理";

export interface GoldPick {
  stockId: string;
  stockName: string;
  close: number;
  fair: number;
  band: GoldPickBand;
  yearLabel: "今年" | "明年";
  upsidePct: number;
  closeDate: string;
}

export interface GoldPickGroup {
  listId: string;
  listName: string;
  belowLower: GoldPick[];
  belowFair: GoldPick[];
}

const HOLDINGS_LIST_NAME = "持股";

const YEARS: { yearLabel: "今年" | "明年"; lowerLabel: string; fairLabel: string }[] =
  [
    { yearLabel: "今年", lowerLabel: "今年下緣", fairLabel: "今年合理" },
    { yearLabel: "明年", lowerLabel: "明年下緣", fairLabel: "明年合理" },
  ];

function sortByUpside(picks: GoldPick[]): GoldPick[] {
  return picks.slice().sort((a, b) => b.upsidePct - a.upsidePct);
}

function makePick(
  it: { stockId: string; stockName: string },
  close: number,
  closeDate: string,
  yearLabel: "今年" | "明年",
  band: GoldPickBand,
  target: number
): GoldPick {
  return {
    stockId: it.stockId,
    stockName: it.stockName,
    close,
    fair: target,
    band,
    yearLabel,
    upsidePct: (target - close) / close,
    closeDate,
  };
}

/** 追蹤列表中，現價低於今年或明年下緣／合理價的股票；低於下緣者不重複列入合理 */
export function collectGoldPicks(lists: Watchlist[]): GoldPickGroup[] {
  const groups: GoldPickGroup[] = [];

  for (const list of lists) {
    const belowLower: GoldPick[] = [];
    const belowFair: GoldPick[] = [];
    for (const it of list.items) {
      const prices = getPriceCache(it.stockId)?.dailyPrices;
      if (!prices?.length) continue;
      const last = prices[prices.length - 1];
      const close = last.close;
      if (!Number.isFinite(close) || close <= 0) continue;

      const targets = getEstPriceTargets(it.stockId);
      for (const y of YEARS) {
        const lower = targets.find((x) => x.label === y.lowerLabel);
        if (lower && lower.price > close) {
          belowLower.push(
            makePick(it, close, last.date, y.yearLabel, "下緣", lower.price)
          );
          continue;
        }
        const fair = targets.find((x) => x.label === y.fairLabel);
        if (fair && fair.price > close) {
          belowFair.push(
            makePick(it, close, last.date, y.yearLabel, "合理", fair.price)
          );
        }
      }
    }
    const lowerSorted = sortByUpside(belowLower);
    const fairSorted = sortByUpside(belowFair);
    if (lowerSorted.length > 0 || fairSorted.length > 0) {
      groups.push({
        listId: list.id,
        listName: list.name,
        belowLower: lowerSorted,
        belowFair: fairSorted,
      });
    }
  }

  groups.sort((a, b) => {
    const aHold = a.listName === HOLDINGS_LIST_NAME;
    const bHold = b.listName === HOLDINGS_LIST_NAME;
    if (aHold === bHold) return 0;
    return aHold ? -1 : 1;
  });
  return groups;
}

export function hasGoldPicks(lists: Watchlist[]): boolean {
  return collectGoldPicks(lists).length > 0;
}
