import { NextRequest, NextResponse } from "next/server";
import {
  getGlobalIndexDef,
  getGlobalIndexPrices,
  type GlobalIndexKey,
} from "@/lib/global-indices";

export const dynamic = "force-dynamic";

/** 國際指數日 K（近兩年） */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key")?.trim() ?? "";
  const def = getGlobalIndexDef(key);
  if (!def) {
    return NextResponse.json({ error: "未知的指數代號" }, { status: 400 });
  }

  try {
    const fresh = req.nextUrl.searchParams.get("refresh") === "1";
    const prices = await getGlobalIndexPrices(def.key as GlobalIndexKey, {
      fresh,
    });
    return NextResponse.json(
      { key: def.key, name: def.name, prices },
      fresh ? { headers: { "Cache-Control": "no-store" } } : undefined
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
