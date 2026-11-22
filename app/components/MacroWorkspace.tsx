"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { TreasuryYieldPoint } from "@/lib/treasury-yields";
import type { MacroPoint, MacroSeries } from "@/lib/macro-series";
import type { DailyPrice } from "@/lib/types";
import type { FedFundsPoint, FedFundsQuote } from "@/lib/fed-funds";
import FedWatchPanel from "./FedWatchPanel";
import MarketAnalysisPanel from "./MarketAnalysisPanel";
import type { MacroRange } from "./MacroLineChart";

const TreasuryYieldChart = dynamic(() => import("./TreasuryYieldChart"), {
  ssr: false,
  loading: () => <div className="chart-canvas" />,
});

const MacroLineChart = dynamic(() => import("./MacroLineChart"), {
  ssr: false,
  loading: () => <div className="chart-canvas" />,
});

type MacroTab = "market" | "yields" | "twpmi" | "uspmi" | "hy" | "fedwatch";
const TABS: { id: MacroTab; label: string }[] = [
  { id: "market", label: "市場分析" },
  { id: "yields", label: "美國公債殖利率" },
  { id: "twpmi", label: "台灣 PMI" },
  { id: "uspmi", label: "美國 PMI" },
  { id: "hy", label: "HY 利差" },
  { id: "fedwatch", label: "Fed Watch" },
];
const PREF_KEY = "ff_macro_tab";

const PMI_RANGES: MacroRange[] = [
  { id: "1y", label: "1年", count: 12 },
  { id: "3y", label: "3年", count: 36 },
  { id: "5y", label: "5年", count: 60 },
];
const HY_RANGES: MacroRange[] = [
  { id: "3m", label: "3月", count: 63 },
  { id: "6m", label: "6月", count: 126 },
  { id: "1y", label: "1年", count: 252 },
];
const PMI_COLOR = "#4fd1c5";
const US_PMI_COLOR = "#f6c454";
const HY_COLOR = "#ff5c75";

async function fetchYields(fresh = false): Promise<TreasuryYieldPoint[]> {
  const qs = fresh ? "?refresh=1" : "";
  const res = await fetch(`/api/treasury-yields${qs}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "讀取失敗");
  return Array.isArray(json.points) ? json.points : [];
}

async function fetchMacro(path: string, fresh = false): Promise<MacroSeries> {
  const qs = fresh ? "?refresh=1" : "";
  const res = await fetch(`/api/${path}${qs}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "讀取失敗");
  const points: MacroPoint[] = Array.isArray(json.points) ? json.points : [];
  return { points, source: typeof json.source === "string" ? json.source : "" };
}

async function fetchIndexPrices(
  key: "vix" | "dxy",
  fresh = false
): Promise<DailyPrice[]> {
  const qs = fresh ? "&refresh=1" : "";
  const res = await fetch(`/api/global-index?key=${key}${qs}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "讀取失敗");
  return Array.isArray(json.prices) ? json.prices : [];
}

async function fetchFedFunds(fresh = false): Promise<FedFundsQuote> {
  const qs = fresh ? "?refresh=1" : "";
  const res = await fetch(`/api/fed-funds${qs}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "讀取失敗");
  const targetFrom = Number(json?.targetFrom);
  const targetTo = Number(json?.targetTo);
  const date = typeof json?.date === "string" ? json.date : "";
  if (!date || !Number.isFinite(targetFrom) || !Number.isFinite(targetTo)) {
    throw new Error("利率資料格式錯誤");
  }
  const effective = Number(json?.effective);
  const points: FedFundsPoint[] = Array.isArray(json?.points)
    ? json.points
        .map((p: { date?: string; targetFrom?: number; targetTo?: number; effective?: number | null }) => {
          const d = typeof p?.date === "string" ? p.date : "";
          const from = Number(p?.targetFrom);
          const to = Number(p?.targetTo);
          if (!d || !Number.isFinite(from) || !Number.isFinite(to)) return null;
          const eff = Number(p?.effective);
          return {
            date: d,
            targetFrom: from,
            targetTo: to,
            effective: Number.isFinite(eff) ? eff : null,
          } satisfies FedFundsPoint;
        })
        .filter((p): p is FedFundsPoint => p != null)
    : [];
  return {
    date,
    targetFrom,
    targetTo,
    effective: Number.isFinite(effective) ? effective : null,
    source: typeof json?.source === "string" ? json.source : "",
    points,
  };
}

function formatPmi(n: number): string {
  return n.toFixed(1);
}

function formatHy(n: number): string {
  return `${n.toFixed(2)}%`;
}

export default function MacroWorkspace({
  refreshNonce = 0,
  onRefreshingChange,
}: {
  refreshNonce?: number;
  onRefreshingChange?: (busy: boolean) => void;
}) {
  const [tab, setTab] = useState<MacroTab>("market");
  const [yields, setYields] = useState<TreasuryYieldPoint[]>([]);
  const [vix, setVix] = useState<DailyPrice[]>([]);
  const [dxy, setDxy] = useState<DailyPrice[]>([]);
  const [twpmi, setTwpmi] = useState<MacroSeries | null>(null);
  const [uspmi, setUspmi] = useState<MacroSeries | null>(null);
  const [hy, setHy] = useState<MacroSeries | null>(null);
  const [fedFunds, setFedFunds] = useState<FedFundsQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const fetchGenRef = useRef(0);
  const refreshingRef = useRef(false);
  const loadedRef = useRef({
    yields: false,
    twpmi: false,
    uspmi: false,
    hy: false,
    vix: false,
    dxy: false,
    fedFunds: false,
  });
  const onRefreshingChangeRef = useRef(onRefreshingChange);
  onRefreshingChangeRef.current = onRefreshingChange;

  useEffect(() => {
    const saved = window.localStorage.getItem(PREF_KEY);
    if (TABS.some((t) => t.id === saved)) setTab(saved as MacroTab);
  }, []);

  useEffect(() => {
    if (refreshNonce === 0) return;
    let cancelled = false;
    const gen = ++fetchGenRef.current;
    refreshingRef.current = true;
    onRefreshingChangeRef.current?.(true);
    setError(null);
    setNowMs(Date.now());

    void (async () => {
      const results = await Promise.allSettled([
        fetchYields(true),
        fetchMacro("taiwan-pmi", true),
        fetchMacro("us-pmi", true),
        fetchMacro("hy-spread", true),
        fetchIndexPrices("vix", true),
        fetchIndexPrices("dxy", true),
        fetchFedFunds(true),
      ]);
      if (cancelled || gen !== fetchGenRef.current) return;
      const failed: string[] = [];
      if (results[0].status === "fulfilled") {
        setYields(results[0].value);
        loadedRef.current.yields = true;
      } else failed.push("美國公債殖利率");
      if (results[1].status === "fulfilled") {
        setTwpmi(results[1].value);
        loadedRef.current.twpmi = true;
      } else failed.push("台灣 PMI");
      if (results[2].status === "fulfilled") {
        setUspmi(results[2].value);
        loadedRef.current.uspmi = true;
      } else failed.push("美國 PMI");
      if (results[3].status === "fulfilled") {
        setHy(results[3].value);
        loadedRef.current.hy = true;
      } else failed.push("HY 利差");
      if (results[4].status === "fulfilled") {
        setVix(results[4].value);
        loadedRef.current.vix = true;
      } else failed.push("VIX");
      if (results[5].status === "fulfilled") {
        setDxy(results[5].value);
        loadedRef.current.dxy = true;
      } else failed.push("美元指數");
      if (results[6].status === "fulfilled") {
        setFedFunds(results[6].value);
        loadedRef.current.fedFunds = true;
      } else failed.push("聯邦基金利率");

      const t = tabRef.current;
      const currentFailed =
        ((t === "yields" || t === "market") && results[0].status === "rejected") ||
        (t === "twpmi" && results[1].status === "rejected") ||
        (t === "uspmi" && results[2].status === "rejected") ||
        (t === "hy" && results[3].status === "rejected") ||
        (t === "market" &&
          (results[4].status === "rejected" || results[5].status === "rejected")) ||
        (t === "fedwatch" && results[6].status === "rejected");
      if (currentFailed && failed.length > 0) {
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
    if (refreshingRef.current) return;
    let cancelled = false;
    const gen = fetchGenRef.current;
    setError(null);

    void (async () => {
      try {
        if (tab === "fedwatch") {
          if (loadedRef.current.fedFunds) return;
          setLoading(true);
          const next = await fetchFedFunds();
          if (cancelled || gen !== fetchGenRef.current) return;
          setFedFunds(next);
          loadedRef.current.fedFunds = true;
        } else if (tab === "market") {
          const needY = !loadedRef.current.yields;
          const needV = !loadedRef.current.vix;
          const needD = !loadedRef.current.dxy;
          const needTw = !loadedRef.current.twpmi;
          const needUs = !loadedRef.current.uspmi;
          if (!needY && !needV && !needD && !needTw && !needUs) return;
          setLoading(true);
          const [y, v, d, tw, us] = await Promise.all([
            needY ? fetchYields() : Promise.resolve(null),
            needV ? fetchIndexPrices("vix") : Promise.resolve(null),
            needD ? fetchIndexPrices("dxy") : Promise.resolve(null),
            needTw
              ? fetchMacro("taiwan-pmi").catch(() => null)
              : Promise.resolve(undefined),
            needUs
              ? fetchMacro("us-pmi").catch(() => null)
              : Promise.resolve(undefined),
          ]);
          if (cancelled || gen !== fetchGenRef.current) return;
          if (y) {
            setYields(y);
            loadedRef.current.yields = true;
          }
          if (v) {
            setVix(v);
            loadedRef.current.vix = true;
          }
          if (d) {
            setDxy(d);
            loadedRef.current.dxy = true;
          }
          if (tw) {
            setTwpmi(tw);
            loadedRef.current.twpmi = true;
          }
          if (us) {
            setUspmi(us);
            loadedRef.current.uspmi = true;
          }
        } else if (tab === "yields") {
          if (loadedRef.current.yields) return;
          setLoading(true);
          const next = await fetchYields();
          if (cancelled || gen !== fetchGenRef.current) return;
          setYields(next);
          loadedRef.current.yields = true;
        } else {
          const key = tab === "twpmi" ? "twpmi" : tab === "uspmi" ? "uspmi" : "hy";
          if (loadedRef.current[key]) return;
          setLoading(true);
          const path =
            tab === "twpmi" ? "taiwan-pmi" : tab === "uspmi" ? "us-pmi" : "hy-spread";
          const next = await fetchMacro(path);
          if (cancelled || gen !== fetchGenRef.current) return;
          if (tab === "twpmi") setTwpmi(next);
          else if (tab === "uspmi") setUspmi(next);
          else setHy(next);
          loadedRef.current[key] = true;
        }
      } catch (e) {
        if (!cancelled && gen === fetchGenRef.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tab]);

  function pick(t: MacroTab) {
    setTab(t);
    setError(null);
    window.localStorage.setItem(PREF_KEY, t);
  }

  const series =
    tab === "twpmi" ? twpmi : tab === "uspmi" ? uspmi : tab === "hy" ? hy : null;
  const tabLoaded =
    tab === "market"
      ? loadedRef.current.yields && loadedRef.current.vix && loadedRef.current.dxy
      : tab === "yields"
        ? loadedRef.current.yields
        : tab === "twpmi"
          ? loadedRef.current.twpmi
          : tab === "uspmi"
            ? loadedRef.current.uspmi
            : tab === "hy"
              ? loadedRef.current.hy
              : true;
  const emptyLabel =
    tab === "yields"
      ? "美國公債殖利率"
      : TABS.find((t) => t.id === tab)?.label ?? "資料";
  const marketReady = yields.length > 1 && vix.length > 1 && dxy.length > 1;

  return (
    <section className="section macro-workspace">
      <div className="display-tabs" role="tablist" aria-label="總經分類">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`seg ${tab === t.id ? "active" : ""}`}
            onClick={() => pick(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "fedwatch" ? (
        <FedWatchPanel
          nowMs={nowMs}
          quote={fedFunds}
          quoteLoading={!fedFunds && !error}
          quoteError={error}
        />
      ) : tab === "market" ? (
        marketReady ? (
          <MarketAnalysisPanel
            yields={yields}
            vix={vix}
            dxy={dxy}
            twPmi={twpmi?.points ?? null}
            usPmi={uspmi?.points ?? null}
            nowMs={nowMs}
          />
        ) : loading || (!error && !tabLoaded) ? (
          <div className="chart-canvas" />
        ) : error ? (
          <p className="empty">市場分析載入失敗：{error}</p>
        ) : (
          <p className="empty">市場分析需要公債、VIX 與美元指數資料。</p>
        )
      ) : tab === "yields" ? (
        yields.length > 0 ? (
          <TreasuryYieldChart data={yields} />
        ) : loading || (!error && !tabLoaded) ? (
          <div className="chart-canvas" />
        ) : error ? (
          <p className="empty">美國公債殖利率載入失敗：{error}</p>
        ) : (
          <p className="empty">查無美國公債殖利率資料。</p>
        )
      ) : series && series.points.length > 0 ? (
        tab === "hy" ? (
          <MacroLineChart
            data={series.points}
            color={HY_COLOR}
            ranges={HY_RANGES}
            formatValue={formatHy}
            hint="移動游標查看當日 HY 利差"
            legend={`${series.source}。利差走闊＝信用風險溢價上升；走窄＝風險偏好回升。`}
          />
        ) : (
          <MacroLineChart
            data={series.points}
            color={tab === "twpmi" ? PMI_COLOR : US_PMI_COLOR}
            ranges={PMI_RANGES}
            formatValue={formatPmi}
            hint="移動游標查看當月 PMI"
            legend={`${series.source}。50 為榮枯線：以上擴張、以下收縮。`}
            reference={{ value: 50, label: "50" }}
            threshold={{ value: 50, above: "擴張", below: "收縮" }}
          />
        )
      ) : loading || (!error && !tabLoaded) ? (
        <div className="chart-canvas" />
      ) : error ? (
        <p className="empty">{emptyLabel}載入失敗：{error}</p>
      ) : (
        <p className="empty">查無{emptyLabel}資料。</p>
      )}
    </section>
  );
}
