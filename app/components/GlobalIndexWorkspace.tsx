"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { DailyPrice } from "@/lib/types";
import {
  GLOBAL_INDICES,
  type GlobalIndexKey,
} from "@/lib/global-indices";

const PriceChart = dynamic(() => import("./PriceChart"), {
  ssr: false,
  loading: () => <div className="chart-canvas" />,
});

const PREF_KEY = "ff_global_index";

interface IndexPayload {
  key: GlobalIndexKey;
  name: string;
  prices: DailyPrice[];
}

function formatClose(n: number): string {
  return n.toLocaleString("zh-TW", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function lastChange(prices: DailyPrice[]): {
  date: string;
  close: number;
  change: number | null;
  changePct: number | null;
} | null {
  if (prices.length === 0) return null;
  const last = prices[prices.length - 1];
  const prev = prices.length > 1 ? prices[prices.length - 2] : null;
  const change =
    prev && Number.isFinite(prev.close) ? last.close - prev.close : null;
  const changePct =
    change != null && prev && prev.close !== 0
      ? (change / prev.close) * 100
      : null;
  return { date: last.date, close: last.close, change, changePct };
}

async function fetchIndex(
  indexKey: GlobalIndexKey,
  fresh = false
): Promise<IndexPayload> {
  const qs = fresh ? `&refresh=1` : "";
  const res = await fetch(`/api/global-index?key=${indexKey}${qs}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "讀取失敗");
  const prices: DailyPrice[] = Array.isArray(json.prices) ? json.prices : [];
  return {
    key: indexKey,
    name: json.name ?? indexKey,
    prices,
  };
}

export default function GlobalIndexWorkspace({
  refreshNonce = 0,
  onRefreshingChange,
}: {
  refreshNonce?: number;
  onRefreshingChange?: (busy: boolean) => void;
}) {
  const [key, setKey] = useState<GlobalIndexKey>("twii");
  const [cache, setCache] = useState<
    Partial<Record<GlobalIndexKey, IndexPayload>>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(key);
  keyRef.current = key;
  const fetchGenRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshingChangeRef = useRef(onRefreshingChange);
  onRefreshingChangeRef.current = onRefreshingChange;

  useEffect(() => {
    const saved = window.localStorage.getItem(PREF_KEY);
    if (GLOBAL_INDICES.some((d) => d.key === saved)) {
      setKey(saved as GlobalIndexKey);
    }
  }, []);

  useEffect(() => {
    if (refreshNonce === 0) return;
    let cancelled = false;
    const gen = ++fetchGenRef.current;
    refreshingRef.current = true;
    onRefreshingChangeRef.current?.(true);
    setError(null);

    void (async () => {
      const results = await Promise.allSettled(
        GLOBAL_INDICES.map((d) => fetchIndex(d.key, true))
      );
      if (cancelled || gen !== fetchGenRef.current) return;
      const next: Partial<Record<GlobalIndexKey, IndexPayload>> = {};
      const failed: string[] = [];
      results.forEach((r, i) => {
        const def = GLOBAL_INDICES[i];
        if (r.status === "fulfilled") next[def.key] = r.value;
        else failed.push(def.name);
      });
      setCache((prev) => ({ ...prev, ...next }));
      if (failed.length > 0 && !next[keyRef.current]) {
        setError(`${failed.join("、")} 更新失敗`);
      }
      refreshingRef.current = false;
      onRefreshingChangeRef.current?.(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshNonce]);

  useEffect(() => {
    return () => {
      onRefreshingChangeRef.current?.(false);
    };
  }, []);

  useEffect(() => {
    if (cache[key] || refreshingRef.current) {
      setError(null);
      return;
    }
    let cancelled = false;
    const gen = fetchGenRef.current;
    setLoading(true);
    setError(null);
    fetchIndex(key)
      .then((payload) => {
        if (cancelled || gen !== fetchGenRef.current) return;
        setCache((prev) => ({ ...prev, [key]: payload }));
      })
      .catch((e) => {
        if (!cancelled && gen === fetchGenRef.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, cache]);

  function pick(next: GlobalIndexKey) {
    setKey(next);
    window.localStorage.setItem(PREF_KEY, next);
  }

  const current = cache[key];
  const prices = current?.prices ?? [];
  const stats = lastChange(prices);
  const def = GLOBAL_INDICES.find((d) => d.key === key);

  return (
    <section className="section global-index-workspace">
      <div className="display-tabs" role="tablist" aria-label="國際指數">
        {GLOBAL_INDICES.map((d) => (
          <button
            key={d.key}
            type="button"
            role="tab"
            aria-selected={key === d.key}
            className={`seg ${key === d.key ? "active" : ""}`}
            onClick={() => pick(d.key)}
          >
            {d.name}
          </button>
        ))}
      </div>

      {stats && (
        <div className="global-index-head">
          <span className="global-index-name">{def?.name ?? key}</span>
          <span
            className={`global-index-close ${
              stats.change != null
                ? stats.change > 0
                  ? "up"
                  : stats.change < 0
                    ? "down"
                    : ""
                : ""
            }`}
          >
            {formatClose(stats.close)}
            {stats.change != null && (
              <span className="global-index-change">
                {stats.change > 0 ? "▲" : stats.change < 0 ? "▼" : ""}
                {stats.change > 0 ? "+" : ""}
                {stats.change.toFixed(2)}
                {stats.changePct != null &&
                  ` (${stats.changePct > 0 ? "+" : ""}${stats.changePct.toFixed(2)}%)`}
              </span>
            )}
          </span>
          <span className="global-index-date">{stats.date}</span>
        </div>
      )}

      {prices.length > 0 ? (
        <PriceChart
          data={prices}
          volumeUnit={def?.volumeUnit ?? ""}
          showVolumeMa={Boolean(def?.showVolumeMa)}
        />
      ) : loading ? (
        <div className="chart-canvas" />
      ) : error ? (
        <p className="empty">國際指數載入失敗：{error}</p>
      ) : (
        <p className="empty">查無國際指數資料。</p>
      )}
    </section>
  );
}
