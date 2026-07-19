import { NextRequest, NextResponse } from "next/server";
import {
  getNotifyStatusSummary,
  readNotifyConfig,
  writeNotifyConfig,
  type NotifyStockItem,
  type NotifyEventToggles,
} from "@/lib/notify/config";

export const dynamic = "force-dynamic";

const MAX_STOCKS = 30;

export async function GET() {
  const config = await readNotifyConfig();
  return NextResponse.json(getNotifyStatusSummary(config));
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "無效的 JSON" }, { status: 400 });
  }

  const obj = (body && typeof body === "object" ? body : {}) as {
    items?: unknown;
    events?: Partial<NotifyEventToggles>;
    scheduleTimes?: unknown;
  };

  const items: NotifyStockItem[] = [];
  if (Array.isArray(obj.items)) {
    for (const raw of obj.items) {
      if (!raw || typeof raw !== "object") continue;
      const it = raw as Partial<NotifyStockItem>;
      const stockId = String(it.stockId ?? "").trim();
      if (!stockId) continue;
      const stockName = String(it.stockName ?? "").trim() || stockId;
      const keyPrices = Array.isArray(it.keyPrices)
        ? it.keyPrices
            .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0)
            .slice(0, 4)
        : [];
      items.push({ stockId, stockName, keyPrices });
      if (items.length >= MAX_STOCKS) break;
    }
  }

  const syncedAt = new Date().toISOString();
  const config = await writeNotifyConfig({
    items: Array.isArray(obj.items) ? items : undefined,
    syncedAt: Array.isArray(obj.items) ? syncedAt : undefined,
    events: obj.events
      ? {
          touch: obj.events.touch !== false,
          macdTactical: obj.events.macdTactical === true,
          macdStructure: obj.events.macdStructure === true,
          macdEntry: obj.events.macdEntry === true,
          calendar: obj.events.calendar !== false,
        }
      : undefined,
    scheduleTimes:
      obj.scheduleTimes !== undefined
        ? (obj.scheduleTimes as string[])
        : undefined,
  });

  return NextResponse.json({
    ok: true,
    ...getNotifyStatusSummary(config),
  });
}
