"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type {
  DailyPrice,
  MarginUsagePoint,
  MeetingContent,
} from "@/lib/types";
import {
  getMarginUsageCache,
  mergeMarginUsagePoints,
  saveMarginUsageCache,
} from "@/lib/margin-usage-cache";

const PriceChart = dynamic(() => import("./PriceChart"), {
  ssr: false,
  loading: () => <div className="chart-canvas" />,
});

const MarginUsageChart = dynamic(() => import("./MarginUsageChart"), {
  ssr: false,
  loading: () => <div className="chart-canvas" />,
});

type Tab = "chart" | "margin" | "meeting";
const PREF_KEY = "ff_display_tab";

function isToday(ts: number): boolean {
  if (!ts) return false;
  return (
    new Date(ts).toISOString().slice(0, 10) ===
    new Date().toISOString().slice(0, 10)
  );
}

function formatNewsDate(pubDate: string): string {
  if (!pubDate) return "";
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return pubDate;
  return d.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function DisplayBlock({
  stockId,
  prices,
  meetingContent,
  meetingLoading,
}: {
  stockId: string;
  prices: DailyPrice[];
  meetingContent: MeetingContent | null;
  meetingLoading?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("chart");
  const [marginPoints, setMarginPoints] = useState<MarginUsagePoint[]>([]);
  const [marginLoading, setMarginLoading] = useState(false);
  const [marginError, setMarginError] = useState<string | null>(null);
  const marginReqRef = useRef(0);

  useEffect(() => {
    const saved = window.localStorage.getItem(PREF_KEY);
    if (saved === "meeting" || saved === "text") setTab("meeting");
    else if (saved === "margin") setTab("margin");
    else if (saved === "chart") setTab("chart");
  }, []);

  useEffect(() => {
    if (meetingContent) setTab("meeting");
  }, [meetingContent]);

  const loadMarginUsage = useCallback(async (id: string) => {
    const reqId = ++marginReqRef.current;

    // 1) 先讀本地快取（半年內），立即顯示
    const cached = getMarginUsageCache(id);
    const cachedPoints = cached?.points ?? [];
    setMarginPoints(cachedPoints);
    setMarginError(null);

    // 2) 今日已更新過就不再連線，直接用快取
    if (cached && cachedPoints.length > 0 && isToday(cached.savedAt)) {
      setMarginLoading(false);
      return;
    }

    // 3) 只抓最後一筆之後的增量（無快取才抓整個半年）
    setMarginLoading(cachedPoints.length === 0);
    const lastDate = cachedPoints.length
      ? cachedPoints[cachedPoints.length - 1].date
      : "";
    try {
      const qs = new URLSearchParams({ stockId: id });
      if (lastDate) qs.set("start", lastDate);
      const res = await fetch(`/api/margin-usage-history?${qs.toString()}`);
      const json = await res.json();
      if (reqId !== marginReqRef.current) return; // 已切換股票，丟棄
      if (!res.ok) throw new Error(json?.error || "讀取失敗");
      const incoming: MarginUsagePoint[] = Array.isArray(json.points)
        ? json.points
        : [];
      const merged = mergeMarginUsagePoints(cachedPoints, incoming);
      const saved = saveMarginUsageCache(id, merged);
      setMarginPoints(saved);
    } catch (e) {
      if (reqId !== marginReqRef.current) return;
      if (cachedPoints.length === 0) {
        setMarginError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (reqId === marginReqRef.current) setMarginLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== "margin" || !stockId) return;
    void loadMarginUsage(stockId);
  }, [tab, stockId, loadMarginUsage]);

  function pick(t: Tab) {
    setTab(t);
    window.localStorage.setItem(PREF_KEY, t);
  }

  return (
    <section className="section display-block">
      <div className="display-tabs">
        <button
          className={`seg ${tab === "chart" ? "active" : ""}`}
          onClick={() => pick("chart")}
        >
          K線圖
        </button>
        <button
          className={`seg ${tab === "margin" ? "active" : ""}`}
          onClick={() => pick("margin")}
        >
          融資使用率
        </button>
        <button
          className={`seg ${tab === "meeting" ? "active" : ""}`}
          onClick={() => pick("meeting")}
        >
          相關報導
        </button>
      </div>

      {tab === "chart" ? (
        prices.length > 0 ? (
          <PriceChart data={prices} />
        ) : (
          <p className="empty">查無 K 線資料。</p>
        )
      ) : tab === "margin" ? (
        marginPoints.length > 0 ? (
          <MarginUsageChart data={marginPoints} prices={prices} />
        ) : marginLoading ? (
          <div className="chart-canvas" />
        ) : marginError ? (
          <p className="empty">融資使用率載入失敗：{marginError}</p>
        ) : (
          <p className="empty">查無融資使用率資料。</p>
        )
      ) : meetingContent || meetingLoading ? (
        <div className="meeting-content">
          {meetingContent && (
            <h3 className="meeting-content-title">{meetingContent.title}</h3>
          )}
          {meetingLoading && (
            <p className="empty">正在搜尋相關新聞報導…</p>
          )}
          {meetingContent?.body && (
            <pre className="meeting-content-body">{meetingContent.body}</pre>
          )}
          {meetingContent?.display === "news" && !meetingLoading && (
            <>
              {meetingContent.articles && meetingContent.articles.length > 0 ? (
                <ul className="news-list">
                  {meetingContent.articles.map((a) => (
                    <li className="news-item" key={a.link}>
                      <a
                        className="news-title"
                        href={a.link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {a.title}
                      </a>
                      <div className="news-meta">
                        來源：{a.source}
                        {a.publishedAt && (
                          <> · {formatNewsDate(a.publishedAt)}</>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty">查無相關新聞報導。</p>
              )}
              <p className="news-disclaimer">
                新聞來源：Google 新聞搜尋，僅供參考，請以原始媒體報導為準。
              </p>
            </>
          )}
          {meetingContent && meetingContent.links.length > 0 && (
            <div className="links">
              {meetingContent.links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="display-text empty">
          請點選左側「股東會」或「法人說明會」的「相關報導」，新聞將顯示於此。
        </div>
      )}
    </section>
  );
}
