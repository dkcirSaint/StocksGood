import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import {
  getNotifyStatusSummary,
  readCronLastStamp,
  readNotifyConfig,
  taiwanNowHm,
} from "@/lib/notify/config";
import { taiwanTodayYmd } from "@/lib/calendar-event-utils";

export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

function nextScheduleTimes(times: string[], nowHm: string): string[] {
  const sorted = [...times].sort();
  const upcoming = sorted.filter((t) => t > nowHm);
  if (upcoming.length > 0) return upcoming;
  return sorted;
}

export async function GET() {
  const config = await readNotifyConfig();
  const nowHm = taiwanNowHm();
  const today = taiwanTodayYmd();
  const lastCronStamp = await readCronLastStamp();
  let autostart: string = "unknown";
  try {
    const script = path.join(process.cwd(), "scripts/install-autostart.sh");
    const { stdout } = await execFileAsync("/bin/bash", [script, "status"], {
      timeout: 5000,
    });
    autostart = stdout.trim() || "unknown";
  } catch {
    autostart = "unknown";
  }

  return NextResponse.json({
    ok: true,
    serverAlive: true,
    nowHm,
    today,
    lastCronStamp,
    nextTimes: nextScheduleTimes(config.scheduleTimes, nowHm),
    autostart,
    ...getNotifyStatusSummary(config),
  });
}

export async function POST(req: NextRequest) {
  let action = "status";
  try {
    const body = (await req.json()) as { action?: string };
    if (body?.action) action = body.action;
  } catch {
    /* empty body ok */
  }

  if (action !== "install" && action !== "uninstall" && action !== "status") {
    return NextResponse.json({ error: "無效的 action" }, { status: 400 });
  }

  try {
    const script = path.join(process.cwd(), "scripts/install-autostart.sh");
    const { stdout, stderr } = await execFileAsync(
      "/bin/bash",
      [script, action],
      { timeout: 20000 }
    );
    return NextResponse.json({
      ok: true,
      action,
      result: (stdout || stderr || "").trim(),
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
