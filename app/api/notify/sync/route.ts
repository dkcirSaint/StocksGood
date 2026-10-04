import { NextRequest, NextResponse } from "next/server";
import {
  getNotifyStatusSummary,
  normalizeNotifyTo,
  readNotifyConfig,
  writeNotifyConfig,
  type NotifyStockItem,
  type NotifyEstPriceTarget,
  type NotifyEventToggles,
  type NotifyWatchList,
} from "@/lib/notify/config";

export const dynamic = "force-dynamic";

const MAX_STOCKS = 30;
const MAX_LISTS = 20;

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
    lists?: unknown;
    events?: Partial<NotifyEventToggles>;
    scheduleTimes?: unknown;
    notifyTo?: unknown;
  };

  const items: NotifyStockItem[] = [];
  if (Array.isArray(obj.items)) {
    for (const raw of obj.items) {
      if (!raw || typeof raw !== "object") continue;
      const it = raw as Partial<NotifyStockItem>;
      const stockId = String(it.stockId ?? "").trim();
      if (!stockId) continue;
      const stockName = String(it.stockName ?? "").trim() || stockId;
      const estPriceTargets: NotifyEstPriceTarget[] = Array.isArray(
        it.estPriceTargets
      )
        ? it.estPriceTargets
            .map((t) => ({
              label: String((t as NotifyEstPriceTarget)?.label ?? "").trim(),
              price: Number((t as NotifyEstPriceTarget)?.price),
            }))
            .filter((t) => t.label && Number.isFinite(t.price) && t.price > 0)
            .slice(0, 6)
        : [];
      items.push({ stockId, stockName, estPriceTargets });
      if (items.length >= MAX_STOCKS) break;
    }
  }

  const lists: NotifyWatchList[] = [];
  if (Array.isArray(obj.lists)) {
    for (const raw of obj.lists) {
      if (!raw || typeof raw !== "object") continue;
      const it = raw as Partial<NotifyWatchList>;
      const id = String(it.id ?? "").trim();
      const name = String(it.name ?? "").trim();
      if (!id || !name) continue;
      const stockIds = Array.isArray(it.stockIds)
        ? it.stockIds
            .map((s) => String(s ?? "").trim())
            .filter(Boolean)
            .filter((s, i, arr) => arr.indexOf(s) === i)
        : [];
      lists.push({ id, name, stockIds });
      if (lists.length >= MAX_LISTS) break;
    }
  }

  if (obj.notifyTo !== undefined) {
    const raw =
      typeof obj.notifyTo === "string" ? obj.notifyTo.trim() : "";
    if (raw && !normalizeNotifyTo(raw)) {
      return NextResponse.json(
        { error: "收件 Email 格式無效" },
        { status: 400 }
      );
    }
  }

  const syncedAt = new Date().toISOString();
  const touchItemsOrLists =
    Array.isArray(obj.items) || Array.isArray(obj.lists);
  const config = await writeNotifyConfig({
    items: Array.isArray(obj.items) ? items : undefined,
    lists: Array.isArray(obj.lists) ? lists : undefined,
    syncedAt: touchItemsOrLists ? syncedAt : undefined,
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
    notifyTo: obj.notifyTo !== undefined ? (obj.notifyTo as string) : undefined,
  });

  return NextResponse.json({
    ok: true,
    ...getNotifyStatusSummary(config),
  });
}
