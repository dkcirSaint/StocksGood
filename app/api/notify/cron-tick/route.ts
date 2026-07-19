import { NextResponse } from "next/server";
import { taiwanTodayYmd } from "@/lib/calendar-event-utils";
import {
  readCronLastStamp,
  readNotifyConfig,
  taiwanNowHm,
  writeCronLastStamp,
} from "@/lib/notify/config";
import { runNotifyScan } from "@/lib/notify/scan";

export const dynamic = "force-dynamic";
/** 先更新清單再掃描，多檔時可能較久 */
export const maxDuration = 180;

/**
 * 每分鐘由 crontab 呼叫：若目前台灣時間落在使用者設定的時刻，
 * 先強制更新清單股票資料，再執行掃描與通報。
 * 單人自用：不需 NOTIFY_CRON_SECRET（避免休眠喚醒／cron 環境讀不到密鑰導致 401）。
 */
export async function POST() {
  try {
    const config = await readNotifyConfig();
    const nowHm = taiwanNowHm();
    const today = taiwanTodayYmd();

    if (config.scheduleTimes.length === 0) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "no_schedule",
        now: nowHm,
      });
    }

    if (!config.scheduleTimes.includes(nowHm)) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "not_scheduled",
        now: nowHm,
        scheduleTimes: config.scheduleTimes,
      });
    }

    const stamp = `${today}T${nowHm}`;
    const last = await readCronLastStamp();
    if (last === stamp) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "already_ran",
        stamp,
      });
    }

    const result = await runNotifyScan();
    await writeCronLastStamp(stamp);
    return NextResponse.json({
      ok: true,
      skipped: false,
      stamp,
      ...result,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
