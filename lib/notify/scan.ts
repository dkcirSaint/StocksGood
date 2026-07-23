import { getDailyPrices } from "@/lib/finmind";
import type { DailyPrice } from "@/lib/types";
import {
  analyzeMacd,
  macdEntryExitStatusLabel,
  type MacdAnalysis,
  type MacdDivergenceStatus,
  type MacdTacticalKind,
} from "@/lib/indicators";
import { evaluateKeyPriceTouches } from "@/lib/price-targets";
import { getWatchlistCalendarEvents } from "@/lib/stock-events";
import { daysFromToday, taiwanTodayYmd } from "@/lib/calendar-event-utils";
import { readNotifyConfig, taiwanNowHm, type NotifyConfig } from "./config";
import { filterUnsentKeys, markKeysSent } from "./dedup";
import { sendNotifyEmail } from "./mailer";

export type NotifyEventKind = "touch" | "macd" | "calendar";

export interface NotifyEvent {
  key: string;
  kind: NotifyEventKind;
  stockId: string;
  stockName: string;
  title: string;
  detail: string;
}

export interface NotifyScanResult {
  today: string;
  /** 掃描前成功強制更新 K 線的檔數 */
  refreshed: number;
  scanned: number;
  found: number;
  sent: number;
  skippedDup: number;
  emailed: boolean;
  to?: string;
  events: NotifyEvent[];
  errors: string[];
}

const REFRESH_CONCURRENCY = 3;

function formatPrice(n: number): string {
  return n.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
}

function tacticalLabel(t: Exclude<MacdTacticalKind, null>): string {
  switch (t) {
    case "weak":
      return "短波段轉弱";
    case "strong":
      return "短波段轉強";
    case "golden_cross":
      return "剛金叉";
    case "death_cross":
      return "剛死叉";
  }
}

function entryLabel(
  kind: MacdAnalysis["kind"],
  status: MacdDivergenceStatus
): string {
  return macdEntryExitStatusLabel(kind, status) ?? "—";
}

function pushMacdLayerEvents(
  events: NotifyEvent[],
  item: { stockId: string; stockName: string },
  barDate: string,
  analysis: MacdAnalysis,
  config: NotifyConfig
) {
  const head = `${item.stockName}（${item.stockId}）`;

  if (config.events.macdTactical && analysis.tactical) {
    const label = tacticalLabel(analysis.tactical);
    events.push({
      key: `macd:tactical:${item.stockId}:${barDate}:${analysis.tactical}`,
      kind: "macd",
      stockId: item.stockId,
      stockName: item.stockName,
      title: "MACD 戰術",
      detail: `${head} ${label}`,
    });
  }

  if (config.events.macdStructure && analysis.kind) {
    const label = analysis.kind === "high" ? "頂背離" : "底背離";
    events.push({
      key: `macd:structure:${item.stockId}:${barDate}:${analysis.kind}`,
      kind: "macd",
      stockId: item.stockId,
      stockName: item.stockName,
      title: "MACD 結構",
      detail: `${head} ${label}`,
    });
  }

  if (config.events.macdEntry && analysis.status && analysis.kind) {
    const kindLabel = analysis.kind === "high" ? "頂背離" : "底背離";
    const statusLabel = entryLabel(analysis.kind, analysis.status);
    events.push({
      key: `macd:entry:${item.stockId}:${barDate}:${analysis.status}:${analysis.kind}`,
      kind: "macd",
      stockId: item.stockId,
      stockName: item.stockName,
      title: "MACD 進出場",
      detail: `${head} ${kindLabel}・${statusLabel}`,
    });
  }
}

/** 掃描前強制更新清單內股票 K 線（略過快取） */
async function refreshListPrices(
  items: NotifyConfig["items"]
): Promise<{
  prices: Map<string, DailyPrice[]>;
  refreshed: number;
  errors: string[];
}> {
  const prices = new Map<string, DailyPrice[]>();
  const errors: string[] = [];
  let refreshed = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      const item = items[idx];
      try {
        const bars = await getDailyPrices(item.stockId, 120, { fresh: true });
        if (bars.length > 0) {
          prices.set(item.stockId, bars);
          refreshed += 1;
        } else {
          errors.push(`${item.stockId} 更新：無價格資料`);
        }
      } catch (e) {
        errors.push(
          `${item.stockId} 更新：${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(REFRESH_CONCURRENCY, Math.max(items.length, 1)) },
    () => worker()
  );
  await Promise.all(workers);
  return { prices, refreshed, errors };
}

async function collectEvents(
  config: NotifyConfig,
  priceMap: Map<string, DailyPrice[]>
): Promise<{
  events: NotifyEvent[];
  errors: string[];
}> {
  const events: NotifyEvent[] = [];
  const errors: string[] = [];
  const items = config.items.slice(0, 30);
  if (items.length === 0) return { events, errors };

  const needMacd =
    config.events.macdTactical ||
    config.events.macdStructure ||
    config.events.macdEntry;

  for (const item of items) {
    try {
      let prices = priceMap.get(item.stockId);
      if (!prices) {
        // 更新失敗時再試一次強制抓取，避免整檔漏掃
        prices = await getDailyPrices(item.stockId, 120, { fresh: true });
      }
      if (!prices || prices.length === 0) continue;
      const latest = prices[prices.length - 1];

      if (config.events.touch && item.keyPrices.length > 0) {
        const touched = evaluateKeyPriceTouches(item.keyPrices, latest);
        for (const p of touched) {
          events.push({
            key: `touch:${item.stockId}:${latest.date}:${p}`,
            kind: "touch",
            stockId: item.stockId,
            stockName: item.stockName,
            title: `關鍵價格觸價`,
            detail: `${item.stockName}（${item.stockId}）${latest.date} 觸及 ${formatPrice(p)}（當日 ${formatPrice(latest.low)}–${formatPrice(latest.high)}）`,
          });
        }
      }

      if (needMacd) {
        const analysis = analyzeMacd(
          prices.map((p) => ({ high: p.high, low: p.low, close: p.close }))
        );
        if (analysis) {
          pushMacdLayerEvents(events, item, latest.date, analysis, config);
        }
      }
    } catch (e) {
      errors.push(
        `${item.stockId} 價格/MACD：${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  if (config.events.calendar) {
    try {
      const cal = await getWatchlistCalendarEvents(
        items.map((i) => ({ stockId: i.stockId, stockName: i.stockName })),
        { fresh: true }
      );
      for (const ev of cal) {
        const days = daysFromToday(ev.date);
        if (days < 0 || days > 3) continue;
        const when =
          days === 0 ? "今天" : days === 1 ? "明天" : `${days} 天後`;
        events.push({
          key: `cal:${ev.stockId}:${ev.kind}:${ev.date}`,
          kind: "calendar",
          stockId: ev.stockId,
          stockName: ev.stockName,
          title: "行事曆提醒",
          detail: `${ev.stockName}（${ev.stockId}） ${ev.label}・${ev.date}（${when}）${ev.detail ? `・${ev.detail}` : ""}`,
        });
      }
    } catch (e) {
      errors.push(
        `行事曆：${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  return { events, errors };
}

function buildEmailBody(today: string, events: NotifyEvent[]): string {
  const scannedAt = new Date().toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const lines = [
    `荷包股股（StocksGood）通知`,
    `日期：${today}`,
    `掃描時間：${scannedAt}（台灣時間）`,
    `共 ${events.length} 則`,
    "",
  ];
  events.forEach((ev, i) => {
    lines.push(`${i + 1}. [${ev.title}] ${ev.detail}`);
  });
  lines.push("", "—", "本信由荷包股股自動掃描寄出，僅供研究參考。");
  return lines.join("\n");
}

/** 先更新清單資料，再掃描並寄出符合條件的事件（含先前已通知過的，每次掃描都寄） */
export async function runNotifyScan(opts?: {
  dryRun?: boolean;
}): Promise<NotifyScanResult> {
  const today = taiwanTodayYmd();
  const config = await readNotifyConfig();
  const items = config.items.slice(0, 30);

  const refresh = await refreshListPrices(items);
  const { events, errors: scanErrors } = await collectEvents(
    config,
    refresh.prices
  );
  const errors = [...refresh.errors, ...scanErrors];

  const allKeys = events.map((e) => e.key);
  const unsentKeys = await filterUnsentKeys(allKeys);
  const previouslySent = events.length - unsentKeys.length;

  const result: NotifyScanResult = {
    today,
    refreshed: refresh.refreshed,
    scanned: config.items.length,
    found: events.length,
    sent: 0,
    /** 此批事件中，先前已寄過的則數（仍會再寄） */
    skippedDup: previouslySent,
    emailed: false,
    events,
    errors,
  };

  if (events.length === 0 || opts?.dryRun) {
    return result;
  }

  if (process.env.NOTIFY_ENABLED === "false") {
    errors.push("NOTIFY_ENABLED=false，已略過寄信");
    return result;
  }

  const { to } = await sendNotifyEmail({
    subject: `[荷包股股] ${events.length} 則通知・${today} ${taiwanNowHm()}`,
    text: buildEmailBody(today, events),
  });

  await markKeysSent(allKeys);
  result.sent = events.length;
  result.emailed = true;
  result.to = to;
  return result;
}
