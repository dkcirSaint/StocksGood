"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { DailyPrice, MeetingContent } from "@/lib/types";

const PriceChart = dynamic(() => import("./PriceChart"), {
  ssr: false,
  loading: () => <div className="chart-canvas" />,
});

type Tab = "chart" | "meeting";
const PREF_KEY = "ff_display_tab";

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
  prices,
  meetingContent,
  meetingLoading,
}: {
  prices: DailyPrice[];
  meetingContent: MeetingContent | null;
  meetingLoading?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("chart");

  useEffect(() => {
    const saved = window.localStorage.getItem(PREF_KEY);
    if (saved === "meeting" || saved === "text") setTab("meeting");
    else if (saved === "chart") setTab("chart");
  }, []);

  useEffect(() => {
    if (meetingContent) setTab("meeting");
  }, [meetingContent]);

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
