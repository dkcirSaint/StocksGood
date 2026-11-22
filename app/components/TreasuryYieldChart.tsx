"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  LineSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import type { TreasuryYieldPoint } from "@/lib/treasury-yields";

type Range = "3m" | "6m" | "1y";
const RANGE_DAYS: Record<Range, number> = { "3m": 63, "6m": 126, "1y": 252 };
const RANGE_LABEL: Record<Range, string> = {
  "3m": "3月",
  "6m": "6月",
  "1y": "1年",
};

const Y10_COLOR = "#4f8cff";
const Y2_COLOR = "#ff9f43";

function formatYield(n: number): string {
  return `${n.toFixed(2)}%`;
}

/** 10Y−2Y 利差，以基點（bp）呈現；負值即殖利率曲線倒掛 */
function formatSpreadBp(p: TreasuryYieldPoint): string {
  const bp = Math.round((p.y10 - p.y2) * 100);
  return `${bp > 0 ? "+" : ""}${bp} bp`;
}

interface Refs {
  y10: ISeriesApi<"Line">;
  y2: ISeriesApi<"Line">;
}

export default function TreasuryYieldChart({
  data,
}: {
  data: TreasuryYieldPoint[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<Refs | null>(null);
  const byDateRef = useRef<Map<string, TreasuryYieldPoint>>(new Map());
  const [range, setRange] = useState<Range>("1y");
  const [hover, setHover] = useState<TreasuryYieldPoint | null>(null);

  // 建立圖表（僅一次）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height: 460,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9aa7c2",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(36,49,84,0.35)" },
        horzLines: { color: "rgba(36,49,84,0.35)" },
      },
      rightPriceScale: {
        borderColor: "#243154",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: { borderColor: "#243154", rightOffset: 4 },
      crosshair: { mode: 0 },
    });

    const lineOptions = {
      lineWidth: 2 as const,
      priceLineVisible: false,
      priceFormat: { type: "custom" as const, formatter: formatYield, minMove: 0.01 },
    };
    const y10 = chart.addSeries(LineSeries, { ...lineOptions, color: Y10_COLOR });
    const y2 = chart.addSeries(LineSeries, { ...lineOptions, color: Y2_COLOR });

    chartRef.current = chart;
    seriesRef.current = { y10, y2 };

    const onCrosshairMove = (param: MouseEventParams<Time>) => {
      if (param.time == null || param.point == undefined) {
        setHover(null);
        return;
      }
      setHover(byDateRef.current.get(String(param.time)) ?? null);
    };
    chart.subscribeCrosshairMove(onCrosshairMove);

    // 在隱藏的 tab 內建立時寬度為 0，顯示後需重新 fit，否則走勢會擠在右側
    let lastWidth = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      if (width === 0) return;
      chart.applyOptions({ width });
      if (lastWidth === 0 && width > 0) chart.timeScale().fitContent();
      lastWidth = width;
    });
    ro.observe(el);

    return () => {
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // 帶入資料（data 或 range 改變時）
  useEffect(() => {
    const s = seriesRef.current;
    const chart = chartRef.current;
    if (!s || !chart || data.length === 0) return;

    const slice = data.slice(Math.max(0, data.length - RANGE_DAYS[range]));
    byDateRef.current = new Map(slice.map((p) => [p.date, p]));
    s.y10.setData(slice.map((p) => ({ time: p.date, value: p.y10 })));
    s.y2.setData(slice.map((p) => ({ time: p.date, value: p.y2 })));
    chart.timeScale().fitContent();
  }, [data, range]);

  const shown = hover ?? (data.length > 0 ? data[data.length - 1] : null);

  return (
    <div className="chart-wrap">
      <div className="chart-toolbar">
        <div className="chart-ohlc" aria-live="polite">
          {shown ? (
            <div className="chart-ohlc-row">
              <span className="chart-ohlc-date">{shown.date}</span>
              <span className="chart-ohlc-item">
                10年期{" "}
                <strong style={{ color: Y10_COLOR }}>{formatYield(shown.y10)}</strong>
              </span>
              <span className="chart-ohlc-item">
                2年期{" "}
                <strong style={{ color: Y2_COLOR }}>{formatYield(shown.y2)}</strong>
              </span>
              <span className="chart-ohlc-sep" aria-hidden>
                |
              </span>
              <span className="chart-ohlc-item">
                利差 <strong>{formatSpreadBp(shown)}</strong>
              </span>
            </div>
          ) : (
            <span className="chart-ohlc-hint">移動游標查看當日殖利率</span>
          )}
        </div>
        <div className="chart-range">
          {(["3m", "6m", "1y"] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              className={`seg ${range === r ? "active" : ""}`}
              onClick={() => setRange(r)}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="chart-canvas" />
      <div className="chart-legend">
        <span className="chart-legend-group">
          <span style={{ color: Y10_COLOR }}>● 美國 10 年期公債殖利率</span>{" "}
          <span style={{ color: Y2_COLOR }}>● 美國 2 年期公債殖利率</span>
        </span>
        <span className="chart-legend-group">
          利差 = 10年期 − 2年期，負值表示殖利率曲線倒掛。資料來源：美國財政部（每日收盤值）。
        </span>
      </div>
    </div>
  );
}
