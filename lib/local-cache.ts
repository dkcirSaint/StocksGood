/**
 * 本地端資料維護：只保留「追蹤列表內」股票的資料。
 * 任一股票若不在任何追蹤列表中，其所有本地端紀錄（價格、財報、籌碼、行事曆、
 * 融資使用率、預估 EPS、本益比區間、筆記、別名）都會一併移除。
 */

import { pruneToIds as prunePrice } from "./price-cache";
import { pruneToIds as pruneFinancial } from "./financial-cache";
import { pruneToIds as pruneChip } from "./chip-cache";
import { pruneToIds as pruneEvents } from "./event-cache";
import { pruneToIds as pruneMargin } from "./margin-usage-cache";
import { pruneToIds as pruneEps } from "./estimated-eps";
import { pruneToIds as prunePe } from "./pe-band";
import { pruneToIds as pruneMemo } from "./stock-memo";

/** 僅保留 keepIds 內股票的本地資料，其餘全部清除 */
export function purgeUnwatchedLocalData(keepIds: Iterable<string>) {
  if (typeof window === "undefined") return;

  const keep = new Set<string>();
  for (const id of keepIds) {
    const s = String(id).trim();
    if (s) keep.add(s);
  }

  prunePrice(keep);
  pruneFinancial(keep);
  pruneChip(keep);
  pruneEvents(keep);
  pruneMargin(keep);
  pruneEps(keep);
  prunePe(keep);
  pruneMemo(keep);
}
