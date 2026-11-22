"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  LineSeries,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import type { MacroPoint } from "@/lib/macro-series";

export interface MacroRange {
  id: string;
  label: string;
  /** 從尾端取幾個點；null 表示全部 */
  count: number | null;
}

export default function MacroLineChart({
  data,
  color,
  ranges,
  formatValue,
  hint,
  legend,
  reference,
  threshold,
}: {
  data: MacroPoint[];
  color: string;
  ranges: MacroRange[];
  formatValue: (n: number) => string;
  hint: string;
  legend: string;
  reference?: { value: number; label: string };
  threshold?: { value: number; above: string; below: string };
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const byDateRef = useRef<Map<string, MacroPoint>>(new Map());
  const [range, setRange] = useState(ranges[ranges.length - 1]?.id ?? "");
  const [hover, setHover] = useState<MacroPoint | null>(null);

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

    const series = chart.addSeries(LineSeries, {
      color,
      lineWidth: 2,
      priceLineVisible: false,
      priceFormat: {
        type: "custom",
        formatter: formatValue,
        minMove: 0.01,
      },
    });
    if (reference) {
      series.createPriceLine({
        price: reference.value,
        color: "rgba(154,167,194,0.55)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: reference.label,
      });
    }

    chartRef.current = chart;
    seriesRef.current = series;

    const onCrosshairMove = (param: MouseEventParams<Time>) => {
      if (param.time == null || param.point == undefined) {
        setHover(null);
        return;
      }
      setHover(byDateRef.current.get(String(param.time)) ?? null);
    };
    chart.subscribeCrosshairMove(onCrosshairMove);

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
    // formatValue / reference 僅在掛載時使用
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);

  useEffect(() => {
    const s = seriesRef.current;
    const chart = chartRef.current;
    if (!s || !chart || data.length === 0) return;
    const def = ranges.find((r) => r.id === range) ?? ranges[ranges.length - 1];
    const slice =
      def?.count == null ? data : data.slice(Math.max(0, data.length - def.count));
    byDateRef.current = new Map(slice.map((p) => [p.date, p]));
    s.setData(slice.map((p) => ({ time: p.date as Time, value: p.value })));
    chart.timeScale().fitContent();
  }, [data, range, ranges]);

  const shown = hover ?? (data.length > 0 ? data[data.length - 1] : null);
  const prev =
    shown && data.length > 1
      ? data[Math.max(0, data.findIndex((p) => p.date === shown.date) - 1)]
      : null;
  const delta =
    shown && prev && prev.date !== shown.date ? shown.value - prev.value : null;

  return (
    <div className="chart-wrap">
      <div className="chart-toolbar">
        <div className="chart-ohlc" aria-live="polite">
          {shown ? (
            <div className="chart-ohlc-row">
              <span className="chart-ohlc-date">{shown.date}</span>
              <span className="chart-ohlc-item">
                <strong style={{ color }}>{formatValue(shown.value)}</strong>
              </span>
              {delta != null ? (
                <span className="chart-ohlc-item">
                  較前期{" "}
                  <strong>
                    {delta > 0 ? "+" : ""}
                    {delta.toFixed(2)}
                  </strong>
                </span>
              ) : null}
              {threshold ? (
                <span className="chart-ohlc-item">
                  {shown.value >= threshold.value
                    ? threshold.above
                    : threshold.below}
                </span>
              ) : null}
            </div>
          ) : (
            <span className="chart-ohlc-hint">{hint}</span>
          )}
        </div>
        <div className="chart-range">
          {ranges.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`seg ${range === r.id ? "active" : ""}`}
              onClick={() => setRange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="chart-canvas" />
      <div className="chart-legend">
        <span className="chart-legend-group">{legend}</span>
      </div>
    </div>
  );
}
