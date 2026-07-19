import type { StockCalendarEvent } from "./types";
import {
  currentYearBounds,
  inCurrentYear,
  isAnnouncedThisYear,
  parseYmd,
  pushCalendarEvent,
} from "./calendar-event-utils";

const FINMIND_API = "https://api.finmindtrade.com/api/v4/data";

interface FinMindResponse<T> {
  msg: string;
  status: number;
  data: T[];
}

async function finmind<T>(
  dataset: string,
  params: Record<string, string> = {},
  opts: { fresh?: boolean } = {}
): Promise<T[]> {
  const url = new URL(FINMIND_API);
  url.searchParams.set("dataset", dataset);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  const token = process.env.FINMIND_TOKEN;
  if (token) url.searchParams.set("token", token);

  const res = await fetch(url.toString(), {
    ...(opts.fresh
      ? { cache: "no-store" as const }
      : { next: { revalidate: 60 * 60 } }),
  });
  if (!res.ok) {
    throw new Error(`FinMind ${dataset} HTTP ${res.status}`);
  }
  const json = (await res.json()) as FinMindResponse<T>;
  if (json.status !== 200) {
    throw new Error(`FinMind ${dataset}: ${json.msg}`);
  }
  return json.data ?? [];
}

function formatAnnouncement(
  announcementDate: string,
  announcementTime?: string
): string | undefined {
  const ann = parseYmd(announcementDate);
  if (!ann) return undefined;
  const time = announcementTime?.trim();
  return time ? `公告 ${ann} ${time}` : `公告 ${ann}`;
}

function parseDividendRows(
  stockId: string,
  stockName: string,
  rows: {
    date: string;
    StockEarningsDistribution: number;
    StockStatutorySurplus: number;
    StockExDividendTradingDate: string;
    CashEarningsDistribution: number;
    CashStatutorySurplus: number;
    CashExDividendTradingDate: string;
    CashDividendPaymentDate: string;
    TotalNumberOfCashCapitalIncrease: number;
    CashIncreaseSubscriptionRate: number;
    CashIncreaseSubscriptionpRrice: number;
    AnnouncementDate: string;
    AnnouncementTime?: string;
  }[],
  events: StockCalendarEvent[],
  seen: Set<string>
) {
  for (const row of rows) {
    const announcedThisYear = isAnnouncedThisYear(row.AnnouncementDate);
    const cash =
      (row.CashEarningsDistribution ?? 0) + (row.CashStatutorySurplus ?? 0);
    const stockDiv =
      (row.StockEarningsDistribution ?? 0) + (row.StockStatutorySurplus ?? 0);

    const exCash = parseYmd(row.CashExDividendTradingDate);
    const exStock = parseYmd(row.StockExDividendTradingDate);
    const payDate = parseYmd(row.CashDividendPaymentDate);

    const hasCurrentYearEvent = [exCash, exStock, payDate].some(
      (d) => d && inCurrentYear(d)
    );
    if (!announcedThisYear && !hasCurrentYearEvent) continue;

    const annText = formatAnnouncement(
      row.AnnouncementDate,
      row.AnnouncementTime
    );

    if (exCash && (announcedThisYear || inCurrentYear(exCash))) {
      const detailParts = [
        annText,
        `除息日 ${exCash}`,
        cash > 0 ? `現金股利 ${cash.toFixed(2)} 元` : undefined,
      ].filter(Boolean) as string[];
      pushCalendarEvent(events, seen, {
        stockId,
        stockName,
        date: exCash,
        kind: "ex_dividend",
        label: "除息日",
        detail: detailParts.join(" · "),
      });
    }

    if (exStock && (announcedThisYear || inCurrentYear(exStock))) {
      const detailParts = [
        annText,
        `除權日 ${exStock}`,
        stockDiv > 0 ? `股票股利 ${stockDiv.toFixed(2)} 元` : undefined,
      ].filter(Boolean) as string[];
      pushCalendarEvent(events, seen, {
        stockId,
        stockName,
        date: exStock,
        kind: "ex_rights",
        label: "除權日",
        detail: detailParts.join(" · "),
      });
    }

    if (payDate && cash > 0 && (announcedThisYear || inCurrentYear(payDate))) {
      const detailParts = [
        annText,
        `發放日 ${payDate}`,
        `${cash.toFixed(2)} 元`,
      ].filter(Boolean);
      pushCalendarEvent(events, seen, {
        stockId,
        stockName,
        date: payDate,
        kind: "cash_payment",
        label: "現金股利發放",
        detail: detailParts.join(" · "),
      });
    }

    if (
      (row.TotalNumberOfCashCapitalIncrease ?? 0) > 0 &&
      announcedThisYear
    ) {
      const eventDate =
        parseYmd(row.AnnouncementDate) ?? parseYmd(row.date);
      if (eventDate) {
        const parts: string[] = [];
        if (row.CashIncreaseSubscriptionpRrice > 0) {
          parts.push(`認購價 ${row.CashIncreaseSubscriptionpRrice} 元`);
        }
        if (row.CashIncreaseSubscriptionRate > 0) {
          parts.push(`認股比率 ${row.CashIncreaseSubscriptionRate}%`);
        }
        pushCalendarEvent(events, seen, {
          stockId,
          stockName,
          date: eventDate,
          kind: "cash_increase",
          label: "現金增資",
          detail: parts.length > 0 ? parts.join("，") : undefined,
        });
      }
    }
  }
}

function parseDividendResultRows(
  stockId: string,
  stockName: string,
  rows: {
    date: string;
    stock_id: string;
    before_price: number;
    after_price: number;
    stock_and_cache_dividend: number;
    stock_or_cache_dividend: string;
    reference_price: number;
  }[],
  events: StockCalendarEvent[],
  seen: Set<string>
) {
  for (const row of rows) {
    if (row.stock_id && row.stock_id !== stockId) continue;
    const d = parseYmd(row.date);
    if (!d || !inCurrentYear(d)) continue;

    const divType = (row.stock_or_cache_dividend ?? "").trim();
    const perShare = row.stock_and_cache_dividend;
    const priceDetail =
      row.reference_price > 0
        ? `參考價 ${row.reference_price}`
        : row.before_price > 0 && row.after_price > 0
          ? `${row.before_price} → ${row.after_price}`
          : undefined;

    if (divType.includes("權") && divType.includes("息")) {
      const parts = [`除權息日 ${d}`];
      if (perShare > 0) parts.push(`每股 ${perShare} 元`);
      if (priceDetail) parts.push(priceDetail);
      pushCalendarEvent(events, seen, {
        stockId,
        stockName,
        date: d,
        kind: "ex_dividend",
        label: "除權息",
        detail: parts.join(" · "),
      });
      continue;
    }

    if (divType.includes("息")) {
      const parts = [`除息日 ${d}`];
      if (perShare > 0) parts.push(`每股 ${perShare} 元`);
      if (priceDetail) parts.push(priceDetail);
      pushCalendarEvent(events, seen, {
        stockId,
        stockName,
        date: d,
        kind: "ex_dividend",
        label: "除息日",
        detail: parts.join(" · "),
      });
    }

    if (divType.includes("權")) {
      const parts = [`除權日 ${d}`];
      if (perShare > 0) parts.push(`每股 ${perShare} 元`);
      if (priceDetail) parts.push(priceDetail);
      pushCalendarEvent(events, seen, {
        stockId,
        stockName,
        date: d,
        kind: "ex_rights",
        label: "除權日",
        detail: parts.join(" · "),
      });
    }
  }
}

let delistingCache: {
  at: number;
  data: { date: string; stock_id: string; stock_name: string }[];
} | null = null;

async function getDelistingRecords(): Promise<
  { date: string; stock_id: string; stock_name: string }[]
> {
  const now = Date.now();
  if (delistingCache && now - delistingCache.at < 1000 * 60 * 60 * 6) {
    return delistingCache.data;
  }
  const data = await finmind<{
    date: string;
    stock_id: string;
    stock_name: string;
  }>("TaiwanStockDelisting");
  delistingCache = { at: now, data };
  return data;
}

/** 取得單一股票今年已公告的重要行事曆（FinMind） */
export async function getStockCalendarEvents(
  stockId: string,
  stockName: string,
  opts: { fresh?: boolean } = {}
): Promise<StockCalendarEvent[]> {
  const { start: yearStart, year } = currentYearBounds();
  /** 股利基準日可能早於公告年，往前多抓一年再以 AnnouncementDate 篩選 */
  const dividendFetchStart = `${year - 1}-01-01`;
  const fetchOpts = opts.fresh ? { fresh: true } : {};

  const events: StockCalendarEvent[] = [];
  const seen = new Set<string>();

  const [dividendRes, dividendResultRes, reductionRes, splitRes, parRes, delistingAll] =
    await Promise.allSettled([
      finmind<{
        date: string;
        StockEarningsDistribution: number;
        StockStatutorySurplus: number;
        StockExDividendTradingDate: string;
        CashEarningsDistribution: number;
        CashStatutorySurplus: number;
        CashExDividendTradingDate: string;
        CashDividendPaymentDate: string;
        TotalNumberOfCashCapitalIncrease: number;
        CashIncreaseSubscriptionRate: number;
        CashIncreaseSubscriptionpRrice: number;
        AnnouncementDate: string;
        AnnouncementTime: string;
      }>(
        "TaiwanStockDividend",
        {
          data_id: stockId,
          start_date: dividendFetchStart,
        },
        fetchOpts
      ),
      finmind<{
        date: string;
        stock_id: string;
        before_price: number;
        after_price: number;
        stock_and_cache_dividend: number;
        stock_or_cache_dividend: string;
        reference_price: number;
      }>(
        "TaiwanStockDividendResult",
        {
          data_id: stockId,
          start_date: yearStart,
        },
        fetchOpts
      ),
      finmind<{
        date: string;
        ReasonforCapitalReduction: string;
      }>(
        "TaiwanStockCapitalReductionReferencePrice",
        {
          data_id: stockId,
          start_date: yearStart,
        },
        fetchOpts
      ),
      finmind<{
        date: string;
        stock_id: string;
        type: string;
        before_price: number;
        after_price: number;
      }>(
        "TaiwanStockSplitPrice",
        {
          data_id: stockId,
          start_date: yearStart,
        },
        fetchOpts
      ),
      finmind<{
        date: string;
        stock_id: string;
        stock_name: string;
        before_close: number;
        after_ref_close: number;
      }>(
        "TaiwanStockParValueChange",
        {
          start_date: yearStart,
        },
        fetchOpts
      ),
      getDelistingRecords(),
    ]);

  if (dividendRes.status === "fulfilled") {
    parseDividendRows(stockId, stockName, dividendRes.value, events, seen);
  }

  if (dividendResultRes.status === "fulfilled") {
    parseDividendResultRows(
      stockId,
      stockName,
      dividendResultRes.value,
      events,
      seen
    );
  }

  if (reductionRes.status === "fulfilled") {
    for (const row of reductionRes.value) {
      const d = parseYmd(row.date);
      if (!d || !inCurrentYear(d)) continue;
      const reason = row.ReasonforCapitalReduction?.trim();
      pushCalendarEvent(events, seen, {
        stockId,
        stockName,
        date: d,
        kind: "capital_reduction",
        label: "減資恢復交易",
        detail: reason || undefined,
      });
    }
  }

  if (splitRes.status === "fulfilled") {
    for (const row of splitRes.value) {
      if (row.stock_id && row.stock_id !== stockId) continue;
      const d = parseYmd(row.date);
      if (!d || !inCurrentYear(d)) continue;
      pushCalendarEvent(events, seen, {
        stockId,
        stockName,
        date: d,
        kind: "stock_split",
        label: row.type === "反分割" ? "股票反分割" : "股票分割",
        detail: `${row.before_price} → ${row.after_price} 元`,
      });
    }
  }

  if (parRes.status === "fulfilled") {
    for (const row of parRes.value) {
      if (row.stock_id !== stockId) continue;
      const d = parseYmd(row.date);
      if (!d || !inCurrentYear(d)) continue;
      pushCalendarEvent(events, seen, {
        stockId,
        stockName,
        date: d,
        kind: "par_value_change",
        label: "變更面額恢復交易",
        detail: `${row.before_close} → ${row.after_ref_close} 元`,
      });
    }
  }

  if (delistingAll.status === "fulfilled") {
    for (const row of delistingAll.value) {
      if (row.stock_id !== stockId) continue;
      const d = parseYmd(row.date);
      if (!d || !inCurrentYear(d)) continue;
      pushCalendarEvent(events, seen, {
        stockId,
        stockName: row.stock_name || stockName,
        date: d,
        kind: "delisting",
        label: "下市櫃",
      });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getWatchlistCalendarEvents(
  items: { stockId: string; stockName: string }[],
  opts: { fresh?: boolean } = {}
): Promise<StockCalendarEvent[]> {
  if (items.length === 0) return [];

  const results = await Promise.allSettled(
    items.map((item) =>
      getStockCalendarEvents(item.stockId, item.stockName, opts)
    )
  );

  const merged: StockCalendarEvent[] = [];
  const seen = new Set<string>();
  for (const res of results) {
    if (res.status !== "fulfilled") continue;
    for (const ev of res.value) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      merged.push(ev);
    }
  }

  return merged.sort((a, b) => a.date.localeCompare(b.date));
}
