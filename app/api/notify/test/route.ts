import { NextResponse } from "next/server";
import { isMailEnvConfigured } from "@/lib/notify/config";
import { sendNotifyEmail, getNotifyRecipient } from "@/lib/notify/mailer";
import { taiwanTodayYmd } from "@/lib/calendar-event-utils";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isMailEnvConfigured()) {
    return NextResponse.json(
      { error: "尚未設定 GMAIL_USER / GMAIL_APP_PASSWORD" },
      { status: 400 }
    );
  }
  if (process.env.NOTIFY_ENABLED === "false") {
    return NextResponse.json(
      { error: "NOTIFY_ENABLED=false，已關閉寄信" },
      { status: 400 }
    );
  }

  try {
    const today = taiwanTodayYmd();
    const { to } = await sendNotifyEmail({
      subject: `[荷包股股] 測試通知・${today}`,
      text: [
        "這是荷包股股（StocksGood）的測試信。",
        "",
        `若你收到這封信，代表 Gmail SMTP 設定正確。`,
        `時間：${new Date().toISOString()}`,
        "",
        "—",
        "本信由「測試寄信」按鈕觸發。",
      ].join("\n"),
    });
    return NextResponse.json({ ok: true, to });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    mailConfigured: isMailEnvConfigured(),
    to: getNotifyRecipient() || null,
    notifyEnabled: process.env.NOTIFY_ENABLED !== "false",
  });
}
