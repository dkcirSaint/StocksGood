import { NextRequest, NextResponse } from "next/server";
import { getTreasuryYields } from "@/lib/treasury-yields";

export const dynamic = "force-dynamic";

/** 美國 2 年期、10 年期公債殖利率（近兩個年度的每日資料） */
export async function GET(req: NextRequest) {
  try {
    const fresh = req.nextUrl.searchParams.get("refresh") === "1";
    const points = await getTreasuryYields({ fresh });
    return NextResponse.json(
      { points },
      fresh ? { headers: { "Cache-Control": "no-store" } } : undefined
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
