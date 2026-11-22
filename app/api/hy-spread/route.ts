import { NextRequest, NextResponse } from "next/server";
import { getHySpread } from "@/lib/hy-spread";

export const dynamic = "force-dynamic";

/** ICE BofA 美國高收益債 OAS（%） */
export async function GET(req: NextRequest) {
  try {
    const fresh = req.nextUrl.searchParams.get("refresh") === "1";
    const series = await getHySpread({ fresh });
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
