import { getWatchlistLargeHolderSnapshotsFromTdcc } from "./tdcc-holding";
import type { ChipPeriodFetchItem } from "./chip-cache";
import type { LargeHolderSnapshot, LargeHolderTier } from "./types";

export type { LargeHolderSnapshot, LargeHolderTier };

export async function getWatchlistLargeHolderSnapshots(
  items: { stockId: string; stockName: string }[]
): Promise<{
  snapshots: LargeHolderSnapshot[];
  periods: ChipPeriodFetchItem[];
  error: string | null;
}> {
  return getWatchlistLargeHolderSnapshotsFromTdcc(items);
}
