import { NextResponse } from "next/server";
import { getLatestMarginMaintenance } from "@/lib/margin-maintenance";
import { getLatestTaiex } from "@/lib/taiex";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** 大盤指數＋融資維持率（供股價列顯示） */
export async function GET() {
  try {
    const [taiex, marginMaintenance] = await Promise.all([
      getLatestTaiex().catch(() => null),
      getLatestMarginMaintenance().catch(() => null),
    ]);
    return NextResponse.json({ taiex, marginMaintenance });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : String(e),
        taiex: null,
        marginMaintenance: null,
      },
      { status: 500 }
    );
  }
}
