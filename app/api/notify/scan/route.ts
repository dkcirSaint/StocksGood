import { NextRequest, NextResponse } from "next/server";
import { runNotifyScan } from "@/lib/notify/scan";

export const dynamic = "force-dynamic";
/** 先更新清單再掃描，多檔時可能較久 */
export const maxDuration = 180;

/**
 * 手動「立即掃描」用（通知視窗）：先更新清單資料，再掃描通報。
 * 不需 NOTIFY_CRON_SECRET；定時掃描請走 /api/notify/cron-tick。
 */
export async function POST(req: NextRequest) {
  const dryRun =
    req.nextUrl.searchParams.get("dryRun") === "1" ||
    req.nextUrl.searchParams.get("dryRun") === "true";

  try {
    const result = await runNotifyScan({ dryRun });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
