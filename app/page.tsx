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
import {
  getMarginUsageCache,
  mergeMarginUsagePoints,
  saveMarginUsageCache,
} from "@/lib/margin-usage-cache";
import { purgeUnwatchedLocalData } from "@/lib/local-cache";
import { useWatchlists, isStockWatched, findWatchedStockByQuery } from "@/lib/watchlists";
import ChipPanel from "./components/ChipPanel";
import StockMemo from "./components/StockMemo";
import NewsModal from "./components/NewsModal";
import MacroWorkspace from "./components/MacroWorkspace";
import MacroAnalysisModal from "./components/MacroAnalysisModal";
import GlobalIndexWorkspace from "./components/GlobalIndexWorkspace";
import HoldingsWorkspace from "./components/HoldingsWorkspace";
import StockInsightsPanel from "./components/StockInsightsPanel";
import StockPriceTargets from "./components/StockPriceTargets";
import DisplayBlock from "./components/DisplayBlock";
import DataAnalysisModal from "./components/DataAnalysisModal";
import NotifySettings from "./components/NotifySettings";
import WatchlistSettings from "./components/WatchlistSettings";
import GoldPickModal from "./components/GoldPickModal";
import Modal from "./components/Modal";
import {
  buildMopsCalendarEvents,
  taiwanTodayYmd,
} from "@/lib/calendar-event-utils";
import { analyzeMacd } from "@/lib/indicators";
import { getEstimatedEps } from "@/lib/estimated-eps";
import { getPeBand, setPeBand as savePeBand } from "@/lib/pe-band";
import { getEstPriceTargets } from "@/lib/estimated-price";
import { hasGoldPicks } from "@/lib/gold-picks";

type MainTab = "tw-stock" | "global" | "macro" | "holdings";

const MAIN_TABS: { id: MainTab; label: string }[] = [
  { id: "tw-stock", label: "台股個股" },
  { id: "global", label: "國際指數" },
  { id: "macro", label: "總經" },
  { id: "holdings", label: "股票庫存" },
];

const ACTIVE_TAB_KEY = "ff_active_tab";

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

/** FinMind 市場別 -> 顯示文字（上市／上櫃／興櫃） */
function marketTypeLabel(type: string | null | undefined): string | null {
  const t = type?.trim().toLowerCase();
  if (!t) return null;
  if (t === "twse") return "上市";
  if (t === "tpex") return "上櫃";
  return "興櫃";
}

/** 預估股價 = 預估 EPS × 本益比 */
function formatEstPrice(eps: number | null, peStr: string): string {
  const pe = Number(peStr.trim().replace(/,/g, ""));
  if (eps == null || !Number.isFinite(eps) || !Number.isFinite(pe) || pe <= 0) {
    return "—";
  }
  const price = eps * pe;
  if (!Number.isFinite(price)) return "—";
  return price.toLocaleString("zh-TW", { maximumFractionDigits: 1 });
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

/** 重新抓取單檔的價格＋財報（增量）並寫入本地快取 */
async function refreshStockCaches(stockId: string) {
  const localCache = getFinancialCacheForQuery(stockId);
  const priceCache = getPriceCache(stockId);
  const params = new URLSearchParams({ q: stockId });
  if (localCache?.latestRevenueMonth)
    params.set("revLatest", localCache.latestRevenueMonth);
  if (
    localCache?.latestQuarterDate &&
    (localCache.quarterlyReports?.length ?? 0) >= 5
  ) {
    params.set("qLatest", localCache.latestQuarterDate);
  }
  if (priceCache?.latestDate) params.set("priceLatest", priceCache.latestDate);

  let data: (StockApiResponse & { error?: string }) | null = null;
  try {
    const res = await fetch(`/api/stock?${params}`);
    if (!res.ok) return;
    data = (await res.json()) as StockApiResponse & { error?: string };
  } catch {
    return;
  }
  if (!data?.stock?.stock_id) return;
  const id = data.stock.stock_id;

  const cachedPrices =
    getPriceCache(id)?.dailyPrices ?? priceCache?.dailyPrices ?? [];
  const dailyPrices = data.dailyPrices
    ? mergeDailyPrices(cachedPrices, data.dailyPrices)
    : cachedPrices;
  if (dailyPrices.length > 0) {
    savePriceCache(id, {
      stockName: data.stock.stock_name,
      industryCategory: data.stock.industry_category,
      type: data.stock.type,
      dailyPrices,
      latestDate: data.financialsMeta?.latestPriceDate ?? undefined,
    });
  }

  const meta = data.financialsMeta;
  if (meta?.latestRevenueMonth || meta?.latestQuarterDate) {
    rememberStockAlias(data.stock.stock_name, id);
    saveFinancialCache(id, {
      monthlyRevenue: data.monthlyRevenue,
      quarterlyReports: data.quarterlyReports,
      latestRevenueMonth:
        meta.latestRevenueMonth ??
        localCache?.latestRevenueMonth ??
        data.monthlyRevenue?.[0]?.yearMonth ??
        "",
      latestQuarterDate:
        meta.latestQuarterDate ??
        localCache?.latestQuarterDate ??
        data.quarterlyReports?.[0]?.date ??
        "",
    });
  }
}

/** 重新抓取單檔最新股價（增量）並寫入本地快取（輕量，不含財報/MOPS） */
async function refreshStockPriceCache(stockId: string) {
  const cache = getPriceCache(stockId);
  const params = new URLSearchParams({ id: stockId });
  if (cache?.latestDate) params.set("priceLatest", cache.latestDate);
  try {
    const res = await fetch(`/api/price?${params.toString()}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      stock?: {
        stock_id: string;
        stock_name: string;
        industry_category: string;
        type: string;
      };
      dailyPrices?: DailyPrice[];
      latestPriceDate?: string | null;
    };
    if (!data?.stock || !data.dailyPrices?.length) return;
    const merged = mergeDailyPrices(cache?.dailyPrices ?? [], data.dailyPrices);
    savePriceCache(stockId, {
      stockName: data.stock.stock_name,
      industryCategory: data.stock.industry_category,
      type: data.stock.type,
      dailyPrices: merged,
      latestDate: data.latestPriceDate ?? undefined,
    });
  } catch {
    /* 忽略單檔價格更新失敗 */
  }
}

/** 重新抓取單檔融資使用率走勢（增量）並寫入本地快取 */
async function refreshMarginHistory(stockId: string) {
  const cached = getMarginUsageCache(stockId);
  const cachedPoints = cached?.points ?? [];
  const lastDate = cachedPoints.length
    ? cachedPoints[cachedPoints.length - 1].date
    : "";
  try {
    const qs = new URLSearchParams({ stockId });
    if (lastDate) qs.set("start", lastDate);
    const res = await fetch(`/api/margin-usage-history?${qs.toString()}`);
    if (!res.ok) return;
    const json = await res.json();
    const incoming = Array.isArray(json.points) ? json.points : [];
    const merged = mergeMarginUsagePoints(cachedPoints, incoming);
    saveMarginUsageCache(stockId, merged);
  } catch {
    /* 忽略單檔融資使用率更新失敗 */
  }
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

function sumMetric(
  quarters: QuarterlyReport[],
  key: string
): number | null {
  let sum = 0;
  let has = false;
  for (const q of quarters) {
    const v = q.metrics.find((m) => m.key === key)?.value;
    if (v == null || Number.isNaN(v)) continue;
    sum += v;
    has = true;
  }
  return has ? sum : null;
}

function ttmEps(reports: QuarterlyReport[]): number | null {
  return sumMetric(reports.slice(0, 4), "EPS");
}

function ttmPe(
  close: number | null | undefined,
  reports: QuarterlyReport[]
): number | null {
  const eps = ttmEps(reports);
  if (close == null || !Number.isFinite(close) || close <= 0) return null;
  if (eps == null || !Number.isFinite(eps) || eps <= 0) return null;
  return close / eps;
}

function parsePeNumber(raw: string): number | null {
  const n = Number(raw.trim().replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function ttmPeTone(
  pe: number,
  lower: number | null,
  upper: number | null
): "up" | "down" | "" {
  if (upper != null && pe > upper) return "up";
  if (lower != null && pe < lower) return "down";
  return "";
}

function ttmEpsChange(
  current: number | null,
  previous: number | null,
  hasPrevWindow: boolean
): "up" | "down" | "flat" | null {
  if (!hasPrevWindow || current == null || previous == null) return null;
  const a = Math.round(current * 100);
  const b = Math.round(previous * 100);
  if (a > b) return "up";
  if (a < b) return "down";
  return "flat";
}

function ReportsSection({ data }: { data: QuarterlyReport[] }) {
  if (data.length === 0) return <p className="empty">查無季報資料。</p>;
  const shown = data.slice(0, 4);
  const labels = shown[0].metrics.map((m) => ({ key: m.key, label: m.label }));
  const hasPrevTtm = data.length >= 5;
  const epsChange = ttmEpsChange(
    sumMetric(shown, "EPS"),
    hasPrevTtm ? sumMetric(data.slice(1, 5), "EPS") : null,
    hasPrevTtm
  );
  return (
    <table className="fin">
      <thead>
        <tr>
          <th>科目</th>
          <th className="q-ttm">近四季累計</th>
          {shown.map((q) => (
            <th key={q.date}>{q.quarter}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {labels.map((row) => {
          const ttm = sumMetric(shown, row.key);
          return (
            <tr key={row.key}>
              <td>{row.label}</td>
              <td className="q-ttm">
                {formatMetric(row.key, ttm)}
                {row.key === "EPS" && epsChange === "up" ? (
                  <span className="ttm-arrow up" aria-label="近四季 EPS 上升">
                    ▲
                  </span>
                ) : null}
                {row.key === "EPS" && epsChange === "down" ? (
                  <span className="ttm-arrow down" aria-label="近四季 EPS 下降">
                    ▼
                  </span>
                ) : null}
                {row.key === "EPS" && epsChange === "flat" ? (
                  <span className="ttm-arrow flat" aria-label="近四季 EPS 持平">
                    -
                  </span>
                ) : null}
              </td>
              {shown.map((q) => {
                const metric = q.metrics.find((m) => m.key === row.key);
                return (
                  <td key={q.date}>
                    {formatMetric(row.key, metric ? metric.value : null)}
                  </td>
                );
              })}
            </tr>
          );
        })}
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
  const [peBand, setPeBand] = useState({ lower: "", fair: "", upper: "" });
  const [estEps, setEstEps] = useState<{
    thisYear: number | null;
    nextYear: number | null;
  }>({ thisYear: null, nextYear: null });
  const [dataAnalysisOpen, setDataAnalysisOpen] = useState(false);
  const [globalAnalysisOpen, setGlobalAnalysisOpen] = useState(false);
  const [macroAnalysisOpen, setMacroAnalysisOpen] = useState(false);
  const [holdingsRefreshNonce, setHoldingsRefreshNonce] = useState(0);
  const [holdingsRefreshing, setHoldingsRefreshing] = useState(false);
  const [globalRefreshNonce, setGlobalRefreshNonce] = useState(0);
  const [globalRefreshing, setGlobalRefreshing] = useState(false);
  const [macroRefreshNonce, setMacroRefreshNonce] = useState(0);
  const [macroRefreshing, setMacroRefreshing] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [goldPickOpen, setGoldPickOpen] = useState(false);
  const [goldTick, setGoldTick] = useState(0);
  const [newsOpen, setNewsOpen] = useState(false);
  const [addToListOpen, setAddToListOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>("tw-stock");
  // 首次打開才掛載並抓資料，之後保持掛載以保留狀態
  const [visitedTabs, setVisitedTabs] = useState<Set<MainTab>>(new Set());
  const wl = useWatchlists();
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // localStorage 只能在掛載後讀，避免伺服器與瀏覽器首次渲染不一致
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ACTIVE_TAB_KEY);
      if (MAIN_TABS.some((t) => t.id === saved)) setActiveTab(saved as MainTab);
    } catch {
      /* 無法存取 localStorage 時維持預設 tab */
    }
  }, []);

  useEffect(() => {
    if (activeTab === "tw-stock") return;
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  function selectTab(tab: MainTab) {
    setActiveTab(tab);
    try {
      window.localStorage.setItem(ACTIVE_TAB_KEY, tab);
    } catch {
      /* 容量不足時忽略 */
    }
  }

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
    if (
      localCache?.latestQuarterDate &&
      (localCache.quarterlyReports?.length ?? 0) >= 5
    ) {
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
    const stockId = result?.stock.stock_id;
    if (!stockId) {
      setPeBand({ lower: "", fair: "", upper: "" });
      return;
    }
    setPeBand(getPeBand(stockId));
    const onBandChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ stockId?: string }>).detail;
      if (detail?.stockId && detail.stockId !== stockId) return;
      setPeBand(getPeBand(stockId));
    };
    window.addEventListener("ff-pe-band-changed", onBandChanged);
    return () =>
      window.removeEventListener("ff-pe-band-changed", onBandChanged);
  }, [result?.stock.stock_id]);

  function updatePeBand(field: "lower" | "fair" | "upper", value: string) {
    setPeBand((prev) => {
      const next = { ...prev, [field]: value };
      const stockId = result?.stock.stock_id;
      if (stockId) savePeBand(stockId, next);
      return next;
    });
  }

  useEffect(() => {
    const stockId = result?.stock.stock_id;
    if (!stockId) {
      setEstEps({ thisYear: null, nextYear: null });
      return;
    }
    setEstEps(getEstimatedEps(stockId));
    const onEpsChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ stockId?: string }>).detail;
      if (detail?.stockId && detail.stockId !== stockId) return;
      setEstEps(getEstimatedEps(stockId));
    };
    window.addEventListener("ff-estimated-eps-changed", onEpsChanged);
    return () =>
      window.removeEventListener("ff-estimated-eps-changed", onEpsChanged);
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
  const trailingPe =
    result && lastPrice
      ? ttmPe(lastPrice.close, result.quarterlyReports)
      : null;
  const trailingPeTone =
    trailingPe != null
      ? ttmPeTone(
          trailingPe,
          parsePeNumber(peBand.lower),
          parsePeNumber(peBand.upper)
        )
      : "";

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

  // 將目前追蹤清單（含由 EPS×本益比 算出的預估股價目標）與觀察列表結構
  // 推送到伺服器 notify-config。空清單也要同步，才能清掉伺服器上已刪除的股票。
  const syncNotifyTargets = useCallback(async () => {
    const items = watchItemsForTouches.map((it) => ({
      stockId: it.stockId,
      stockName: it.stockName,
      estPriceTargets: getEstPriceTargets(it.stockId),
    }));
    const lists = wl.lists.map((l) => ({
      id: l.id,
      name: l.name,
      stockIds: l.items.map((it) => it.stockId),
    }));
    try {
      await fetch("/api/notify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, lists }),
      });
    } catch {
      /* 自動同步失敗時靜默，不影響前端操作 */
    }
  }, [watchItemsForTouches, wl.lists]);

  // 追蹤列表變動時：清除本地孤兒資料，並把通知清單同步到伺服器
  // （寄信掃描讀的是伺服器 notify-config，不是瀏覽器追蹤列表）
  useEffect(() => {
    if (!wl.ready) return;
    purgeUnwatchedLocalData(watchItemsForTouches.map((i) => i.stockId));
    const timer = setTimeout(() => void syncNotifyTargets(), 800);
    return () => clearTimeout(timer);
  }, [wl.ready, watchItemsForTouches, syncNotifyTargets]);

  // 選項 C：輸入預估 EPS／本益比後，自動（防抖）同步觸價目標到伺服器
  useEffect(() => {
    if (!wl.ready) return;
    const watchedIds = new Set(watchItemsForTouches.map((i) => i.stockId));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ stockId?: string }>).detail;
      // 僅追蹤清單內的股票才需要同步（其餘不會出現在通知中）
      if (detail?.stockId && !watchedIds.has(detail.stockId)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void syncNotifyTargets(), 1500);
    };
    window.addEventListener("ff-estimated-eps-changed", onChange);
    window.addEventListener("ff-pe-band-changed", onChange);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ff-estimated-eps-changed", onChange);
      window.removeEventListener("ff-pe-band-changed", onChange);
    };
  }, [wl.ready, watchItemsForTouches, syncNotifyTargets]);

  useEffect(() => {
    if (!wl.ready) return;
    const onChange = () => setGoldTick((n) => n + 1);
    window.addEventListener("ff-estimated-eps-changed", onChange);
    window.addEventListener("ff-pe-band-changed", onChange);
    return () => {
      window.removeEventListener("ff-estimated-eps-changed", onChange);
      window.removeEventListener("ff-pe-band-changed", onChange);
    };
  }, [wl.ready]);

  const hasGoldPickHits = useMemo(() => {
    if (!wl.ready) return false;
    return hasGoldPicks(wl.lists);
  }, [wl.ready, wl.lists, goldTick]);

  // 「更新」：讀取所有追蹤股票的最新資料並更新本地端（silent 用於開啟時自動更新）
  const refreshAllWatched = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    const items = watchItemsForTouches;
    // 先清除孤兒資料，確保只保留追蹤列表內的股票
    purgeUnwatchedLocalData(items.map((i) => i.stockId));
    if (items.length === 0) {
      if (!silent) flashMsg("追蹤列表為空，無資料可更新");
      return;
    }
    setRefreshing(true);
    try {
      // 1) 大戶籌碼（批次）
      try {
        const params = new URLSearchParams({
          ids: items.map((i) => i.stockId).join(","),
          names: items.map((i) => `${i.stockId}:${i.stockName}`).join(","),
        });
        const res = await fetch(`/api/watchlist-chip?${params}`);
        const data = await res.json();
        if (data?.periods?.length) saveChipCacheFromFetch(data.periods);
      } catch {
        /* 忽略籌碼更新失敗 */
      }

      // 2) 逐檔更新價格＋財報與融資使用率走勢（增量）
      for (const item of items) {
        await refreshStockCaches(item.stockId);
        await refreshMarginHistory(item.stockId);
      }

      // 3) 重新整理目前檢視中的個股畫面
      if (result) await search(result.stock.stock_id);

      if (!silent) flashMsg(`已更新 ${items.length} 檔最新資料`);
    } finally {
      setRefreshing(false);
      setGoldTick((n) => n + 1);
    }
  }, [watchItemsForTouches, result, search, flashMsg]);

  // 輕量更新：只更新股價＋融資使用率（供頁面重整時自動觸發）
  const refreshWatchedLight = useCallback(async () => {
    const items = watchItemsForTouches;
    purgeUnwatchedLocalData(items.map((i) => i.stockId));
    if (items.length === 0) return;
    setRefreshing(true);
    try {
      for (const item of items) {
        await refreshStockPriceCache(item.stockId);
        await refreshMarginHistory(item.stockId);
      }
    } finally {
      setRefreshing(false);
      setGoldTick((n) => n + 1);
    }
  }, [watchItemsForTouches]);

  // 開啟／重整頁面時：自動「輕量」更新股價＋融資使用率，
  // 讓本地端與伺服器排程寄信所用的最新資料保持一致（另一半）。
  // 時間節流：距上次自動更新未滿 1 小時就略過。
  const didAutoRefresh = useRef(false);
  useEffect(() => {
    if (!wl.ready || didAutoRefresh.current) return;
    if (watchItemsForTouches.length === 0) return;
    didAutoRefresh.current = true;

    const now = Date.now();
    let last = 0;
    try {
      last = Number(window.localStorage.getItem("ff_last_auto_refresh")) || 0;
    } catch {
      /* ignore */
    }
    if (now - last < 60 * 60 * 1000) return; // 1 小時內不重複自動更新
    try {
      window.localStorage.setItem("ff_last_auto_refresh", String(now));
    } catch {
      /* ignore */
    }
    void refreshWatchedLight();
  }, [wl.ready, watchItemsForTouches, refreshWatchedLight]);

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

      <div className="main-tabs" role="tablist" aria-label="主要分類">
        {MAIN_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`main-tab-${t.id}`}
            aria-selected={activeTab === t.id}
            aria-controls={`main-panel-${t.id}`}
            className={`main-tab${activeTab === t.id ? " active" : ""}`}
            onClick={() => selectTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 用 hidden 而非卸載，切回時保留查詢結果與圖表 */}
      <div
        role="tabpanel"
        id="main-panel-tw-stock"
        aria-labelledby="main-tab-tw-stock"
        hidden={activeTab !== "tw-stock"}
      >
        <div className="tab-toolbar">
          <button
            type="button"
            className="feature-item"
            onClick={() => void refreshAllWatched()}
            disabled={refreshing}
            title="讀取所有追蹤股票的最新資料並更新本地端"
          >
            {refreshing ? "更新中…" : "更新"}
          </button>
          <button
            type="button"
            className={`feature-item${hasGoldPickHits ? " gold-pick-flash" : ""}`}
            onClick={() => setGoldPickOpen(true)}
            title="現價低於今年或明年合理價的追蹤股票"
          >
            撿黃金
          </button>
          <button
            type="button"
            className="feature-item"
            onClick={() => setNewsOpen(true)}
            title="「持股」列表內各股近 24 小時的新聞"
          >
            新聞
          </button>
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
                    <div className="stock-identity-main">
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
                        {marketTypeLabel(result.stock.type) && (
                          <span className="stock-market-type">
                            {marketTypeLabel(result.stock.type)}
                          </span>
                        )}
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
                    {result.dividendYield &&
                      Number.isFinite(result.dividendYield.yieldPct) &&
                      result.dividendYield.yieldPct > 0 && (
                        <section
                          className="section stock-dividend-yield"
                          title={`證交所・最近一年度現金股利／收盤價（${result.dividendYield.date}）`}
                        >
                          <h2>
                            <span className="dot" />
                            殖利率
                          </h2>
                          <span className="stock-dividend-yield-value">
                            {result.dividendYield.yieldPct.toFixed(2)}%
                          </span>
                        </section>
                      )}
                  </div>
                  <div className="stock-head-meta">
                    <div
                      className="stock-pe-valuation"
                      title="目前＝現價÷近四季 EPS；下緣／合理／上緣由使用者自行輸入"
                    >
                      <span className="stock-head-box-title">本益比</span>
                      <div className="stock-pe-field">
                        <span className="stock-pe-field-label">目前</span>
                        <span
                          className={`stock-pe-current${trailingPeTone ? ` ${trailingPeTone}` : ""}`}
                          title="現價 ÷ 近四季 EPS（TTM）"
                        >
                          {trailingPe != null ? trailingPe.toFixed(1) : "—"}
                        </span>
                      </div>
                      <label className="stock-pe-field">
                        <span className="stock-pe-field-label">下緣</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="stock-pe-input"
                          value={peBand.lower}
                          onChange={(e) => updatePeBand("lower", e.target.value)}
                          placeholder="—"
                          aria-label="本益比下緣"
                        />
                      </label>
                      <label className="stock-pe-field">
                        <span className="stock-pe-field-label">合理</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="stock-pe-input"
                          value={peBand.fair}
                          onChange={(e) => updatePeBand("fair", e.target.value)}
                          placeholder="—"
                          aria-label="本益比合理"
                        />
                      </label>
                      <label className="stock-pe-field">
                        <span className="stock-pe-field-label">上緣</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="stock-pe-input"
                          value={peBand.upper}
                          onChange={(e) => updatePeBand("upper", e.target.value)}
                          placeholder="—"
                          aria-label="本益比上緣"
                        />
                      </label>
                    </div>
                    <div
                      className="stock-est-price"
                      title="預估股價 = 預估 EPS × 本益比"
                    >
                      <span className="stock-head-box-title">預估股價</span>
                      <div className="stock-est-price-row stock-est-price-head">
                        <span className="stock-est-price-year" aria-hidden />
                        <span className="stock-est-price-cell">下緣</span>
                        <span className="stock-est-price-cell">合理</span>
                        <span className="stock-est-price-cell">上緣</span>
                      </div>
                      <div className="stock-est-price-row">
                        <span className="stock-est-price-year">今年</span>
                        <span className="stock-est-price-cell num">
                          {formatEstPrice(estEps.thisYear, peBand.lower)}
                        </span>
                        <span className="stock-est-price-cell num">
                          {formatEstPrice(estEps.thisYear, peBand.fair)}
                        </span>
                        <span className="stock-est-price-cell num">
                          {formatEstPrice(estEps.thisYear, peBand.upper)}
                        </span>
                      </div>
                      <div className="stock-est-price-row">
                        <span className="stock-est-price-year">明年</span>
                        <span className="stock-est-price-cell num">
                          {formatEstPrice(estEps.nextYear, peBand.lower)}
                        </span>
                        <span className="stock-est-price-cell num">
                          {formatEstPrice(estEps.nextYear, peBand.fair)}
                        </span>
                        <span className="stock-est-price-cell num">
                          {formatEstPrice(estEps.nextYear, peBand.upper)}
                        </span>
                      </div>
                    </div>
                    <StockPriceTargets
                      section="form"
                      stockId={result.stock.stock_id}
                      latestBar={lastPrice}
                      watchItems={watchItemsForTouches}
                    />
                  </div>
                </div>
              )}
            </div>

            {(wl.ready || result) && (
              <div className="panel-stock-body">
                <aside className="panel-stock-left col-left">
                  {result && (
                    <>
                      <StockMemo
                        stockId={result.stock.stock_id}
                        stockName={result.stock.stock_name}
                      />
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
                      <div className="stock-events-row">
                        <StockInsightsPanel
                          section="events"
                          events={upcomingStockEvents}
                          eventsLoading={false}
                          analysis={null}
                        />
                        <div className="stock-events-row-side">
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

                      <section className="col-right">
                        {addMsg && <div className="toast">{addMsg}</div>}

                        {result.warnings.map((w, i) => (
                          <div className="warn" key={i}>
                            ⚠️ {w}
                          </div>
                        ))}

                        <DisplayBlock
                          stockId={result.stock.stock_id}
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
      </div>

      <div
        role="tabpanel"
        id="main-panel-global"
        aria-labelledby="main-tab-global"
        hidden={activeTab !== "global"}
      >
        <div className="tab-toolbar">
          <button
            type="button"
            className="feature-item"
            onClick={() => setGlobalRefreshNonce((n) => n + 1)}
            disabled={globalRefreshing}
            title="重新抓取所有國際指數資料"
          >
            {globalRefreshing ? "更新中…" : "更新"}
          </button>
          <button
            type="button"
            className="feature-item"
            onClick={() => setGlobalAnalysisOpen(true)}
          >
            數據分析
          </button>
        </div>
        {visitedTabs.has("global") && (
          <GlobalIndexWorkspace
            refreshNonce={globalRefreshNonce}
            onRefreshingChange={setGlobalRefreshing}
          />
        )}
      </div>

      <div
        role="tabpanel"
        id="main-panel-macro"
        aria-labelledby="main-tab-macro"
        hidden={activeTab !== "macro"}
      >
        <div className="tab-toolbar">
          <button
            type="button"
            className="feature-item"
            onClick={() => setMacroRefreshNonce((n) => n + 1)}
            disabled={macroRefreshing}
            title="重新抓取總經資料"
          >
            {macroRefreshing ? "更新中…" : "更新"}
          </button>
          <button
            type="button"
            className="feature-item"
            onClick={() => setMacroAnalysisOpen(true)}
          >
            數據分析
          </button>
        </div>
        {visitedTabs.has("macro") && (
          <MacroWorkspace
            refreshNonce={macroRefreshNonce}
            onRefreshingChange={setMacroRefreshing}
          />
        )}
      </div>

      <div
        role="tabpanel"
        id="main-panel-holdings"
        aria-labelledby="main-tab-holdings"
        hidden={activeTab !== "holdings"}
      >
        <div className="tab-toolbar">
          <button
            type="button"
            className="feature-item"
            onClick={() => setHoldingsRefreshNonce((n) => n + 1)}
            disabled={holdingsRefreshing}
            title="重新抓取庫存股票的目前價格"
          >
            {holdingsRefreshing ? "更新中…" : "更新"}
          </button>
        </div>
        {visitedTabs.has("holdings") && (
          <HoldingsWorkspace
            refreshNonce={holdingsRefreshNonce}
            onRefreshingChange={setHoldingsRefreshing}
          />
        )}
      </div>

      <footer>
        資料來源：FinMind、公開資訊觀測站（MOPS）。本站僅供研究參考，不構成投資建議。
      </footer>

      <DataAnalysisModal
        open={dataAnalysisOpen}
        onClose={() => setDataAnalysisOpen(false)}
      />
      <DataAnalysisModal
        open={globalAnalysisOpen}
        onClose={() => setGlobalAnalysisOpen(false)}
        variant="index"
      />
      <MacroAnalysisModal
        open={macroAnalysisOpen}
        onClose={() => setMacroAnalysisOpen(false)}
      />
      <NewsModal
        open={newsOpen}
        onClose={() => setNewsOpen(false)}
        lists={wl.lists}
      />
      <WatchlistSettings
        open={watchlistOpen}
        onClose={() => setWatchlistOpen(false)}
        wl={wl}
        onPickStock={(id) => search(id)}
      />
      <GoldPickModal
        open={goldPickOpen}
        onClose={() => setGoldPickOpen(false)}
        lists={wl.lists}
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
            是台股查詢與追蹤工具，協助以名稱或代號快速查看個股與大盤資訊，並搭配追蹤列表、預估股價與通知，方便日常觀察。
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
              ：顯示加權指數、融資維持率，以及追蹤列表最近交易日觸及預估股價的彙整。
            </li>
            <li>
              <strong>個股資訊</strong>
              <ul className="about-sublist">
                <li>股價與漲跌</li>
                <li>最近一年度殖利率（證交所）</li>
                <li>融資使用率</li>
                <li>預估 EPS（今年／明年，自行輸入）</li>
                <li>本益比（目前＝現價÷近四季 EPS；下緣／合理／上緣自行輸入）</li>
                <li>預估股價（預估 EPS × 本益比，自動換算今年／明年上緣・合理・下緣）</li>
                <li>
                  MACD 三層分析（戰術／結構／進出場）；進出場標籤為短建議（等金叉、可偏多進場、暫緩；等死叉、可減碼／出場、訊號取消）
                </li>
                <li>大戶籌碼（集保股權分散）</li>
                <li>即將到來的已公告事件</li>
                <li>股東會、法人說明會</li>
                <li>K 線圖（含 5 日／20 日均量）</li>
                <li>近三個月月營收、近四季季報</li>
              </ul>
            </li>
            <li>
              <strong>追蹤列表</strong>
              ：建立多個列表、加入／管理股票，並作為籌碼與觸價通知彙整來源。台股個股「撿黃金」會列出各列表中現價低於今年或明年下緣／合理價的股票與潛在獲利％；低於下緣者只出現在下緣群組。
            </li>
            <li>
              <strong>國際指數</strong>
              ：台灣指數、櫃買指數、費城半導體、那斯達克、KOSPI、美元指數、VIX
              恐慌指數日 K（含 MA5／10／20／60／120／240 與 MACD）；台灣指數與櫃買指數另含
              5 日／20 日均量。
            </li>
            <li>
              <strong>總經</strong>
              ：市場分析依 VIX、公債殖利率與美元指數對應九種共用層狀況；美國
              10 年期與 2 年期公債殖利率走勢（含利差）；台灣／美國製造業
              PMI（50 榮枯線）；HY 高收益債利差；Fed Watch
              顯示目前聯邦基金利率目標區間、有效利率與走勢，並列出接下來兩次
              FOMC 會議日期與台灣時間公布時點，並連結 CME FedWatch。
            </li>
            <li>
              <strong>股票庫存</strong>
              ：先建立帳號，再輸入股票名稱或代號、股數與總成本加入目前帳號。同一帳號同一檔會合併股數與成本；以帳號下拉選單切換，表格、圓餅與總損益一次只顯示該帳號，比例以該帳號市值計。資料僅存在瀏覽器，不會從集保匯入。
            </li>
            <li>
              <strong>數據分析</strong>
              ：台股個股 tab 內說明 MACD 三層分析與均量用法；國際指數 tab
              內說明均量用法；總經 tab 內說明利率、公債殖利率、PMI 與 HY
              利差對股市的影響，並以市場分析對應九種狀況。
            </li>
            <li>
              <strong>通知</strong>
              ：可設定觸價通知（以最新收盤價判定落在今年／明年上緣・合理・下緣的哪一區間）、MACD 條件、行事曆事件等 Email
              通知。被通知者信箱可在「通知」選單內設定；留空則依序使用環境變數{" "}
              <code>NOTIFY_TO</code>、<code>GMAIL_USER</code>
              （寄信帳號仍需自行設定 Gmail 環境變數）。
            </li>
          </ol>

          <h4 className="about-heading">資料來源</h4>
          <p className="modal-text about-sources">
            FinMind、證交所／櫃買相關公開資料、公開資訊觀測站（MOPS）、集保
            TDCC 開放資料、美國財政部公債殖利率、紐約聯準會聯邦基金利率、聯準會
            FOMC 會議行事曆、Yahoo
            Finance（國際指數）、中經院台灣製造業 PMI、ISM 製造業 PMI、FRED
            ICE BofA 高收益債 OAS 等。
          </p>
          <p className="modal-text about-sources">
            圖表由{" "}
            <a
              href="https://www.tradingview.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              TradingView
            </a>{" "}
            Lightweight Charts™ 提供（Copyright © TradingView, Inc.）。
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
