import { NextRequest, NextResponse } from "next/server";
import { getTaiwanPmi } from "@/lib/taiwan-pmi";

export const dynamic = "force-dynamic";

/** 台灣製造業 PMI（中經院季節調整） */
export async function GET(req: NextRequest) {
  try {
    const fresh = req.nextUrl.searchParams.get("refresh") === "1";
    const series = await getTaiwanPmi({ fresh });
    return NextResponse.json(
      series,
      fresh ? { headers: { "Cache-Control": "no-store" } } : undefined
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
