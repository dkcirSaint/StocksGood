import { NextRequest, NextResponse } from "next/server";
import { getUsPmi } from "@/lib/us-pmi";

export const dynamic = "force-dynamic";

/** 美國 ISM 製造業 PMI */
export async function GET(req: NextRequest) {
  try {
    const fresh = req.nextUrl.searchParams.get("refresh") === "1";
    const series = await getUsPmi({ fresh });
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
