"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  StockResult,
  StockApiResponse,
  MonthlyRevenuePoint,
  QuarterlyReport,
  InvestorConference,
  ShareholderMeeting,
  MeetingContent,
  LargeHolderSnapshot,
  MarginMaintenanceSnapshot,
  MarketIndexSnapshot,
  StockMarginUsageSnapshot,
  DailyPrice,
} from "@/lib/types";
import {
  conferenceNewsPlaceholder,
  shareholderNewsPlaceholder,
} from "@/lib/meeting-content";
import {
  getFinancialCacheForQuery,
  rememberStockAlias,
  saveFinancialCache,
} from "@/lib/financial-cache";
import {
  getPriceCache,
  getPriceCacheForQuery,
  mergeDailyPrices,
  savePriceCache,
} from "@/lib/price-cache";
import {
  getChipSnapshotsFromCache,
  saveChipCacheFromFetch,
} from "@/lib/chip-cache";
import { useWatchlists, isStockWatched, findWatchedStockByQuery } from "@/lib/watchlists";
import ChipPanel from "./components/ChipPanel";
import StockInsightsPanel from "./components/StockInsightsPanel";
import StockPriceTargets from "./components/StockPriceTargets";
import DisplayBlock from "./components/DisplayBlock";
import DataAnalysisModal from "./components/DataAnalysisModal";
import NotifySettings from "./components/NotifySettings";
import WatchlistSettings from "./components/WatchlistSettings";
import Modal from "./components/Modal";
import {
  buildMopsCalendarEvents,
  taiwanTodayYmd,
} from "@/lib/calendar-event-utils";
import { analyzeMacd } from "@/lib/indicators";
import { formatKeyPrice, getKeyPrices } from "@/lib/price-targets";

function formatMoney(n: number): string {
  // 以「億元」為單位呈現大數字
  if (Math.abs(n) >= 1e8) {
    return `${(n / 1e8).toLocaleString("zh-TW", {
      maximumFractionDigits: 2,
    })} 億`;
  }
  if (Math.abs(n) >= 1e4) {
    return `${(n / 1e4).toLocaleString("zh-TW", {
      maximumFractionDigits: 1,
    })} 萬`;
  }
  return n.toLocaleString("zh-TW");
}

function formatMetric(key: string, value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  if (key === "EPS") return value.toFixed(2);
  return formatMoney(value);
}

function Pct({ value }: { value: number | null }) {
  if (value === null) return <span className="na">—</span>;
  const pct = (value * 100).toFixed(1);
  const cls = value > 0 ? "up" : value < 0 ? "down" : "na";
  const sign = value > 0 ? "+" : "";
  return (
    <span className={cls}>
      {sign}
      {pct}%
    </span>
  );
}

function RevenueSection({ data }: { data: MonthlyRevenuePoint[] }) {
  if (data.length === 0)
    return <p className="empty">查無月營收資料。</p>;
  return (
    <div className="rev-grid">
      {data.map((m) => (
        <div className="rev-card" key={m.yearMonth}>
          <div className="month">
            {m.revenueYear} 年 {m.revenueMonth} 月
          </div>
          <div className="value">{formatMoney(m.revenue)}</div>
          <div className="growth-row">
            <span className="label">月增 (MoM)</span>
            <Pct value={m.momGrowth} />
          </div>
          <div className="growth-row">
            <span className="label">年增 (YoY)</span>
            <Pct value={m.yoyGrowth} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportsSection({ data }: { data: QuarterlyReport[] }) {
  if (data.length === 0) return <p className="empty">查無季報資料。</p>;
  const labels = data[0].metrics.map((m) => ({ key: m.key, label: m.label }));
  return (
    <table className="fin">
      <thead>
        <tr>
          <th>科目</th>
          {data.map((q) => (
            <th key={q.date}>{q.quarter}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {labels.map((row) => (
          <tr key={row.key}>
            <td>{row.label}</td>
            {data.map((q) => {
              const metric = q.metrics.find((m) => m.key === row.key);
              return (
                <td key={q.date}>
                  {formatMetric(row.key, metric ? metric.value : null)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ConferenceCard({
  c,
  activeId,
  onOpenNews,
}: {
  c: InvestorConference;
  activeId: string | null;
  onOpenNews: () => void;
}) {
  const docs: { label: string; href: string }[] = [];
  if (c.presentationUrlZh) {
    docs.push({ label: "中文簡報 PDF", href: c.presentationUrlZh });
  }
  if (c.presentationUrlEn) {
    docs.push({ label: "英文簡報 PDF", href: c.presentationUrlEn });
  }
  if (c.videoLink && /^https?:/.test(c.videoLink)) {
    docs.push({ label: "影音連結", href: c.videoLink });
  }

  const newsId = `conf-news-${c.date}`;

  return (
    <div className="conf">
      <div className="conf-head">
        <span className="conf-date">{c.date}</span>
        <span className={`badge ${c.held ? "held" : "upcoming"}`}>
          {c.held ? "已舉行" : "即將舉行"}
        </span>
        {c.time && <span className="meta">{c.time}</span>}
      </div>
      {c.location && <div className="meta">地點：{c.location}</div>}
      {c.summary && (
        <div className="summary summary-clamp">{c.summary}</div>
      )}
      <div className="links">
        <button
          type="button"
          className={`doc-link${activeId === newsId ? " active" : ""}`}
          onClick={onOpenNews}
        >
          相關報導
        </button>
        {docs.map((doc) => (
          <a key={doc.href} href={doc.href} target="_blank" rel="noreferrer">
            {doc.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function ShareholderCard({
  m,
  activeId,
  onOpenNews,
}: {
  m: ShareholderMeeting;
  activeId: string | null;
  onOpenNews: () => void;
}) {
  const newsId = `sh-news-${m.date}-${m.type}`;

  return (
    <div className="conf">
      <div className="conf-head">
        <span className="conf-date">{m.date}</span>
        <span className={`badge ${m.held ? "held" : "upcoming"}`}>
          {m.held ? "已召開" : "即將召開"}
        </span>
        <span className="meta">{m.type}</span>
        {m.method && <span className="meta">{m.method}</span>}
      </div>
      {m.location && <div className="meta">地點：{m.location}</div>}
      {m.boardReelection && (
        <div className="meta">改選董監：{m.boardReelection}</div>
      )}
      {m.evotingPeriod && (
        <div className="meta">電子投票期間：{m.evotingPeriod}</div>
      )}
      <div className="links">
        <button
          type="button"
          className={`doc-link${activeId === newsId ? " active" : ""}`}
          onClick={onOpenNews}
        >
          相關報導
        </button>
        {m.evotingUrl && (
          <a href={m.evotingUrl} target="_blank" rel="noreferrer">
            電子投票{m.evotingPlatform ? `（${m.evotingPlatform}）` : ""}
          </a>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StockResult | null>(null);
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [meetingContent, setMeetingContent] = useState<MeetingContent | null>(
    null
  );
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [chipSnapshots, setChipSnapshots] = useState<LargeHolderSnapshot[]>([]);
  const [chipLoading, setChipLoading] = useState(false);
  const [chipError, setChipError] = useState<string | null>(null);
  const [taiex, setTaiex] = useState<MarketIndexSnapshot | null>(null);
  const [marginMaintenance, setMarginMaintenance] =
    useState<MarginMaintenanceSnapshot | null>(null);
  const [marginUsage, setMarginUsage] =
    useState<StockMarginUsageSnapshot | null>(null);
  const [dataAnalysisOpen, setDataAnalysisOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [addToListOpen, setAddToListOpen] = useState(false);
  const [keyPrices, setKeyPrices] = useState<number[]>([]);
  const wl = useWatchlists();
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stockId = result?.stock.stock_id;
    if (!stockId) {
      setKeyPrices([]);
      return;
    }
    setKeyPrices(getKeyPrices(stockId));
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ stockId?: string }>).detail;
      if (detail?.stockId && detail.stockId !== stockId) return;
      setKeyPrices(getKeyPrices(stockId));
    };
    window.addEventListener("ff-key-prices-changed", onChanged);
    return () => window.removeEventListener("ff-key-prices-changed", onChanged);
  }, [result?.stock.stock_id]);

  function persistResultToLocalCache(r: StockResult) {
    const stockId = r.stock.stock_id;
    rememberStockAlias(r.stock.stock_name, stockId);

    if (r.monthlyRevenue.length > 0 || r.quarterlyReports.length > 0) {
      saveFinancialCache(stockId, {
        monthlyRevenue: r.monthlyRevenue,
        quarterlyReports: r.quarterlyReports,
        latestRevenueMonth: r.monthlyRevenue[0]?.yearMonth ?? "",
        latestQuarterDate: r.quarterlyReports[0]?.date ?? "",
      });
    }

    if (r.dailyPrices.length > 0) {
      savePriceCache(stockId, {
        stockName: r.stock.stock_name,
        industryCategory: r.stock.industry_category,
        type: r.stock.type,
        dailyPrices: r.dailyPrices,
        latestDate: r.dailyPrices[r.dailyPrices.length - 1]?.date,
      });
    }
  }

  const search = useCallback(async (q: string) => {
    const term = q.trim();
    if (!term) return;
    setQuery(term);
    setLoading(true);
    setError(null);
    setMeetingContent(null);
    setMeetingLoading(false);

    const watched = findWatchedStockByQuery(term, wl.lists);
    const localCache = watched ? getFinancialCacheForQuery(term) : null;
    const priceCache = watched ? getPriceCacheForQuery(term) : null;

    if (priceCache) {
      setResult({
        stock: {
          stock_id: priceCache.stockId,
          stock_name: priceCache.stockName,
          industry_category: priceCache.industryCategory,
          type: priceCache.type,
        },
        dailyPrices: priceCache.dailyPrices,
        monthlyRevenue: localCache?.monthlyRevenue ?? [],
        quarterlyReports: localCache?.quarterlyReports ?? [],
        conferences: [],
        shareholderMeetings: [],
        mopsConferenceUrl: "",
        mopsShareholderUrl: "",
        warnings: [],
      });
    } else {
      setResult(null);
    }

    const params = new URLSearchParams({ q: term });
    if (localCache?.latestRevenueMonth) {
      params.set("revLatest", localCache.latestRevenueMonth);
    }
    if (localCache?.latestQuarterDate) {
      params.set("qLatest", localCache.latestQuarterDate);
    }
    if (priceCache?.latestDate) {
      params.set("priceLatest", priceCache.latestDate);
    }

    try {
      const res = await fetch(`/api/stock?${params}`);
      const data = (await res.json()) as StockApiResponse & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "查詢失敗，請稍後再試");
        if (!priceCache) setResult(null);
        return;
      }

      const stockId = data.stock.stock_id;
      const inWatchlist = isStockWatched(stockId, wl.lists);

      const monthlyRevenue =
        data.monthlyRevenue ??
        (inWatchlist ? localCache?.monthlyRevenue : undefined) ??
        (inWatchlist ? getFinancialCacheForQuery(stockId)?.monthlyRevenue : undefined) ??
        [];
      const quarterlyReports =
        data.quarterlyReports ??
        (inWatchlist ? localCache?.quarterlyReports : undefined) ??
        (inWatchlist ? getFinancialCacheForQuery(stockId)?.quarterlyReports : undefined) ??
        [];

      const cachedPrices = inWatchlist
        ? priceCache?.stockId === stockId
          ? priceCache.dailyPrices
          : getPriceCacheForQuery(stockId)?.dailyPrices ?? []
        : [];

      const dailyPrices = data.dailyPrices
        ? inWatchlist
          ? mergeDailyPrices(cachedPrices, data.dailyPrices)
          : data.dailyPrices
        : cachedPrices;

      const meta = data.financialsMeta;
      if (
        inWatchlist &&
        (meta?.latestRevenueMonth || meta?.latestQuarterDate)
      ) {
        rememberStockAlias(data.stock.stock_name, stockId);
        saveFinancialCache(stockId, {
          monthlyRevenue: data.monthlyRevenue ? monthlyRevenue : undefined,
          quarterlyReports: data.quarterlyReports
            ? quarterlyReports
            : undefined,
          latestRevenueMonth:
            meta.latestRevenueMonth ??
            localCache?.latestRevenueMonth ??
            monthlyRevenue[0]?.yearMonth ??
            "",
          latestQuarterDate:
            meta.latestQuarterDate ??
            localCache?.latestQuarterDate ??
            quarterlyReports[0]?.date ??
            "",
        });
      }

      if (inWatchlist && dailyPrices.length > 0) {
        savePriceCache(stockId, {
          stockName: data.stock.stock_name,
          industryCategory: data.stock.industry_category,
          type: data.stock.type,
          dailyPrices,
          latestDate: meta?.latestPriceDate ?? undefined,
        });
      }

      setResult({
        ...data,
        monthlyRevenue,
        quarterlyReports,
        dailyPrices,
      } as StockResult);
    } catch {
      setError("網路或伺服器錯誤，請稍後再試");
      if (!priceCache) setResult(null);
    } finally {
      setLoading(false);
    }
  }, [wl.lists]);

  const didAutoSelectStock = useRef(false);

  /** 未選股時：追蹤列表第一檔，否則台積電 */
  useEffect(() => {
    if (!wl.ready || didAutoSelectStock.current) return;
    if (result) {
      didAutoSelectStock.current = true;
      return;
    }
    didAutoSelectStock.current = true;

    let defaultQuery = "台積電";
    const fromSelected = wl.selectedList?.items[0];
    if (fromSelected) {
      defaultQuery = fromSelected.stockId;
    } else {
      for (const list of wl.lists) {
        if (list.items[0]) {
          defaultQuery = list.items[0].stockId;
          break;
        }
      }
    }
    void search(defaultQuery);
  }, [wl.ready, wl.lists, wl.selectedList, result, search]);

  const watchItemKey =
    wl.selectedList?.items.map((i) => i.stockId).join(",") ?? "";

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/market-overview", {
          signal: ctrl.signal,
        });
        const data = (await res.json()) as {
          taiex?: MarketIndexSnapshot | null;
          marginMaintenance?: MarginMaintenanceSnapshot | null;
        };
        setTaiex(data.taiex ?? null);
        setMarginMaintenance(data.marginMaintenance ?? null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          /* 大盤資訊失敗不阻擋個股顯示 */
        }
      }
    })();
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    const stockId = result?.stock.stock_id;
    if (!stockId) {
      setMarginUsage(null);
      return;
    }
    const ctrl = new AbortController();
    setMarginUsage(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/margin-usage?stockId=${encodeURIComponent(stockId)}`,
          { signal: ctrl.signal }
        );
        const data = (await res.json()) as {
          marginUsage?: StockMarginUsageSnapshot | null;
        };
        setMarginUsage(data.marginUsage ?? null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setMarginUsage(null);
        }
      }
    })();
    return () => ctrl.abort();
  }, [result?.stock.stock_id]);

  useEffect(() => {
    if (!wl.ready) return;

    const ctrl = new AbortController();
    const items = wl.selectedList?.items ?? [];
    if (items.length === 0) {
      setChipSnapshots([]);
      setChipError(null);
      return;
    }

    const cached = getChipSnapshotsFromCache(items);
    if (cached.length > 0) {
      setChipSnapshots(cached);
    }

    (async () => {
      setChipLoading(true);
      try {
        const params = new URLSearchParams({
          ids: items.map((i) => i.stockId).join(","),
          names: items.map((i) => `${i.stockId}:${i.stockName}`).join(","),
        });
        const res = await fetch(`/api/watchlist-chip?${params}`, {
          signal: ctrl.signal,
        });
        const data = (await res.json()) as {
          snapshots?: LargeHolderSnapshot[];
          periods?: {
            stockId: string;
            stockName: string;
            periods: { date: string; ratios: Record<"1000" | "400", number> }[];
          }[];
          error?: string | null;
        };
        if (data.periods?.length) {
          saveChipCacheFromFetch(data.periods);
        }
        const fresh =
          data.snapshots ??
          (data.periods?.length
            ? getChipSnapshotsFromCache(items)
            : []);
        setChipSnapshots(fresh);
        setChipError(data.error ?? null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          const fallback = getChipSnapshotsFromCache(items);
          setChipSnapshots(fallback);
          setChipError(
            fallback.length > 0
              ? "無法更新大戶籌碼，顯示本地快取。"
              : "載入大戶籌碼失敗，請稍後再試。"
          );
        }
      } finally {
        setChipLoading(false);
      }
    })();

    return () => ctrl.abort();
  }, [wl.ready, wl.selectedId, watchItemKey, wl.selectedList]);

  // 追蹤列表背景預熱 K 線快取（僅價格 API，不抓 MOPS）
  useEffect(() => {
    if (!wl.ready || !wl.selectedList || wl.selectedList.items.length === 0) {
      return;
    }

    const ctrl = new AbortController();
    const items = wl.selectedList.items;

    (async () => {
      for (const item of items) {
        if (ctrl.signal.aborted) break;
        const cache = getPriceCache(item.stockId);
        const params = new URLSearchParams({ id: item.stockId });
        if (cache?.latestDate) {
          params.set("priceLatest", cache.latestDate);
        }
        try {
          const res = await fetch(`/api/price?${params}`, {
            signal: ctrl.signal,
          });
          if (!res.ok) continue;
          const data = (await res.json()) as {
            stock: {
              stock_id: string;
              stock_name: string;
              industry_category: string;
              type: string;
            };
            dailyPrices?: DailyPrice[];
            latestPriceDate?: string | null;
          };
          if (data.dailyPrices?.length) {
            const merged = mergeDailyPrices(
              cache?.dailyPrices ?? [],
              data.dailyPrices
            );
            savePriceCache(item.stockId, {
              stockName: data.stock.stock_name,
              industryCategory: data.stock.industry_category,
              type: data.stock.type,
              dailyPrices: merged,
              latestDate: data.latestPriceDate ?? undefined,
            });
          }
        } catch (e) {
          if ((e as Error).name === "AbortError") break;
        }
      }
    })();

    return () => ctrl.abort();
  }, [wl.ready, wl.selectedId, watchItemKey, wl.selectedList]);

  const upcomingStockEvents = useMemo(() => {
    if (!result) return [];
    const mops = buildMopsCalendarEvents(result);
    const today = taiwanTodayYmd();
    return mops
      .filter((e) => e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
  }, [result]);

  const flashMsg = useCallback((msg: string) => {
    setAddMsg(msg);
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setAddMsg(null), 2500);
  }, []);

  useEffect(
    () => () => {
      if (msgTimer.current) clearTimeout(msgTimer.current);
    },
    []
  );

  function handleAddToList() {
    if (!result) return;
    if (wl.lists.length === 0) {
      flashMsg("尚無追蹤列表，請先按上方「追蹤列表」新增");
      return;
    }
    setAddToListOpen(true);
  }

  function confirmAddToList(listId: string) {
    if (!result) return;
    const list = wl.lists.find((l) => l.id === listId);
    if (!list) return;
    const added = wl.addItem(listId, {
      stockId: result.stock.stock_id,
      stockName: result.stock.stock_name,
    });
    if (added) {
      persistResultToLocalCache(result);
      wl.selectList(listId);
    }
    setAddToListOpen(false);
    flashMsg(
      added
        ? `已將「${result.stock.stock_name}」加入「${list.name}」`
        : `「${result.stock.stock_name}」已在「${list.name}」中`
    );
  }

  async function handleOpenConferenceNews(c: InvestorConference) {
    if (!result) return;
    setMeetingLoading(true);
    setMeetingContent(conferenceNewsPlaceholder(c));
    try {
      const params = new URLSearchParams({
        name: result.stock.stock_name,
        id: result.stock.stock_id,
        date: c.date,
      });
      const res = await fetch(`/api/conference-news?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setMeetingContent({
          ...conferenceNewsPlaceholder(c),
          body: data.error ?? "新聞搜尋失敗",
          articles: [],
        });
        return;
      }
      setMeetingContent({
        ...conferenceNewsPlaceholder(c),
        articles: data.articles ?? [],
      });
    } catch {
      setMeetingContent({
        ...conferenceNewsPlaceholder(c),
        body: "新聞搜尋失敗，請稍後再試。",
        articles: [],
      });
    } finally {
      setMeetingLoading(false);
    }
  }

  async function handleOpenShareholderNews(m: ShareholderMeeting) {
    if (!result) return;
    setMeetingLoading(true);
    setMeetingContent(shareholderNewsPlaceholder(m));
    try {
      const params = new URLSearchParams({
        name: result.stock.stock_name,
        id: result.stock.stock_id,
        date: m.date,
        type: m.type,
      });
      const res = await fetch(`/api/shareholder-news?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setMeetingContent({
          ...shareholderNewsPlaceholder(m),
          body: data.error ?? "新聞搜尋失敗",
          articles: [],
        });
        return;
      }
      setMeetingContent({
        ...shareholderNewsPlaceholder(m),
        articles: data.articles ?? [],
      });
    } catch {
      setMeetingContent({
        ...shareholderNewsPlaceholder(m),
        body: "新聞搜尋失敗，請稍後再試。",
        articles: [],
      });
    } finally {
      setMeetingLoading(false);
    }
  }

  const latestConference = result?.conferences[0] ?? null;
  const meetings = result?.shareholderMeetings ?? [];

  const prices = result?.dailyPrices ?? [];
  const lastPrice = prices.length > 0 ? prices[prices.length - 1] : null;
  const prevClose = prices.length > 1 ? prices[prices.length - 2].close : null;
  const change =
    lastPrice && prevClose != null ? lastPrice.close - prevClose : null;
  const changePct =
    change != null && prevClose ? (change / prevClose) * 100 : null;
  const changeCls = change == null ? "na" : change > 0 ? "up" : change < 0 ? "down" : "na";

  const macdAnalysis = useMemo(
    () =>
      analyzeMacd(
        prices.map((p) => ({ high: p.high, low: p.low, close: p.close }))
      ),
    [prices]
  );

  const watchItemsForTouches = useMemo(() => {
    const seen = new Set<string>();
    const items: { stockId: string; stockName: string }[] = [];
    for (const list of wl.lists) {
      for (const it of list.items) {
        if (seen.has(it.stockId)) continue;
        seen.add(it.stockId);
        items.push(it);
      }
    }
    return items;
  }, [wl.lists]);

  return (
    <main className="container">
      <div className="page-top">
        <div className="page-query-date" aria-label="今日日期">
          {taiwanTodayYmd()}
        </div>
        <header className="site-header">
          <h1>
            <span className="brand">荷包股股</span>
            <span className="brand-en">StocksGood</span>
          </h1>
        </header>
        <nav className="feature-bar" aria-label="功能列">
          <button
            type="button"
            className="feature-item"
            onClick={() => setWatchlistOpen(true)}
          >
            追蹤列表
          </button>
          <button
            type="button"
            className="feature-item"
            onClick={() => setDataAnalysisOpen(true)}
          >
            數據分析
          </button>
          <button
            type="button"
            className="feature-item"
            onClick={() => setNotifyOpen(true)}
          >
            通知
          </button>
          <button
            type="button"
            className="feature-item"
            onClick={() => setAboutOpen(true)}
          >
            關於
          </button>
        </nav>
      </div>

      <div className="layout">
        <section
          className="panel-frame panel-frame-query"
          aria-labelledby="panel-query-title"
        >
          <h2 id="panel-query-title" className="panel-frame-title">
            個股查詢
          </h2>
          <div className="layout-search">
            <form
              className="search"
              onSubmit={(e) => {
                e.preventDefault();
                search(query);
              }}
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="例如：台積電 或 2330"
                autoFocus
              />
              <button type="submit" disabled={loading}>
                {loading ? "查詢中…" : "查詢"}
              </button>
            </form>
          </div>
        </section>

        <section
          className="panel-frame panel-frame-market"
          aria-labelledby="panel-market-title"
        >
          <h2 id="panel-market-title" className="panel-frame-title">
            大盤資訊
          </h2>
          <div className="stock-market-row">
            {taiex && (
              <span
                className={`market-metric ${
                  taiex.change != null
                    ? taiex.change > 0
                      ? "up"
                      : taiex.change < 0
                        ? "down"
                        : ""
                    : ""
                }`}
                title={taiex.date}
              >
                <span className="market-metric-label">加權指數</span>
                <span className="market-metric-value">
                  {taiex.close.toLocaleString("zh-TW", {
                    maximumFractionDigits: 2,
                  })}
                </span>
                {taiex.change != null && (
                  <span className="market-metric-change">
                    {taiex.change > 0 ? "▲" : taiex.change < 0 ? "▼" : ""}
                    {taiex.change > 0 ? "+" : ""}
                    {taiex.change.toFixed(2)}
                    {taiex.changePct != null &&
                      ` (${taiex.changePct > 0 ? "+" : ""}${taiex.changePct.toFixed(2)}%)`}
                  </span>
                )}
              </span>
            )}
            {marginMaintenance && (
              <span
                className={`market-metric margin-rate tone-${
                  marginMaintenance.rate < 140
                    ? "danger"
                    : marginMaintenance.rate < 160
                      ? "warn"
                      : "ok"
                }`}
                title={
                  marginMaintenance.source === "twse_estimate"
                    ? `${marginMaintenance.date} · 估算`
                    : marginMaintenance.date
                }
              >
                <span className="market-metric-label">融資維持率</span>
                <span className="market-metric-value">
                  {marginMaintenance.rate.toFixed(2)}%
                </span>
              </span>
            )}
            <StockPriceTargets
              section="touches"
              stockId={result?.stock.stock_id ?? ""}
              latestBar={lastPrice}
              watchItems={watchItemsForTouches}
            />
          </div>
        </section>

        <section
          className="panel-frame panel-frame-stock"
          aria-labelledby="panel-stock-title"
        >
          <h2 id="panel-stock-title" className="panel-frame-title">
            個股資訊
          </h2>

          <div className="panel-stock-head">
            {error && <div className="error">{error}</div>}
            {loading && !result && <div className="skeleton skeleton-head" />}
            {!result && !loading && !error && (
              <div className="placeholder placeholder-head">
                輸入股票名稱或代號，或按上方「追蹤列表」點選，即可查看股票資訊。
              </div>
            )}
            {result && (
              <div className="stock-head">
                <div className="stock-identity">
                  <div className="stock-identity-top">
                    <span className="stock-title">
                      <button
                        type="button"
                        className="add-to-list-icon"
                        onClick={handleAddToList}
                        title="加入追蹤列表"
                        aria-label="加入追蹤列表"
                      >
                        <span aria-hidden>+</span>
                      </button>
                      <span className="name">{result.stock.stock_name}</span>
                    </span>
                    <span className="code">{result.stock.stock_id}</span>
                  </div>
                  {lastPrice && (
                    <span
                      className={`price-block ${changeCls}`}
                      title={`${lastPrice.date} 收盤`}
                    >
                      <span className="price-value">
                        {lastPrice.close.toLocaleString("zh-TW")}
                      </span>
                      {change != null && (
                        <span className="price-change">
                          {change > 0 ? "▲" : change < 0 ? "▼" : ""}
                          {change > 0 ? "+" : ""}
                          {change.toFixed(2)}
                          {changePct != null &&
                            ` (${changePct > 0 ? "+" : ""}${changePct.toFixed(
                              2
                            )}%)`}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="stock-head-meta">
                  {keyPrices.length > 0 && (
                    <span className="stock-key-prices" title="關鍵價格">
                      {keyPrices.map(formatKeyPrice).join("、")}
                    </span>
                  )}
                  <StockPriceTargets
                    section="form"
                    stockId={result.stock.stock_id}
                    latestBar={lastPrice}
                    watchItems={watchItemsForTouches}
                  />
                  <StockInsightsPanel
                    section="macd"
                    events={[]}
                    eventsLoading={false}
                    analysis={macdAnalysis}
                  />
                  {marginUsage && (
                    <span
                      className={`stock-margin-usage tone-${
                        marginUsage.rate >= 80
                          ? "danger"
                          : marginUsage.rate >= 60
                            ? "warn"
                            : "ok"
                      }`}
                      title={`融資使用率（${marginUsage.date}）· 餘額 ${marginUsage.balance.toLocaleString("zh-TW")}／限額 ${marginUsage.limit.toLocaleString("zh-TW")} 張`}
                    >
                      <span className="stock-margin-usage-label">
                        融資使用率
                      </span>
                      <span className="stock-margin-usage-value">
                        {marginUsage.rate.toFixed(2)}%
                      </span>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {(wl.ready || result) && (
            <div className="panel-stock-body">
              <aside className="panel-stock-left col-left">
                {result && (
                  <>
                    {wl.ready && (
                      <ChipPanel
                        snapshots={chipSnapshots}
                        loading={chipLoading}
                        error={chipError}
                        filterStockId={result.stock.stock_id}
                        filterStockName={result.stock.stock_name}
                        listName={wl.selectedList?.name ?? null}
                        itemCount={wl.selectedList?.items.length ?? 0}
                        onPickStock={(id) => search(id)}
                      />
                    )}
                    <section className="section">
                      <h2>
                        <span className="dot" />
                        股東會
                      </h2>
                      {meetings.length > 0 ? (
                        meetings.map((m, i) => (
                          <ShareholderCard
                            m={m}
                            key={`s${i}`}
                            activeId={meetingContent?.id ?? null}
                            onOpenNews={() => handleOpenShareholderNews(m)}
                          />
                        ))
                      ) : (
                        <p className="empty">
                          查無近期股東會資料（多於 4-8 月召開）。可至{" "}
                          <a
                            className="muted-link"
                            href={result.mopsShareholderUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            公開資訊觀測站・股東會
                          </a>{" "}
                          查詢。
                        </p>
                      )}
                    </section>

                    <section className="section">
                      <h2>
                        <span className="dot" />
                        法人說明會
                      </h2>
                      {latestConference ? (
                        <ConferenceCard
                          c={latestConference}
                          activeId={meetingContent?.id ?? null}
                          onOpenNews={() =>
                            handleOpenConferenceNews(latestConference)
                          }
                        />
                      ) : (
                        <p className="empty">
                          查無近期法說會資料。可至{" "}
                          <a
                            className="muted-link"
                            href={result.mopsConferenceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            公開資訊觀測站・法說會
                          </a>{" "}
                          查詢。
                        </p>
                      )}
                    </section>
                  </>
                )}
              </aside>

              <div className="panel-stock-right">
                {result && (
                  <>
                    <StockInsightsPanel
                      section="events"
                      events={upcomingStockEvents}
                      eventsLoading={false}
                      analysis={null}
                    />

                    <section className="col-right">
                      {addMsg && <div className="toast">{addMsg}</div>}

                      {result.warnings.map((w, i) => (
                        <div className="warn" key={i}>
                          ⚠️ {w}
                        </div>
                      ))}

                      <DisplayBlock
                        prices={result.dailyPrices}
                        meetingContent={meetingContent}
                        meetingLoading={meetingLoading}
                      />

                      <section className="section">
                        <h2>
                          <span className="dot" />
                          近三個月月營收增長
                        </h2>
                        <RevenueSection data={result.monthlyRevenue} />
                      </section>

                      <section className="section">
                        <h2>
                          <span className="dot" />
                          近四季季報
                        </h2>
                        <ReportsSection data={result.quarterlyReports} />
                        <p
                          style={{
                            marginTop: 12,
                            fontSize: 12,
                            color: "#9aa7c2",
                          }}
                        >
                          金額單位：元（自動換算為億/萬）。資料來源：FinMind。
                        </p>
                      </section>
                    </section>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      <footer>
        資料來源：FinMind、公開資訊觀測站（MOPS）。本站僅供研究參考，不構成投資建議。
      </footer>

      <DataAnalysisModal
        open={dataAnalysisOpen}
        onClose={() => setDataAnalysisOpen(false)}
      />
      <WatchlistSettings
        open={watchlistOpen}
        onClose={() => setWatchlistOpen(false)}
        wl={wl}
        onPickStock={(id) => search(id)}
      />
      <NotifySettings
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        lists={wl.lists}
      />
      <Modal
        open={aboutOpen}
        title="關於・荷包股股"
        onClose={() => setAboutOpen(false)}
      >
        <div className="about-modal">
          <p className="modal-text">
            <strong>荷包股股（StocksGood）</strong>{" "}
            是台股查詢與追蹤工具，協助以名稱或代號快速查看個股與大盤資訊，並搭配追蹤列表、關鍵價格與通知，方便日常觀察。
          </p>
          <p className="modal-text about-disclaimer">
            資料僅供研究參考，不構成投資建議。
          </p>

          <h4 className="about-heading">主要功能</h4>
          <ol className="about-list">
            <li>
              <strong>個股查詢</strong>
              ：輸入股票名稱或代號，查詢個股資訊。
            </li>
            <li>
              <strong>大盤資訊</strong>
              ：顯示加權指數、融資維持率，以及追蹤列表的最近交易日觸價。
            </li>
            <li>
              <strong>個股資訊</strong>
              <ul className="about-sublist">
                <li>股價與漲跌</li>
                <li>融資使用率</li>
                <li>關鍵價格（設定／檢視）</li>
                <li>MACD 三層分析（戰術／結構／進出場）</li>
                <li>大戶籌碼（集保股權分散）</li>
                <li>即將到來的已公告事件</li>
                <li>股東會、法人說明會</li>
                <li>K 線圖</li>
                <li>近三個月月營收、近四季季報</li>
              </ul>
            </li>
            <li>
              <strong>追蹤列表</strong>
              ：建立多個列表、加入／管理股票，並作為籌碼與觸價彙整來源。
            </li>
            <li>
              <strong>數據分析</strong>
              ：說明 MACD 三層分析邏輯與判讀方式。
            </li>
            <li>
              <strong>通知</strong>
              ：可設定關鍵價格觸價、MACD 條件、行事曆事件等 Email
              通知（需自行設定信箱環境）。
            </li>
          </ol>

          <h4 className="about-heading">資料來源</h4>
          <p className="modal-text about-sources">
            FinMind、證交所／櫃買相關公開資料、公開資訊觀測站（MOPS）、集保
            TDCC 開放資料等。
          </p>
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="btn"
            onClick={() => setAboutOpen(false)}
          >
            關閉
          </button>
        </div>
      </Modal>
      <Modal
        open={addToListOpen}
        title="加入追蹤列表"
        onClose={() => setAddToListOpen(false)}
      >
        {result && (
          <>
            <p className="modal-text">
              將「{result.stock.stock_name}」（{result.stock.stock_id}
              ）加入哪個列表？
            </p>
            <ul className="add-list-picker">
              {wl.lists.map((list) => {
                const already = list.items.some(
                  (it) => it.stockId === result.stock.stock_id
                );
                return (
                  <li key={list.id}>
                    <button
                      type="button"
                      className={`add-list-option${already ? " already" : ""}`}
                      onClick={() => confirmAddToList(list.id)}
                    >
                      <span className="add-list-option-name">{list.name}</span>
                      <span className="add-list-option-meta">
                        {already
                          ? "已在列表中"
                          : `${list.items.length} 檔`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="modal-footer">
              <button
                type="button"
                className="btn ghost"
                onClick={() => setAddToListOpen(false)}
              >
                取消
              </button>
            </div>
          </>
        )}
      </Modal>
    </main>
  );
}
