import { NextResponse } from "next/server";
import { getWatchlistLargeHolderSnapshots } from "@/lib/large-holder";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ids = (searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const namesRaw = searchParams.get("names") ?? "";

  const nameMap = new Map<string, string>();
  for (const part of namesRaw.split(",")) {
    const [id, ...rest] = part.split(":");
    if (id) nameMap.set(id.trim(), rest.join(":").trim() || id.trim());
  }

  const items = ids.map((stockId) => ({
    stockId,
    stockName: nameMap.get(stockId) ?? stockId,
  }));

  try {
    const holder = await getWatchlistLargeHolderSnapshots(items);
    return NextResponse.json({
      snapshots: holder.snapshots,
      periods: holder.periods,
      error: holder.error,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: (e as Error).message,
        snapshots: [],
        periods: [],
      },
      { status: 500 }
    );
  }
}
