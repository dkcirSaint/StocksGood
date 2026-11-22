import { NextRequest, NextResponse } from "next/server";
import { getFedFundsQuote } from "@/lib/fed-funds";

export const dynamic = "force-dynamic";

/** 目前聯邦基金利率（目標區間、有效利率與近兩年日資料） */
export async function GET(req: NextRequest) {
  try {
    const fresh = req.nextUrl.searchParams.get("refresh") === "1";
    const quote = await getFedFundsQuote({ fresh });
    return NextResponse.json(
      quote,
      fresh ? { headers: { "Cache-Control": "no-store" } } : undefined
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
