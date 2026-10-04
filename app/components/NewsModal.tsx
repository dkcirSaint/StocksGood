"use client";

import { useCallback, useEffect, useState } from "react";
import type { Watchlist } from "@/lib/watchlists";
import type { NewsArticle } from "@/lib/types";
import Modal from "./Modal";

/** 取新聞的追蹤列表分類名稱 */
export const HOLDINGS_LIST_NAME = "持股";

const CACHE_KEY = "ff_stock_news";
/** 快取多久內視為新鮮，超過則重抓（近 24 小時是滾動區間，不宜整天不更新） */
const CACHE_TTL_MS = 30 * 60 * 1000;

interface NewsGroup {
  stockId: string;
  stockName: string;
  articles: NewsArticle[];
  error?: string;
}

interface CachedNews {
  fetchedAt: string;
  /** 當時查詢的股票代號，清單變動時需重抓 */
  stockIds: string[];
  groups: NewsGroup[];
}

function readCache(): CachedNews | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedNews;
    if (!parsed?.fetchedAt || !Array.isArray(parsed.groups)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(data: CachedNews) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    /* 容量不足時忽略 */
  }
}

function formatTaipei(iso: string, withDate: boolean): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    ...(withDate ? { month: "2-digit" as const, day: "2-digit" as const } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ts));
}

export default function NewsModal({
  open,
  onClose,
  lists,
}: {
  open: boolean;
  onClose: () => void;
  lists: Watchlist[];
}) {
  const [groups, setGroups] = useState<NewsGroup[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const holdings = lists.find((l) => l.name === HOLDINGS_LIST_NAME) ?? null;
  const items = holdings?.items ?? [];
  const stockIds = items.map((it) => it.stockId);
  const idsKey = stockIds.join(",");

  const load = useCallback(
    async (opts?: { force?: boolean }) => {
      if (stockIds.length === 0) {
        setGroups([]);
        return;
      }

      if (!opts?.force) {
        const cached = readCache();
        const age = cached ? Date.now() - Date.parse(cached.fetchedAt) : NaN;
        if (
          cached &&
          cached.stockIds.join(",") === idsKey &&
          Number.isFinite(age) &&
          age >= 0 &&
          age < CACHE_TTL_MS
        ) {
          setGroups(cached.groups);
          setFetchedAt(cached.fetchedAt);
          return;
        }
      }

      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          ids: idsKey,
          names: items.map((it) => `${it.stockId}:${it.stockName}`).join(","),
        });
        const res = await fetch(`/api/recent-news?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "新聞載入失敗");
        const nextGroups: NewsGroup[] = data.groups ?? [];
        const stamp = data.fetchedAt ?? new Date().toISOString();
        setGroups(nextGroups);
        setFetchedAt(stamp);
        writeCache({ fetchedAt: stamp, stockIds, groups: nextGroups });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    // items 由 idsKey 決定內容，避免每次 render 產生新陣列造成重抓
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey]
  );

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const totalCount = groups.reduce((n, g) => n + g.articles.length, 0);
  const updatedLabel = fetchedAt ? formatTaipei(fetchedAt, false) : "";

  return (
    <Modal open={open} title="新聞" onClose={onClose}>
      {!holdings ? (
        <p className="news-empty">
          找不到名為「{HOLDINGS_LIST_NAME}」的追蹤列表。請先在「追蹤列表」建立
          「{HOLDINGS_LIST_NAME}」分類並加入股票。
        </p>
      ) : items.length === 0 ? (
        <p className="news-empty">
          「{HOLDINGS_LIST_NAME}」列表內尚無股票。
        </p>
      ) : (
        <>
          <div className="news-head">
            <span className="news-sub">
              近 24 小時 · {HOLDINGS_LIST_NAME} {items.length} 檔 · 共{" "}
              {totalCount} 則（每檔最多 3 則）
              {updatedLabel ? ` · 更新於 ${updatedLabel}` : ""}
            </span>
            <button
              type="button"
              className="btn news-refresh"
              onClick={() => void load({ force: true })}
              disabled={loading}
            >
              {loading ? "更新中…" : "重新整理"}
            </button>
          </div>

          {error && <p className="news-error">{error}</p>}

          {loading && groups.length === 0 ? (
            <p className="news-empty">載入新聞中…</p>
          ) : (
            <ul className="news-list">
              {groups.map((g) => (
                <li key={g.stockId} className="news-stock">
                  <div className="news-stock-head">
                    <span className="news-stock-name">{g.stockName}</span>
                    <span className="news-stock-code">{g.stockId}</span>
                  </div>
                  {g.articles.length > 0 ? (
                    <ul className="news-links">
                      {g.articles.map((a) => (
                        <li key={a.link}>
                          <a
                            href={a.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="news-link"
                          >
                            {a.title}
                          </a>
                          <span className="news-meta">
                            {a.source}
                            {formatTaipei(a.publishedAt, true)
                              ? ` · ${formatTaipei(a.publishedAt, true)}`
                              : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="news-none">
                      {g.error
                        ? `載入失敗：${g.error}`
                        : "近 24 小時無相關新聞"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}
