"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  LineSeries,
  LineType,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import type { FedFundsPoint } from "@/lib/fed-funds";

type Range = "3m" | "6m" | "1y";
const RANGE_DAYS: Record<Range, number> = { "3m": 63, "6m": 126, "1y": 252 };
const RANGE_LABEL: Record<Range, string> = {
  "3m": "3月",
  "6m": "6月",
  "1y": "1年",
};

const EFF_COLOR = "#4fd1c5";
const LO_COLOR = "#7b8cb0";
const HI_COLOR = "#c9d4ea";

function formatRate(n: number): string {
  return `${n.toFixed(2)}%`;
}

interface Refs {
  effective: ISeriesApi<"Line">;
  targetFrom: ISeriesApi<"Line">;
  targetTo: ISeriesApi<"Line">;
}

export default function FedFundsChart({
  data,
  source,
}: {
  data: FedFundsPoint[];
  source?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<Refs | null>(null);
  const byDateRef = useRef<Map<string, FedFundsPoint>>(new Map());
  const [range, setRange] = useState<Range>("1y");
  const [hover, setHover] = useState<FedFundsPoint | null>(null);

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

    const rateFormat = {
      type: "custom" as const,
      formatter: formatRate,
      minMove: 0.01,
    };
    const targetTo = chart.addSeries(LineSeries, {
      color: HI_COLOR,
      lineWidth: 1,
      lineType: LineType.WithSteps,
      priceLineVisible: false,
      priceFormat: rateFormat,
    });
    const targetFrom = chart.addSeries(LineSeries, {
      color: LO_COLOR,
      lineWidth: 1,
      lineType: LineType.WithSteps,
      priceLineVisible: false,
      priceFormat: rateFormat,
    });
    const effective = chart.addSeries(LineSeries, {
      color: EFF_COLOR,
      lineWidth: 2,
      priceLineVisible: false,
      priceFormat: rateFormat,
    });

    chartRef.current = chart;
    seriesRef.current = { effective, targetFrom, targetTo };

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
  }, []);

  useEffect(() => {
    const s = seriesRef.current;
    const chart = chartRef.current;
    if (!s || !chart || data.length === 0) return;

    const slice = data.slice(Math.max(0, data.length - RANGE_DAYS[range]));
    byDateRef.current = new Map(slice.map((p) => [p.date, p]));
    s.targetFrom.setData(slice.map((p) => ({ time: p.date, value: p.targetFrom })));
    s.targetTo.setData(slice.map((p) => ({ time: p.date, value: p.targetTo })));
    s.effective.setData(
      slice
        .filter((p) => p.effective != null)
        .map((p) => ({ time: p.date, value: p.effective as number }))
    );
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
                目標{" "}
                <strong style={{ color: LO_COLOR }}>
                  {formatRate(shown.targetFrom)}
                </strong>
                –
                <strong style={{ color: HI_COLOR }}>
                  {formatRate(shown.targetTo)}
                </strong>
              </span>
              {shown.effective != null ? (
                <span className="chart-ohlc-item">
                  有效{" "}
                  <strong style={{ color: EFF_COLOR }}>
                    {formatRate(shown.effective)}
                  </strong>
                </span>
              ) : null}
            </div>
          ) : (
            <span className="chart-ohlc-hint">移動游標查看當日利率</span>
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
          <span style={{ color: EFF_COLOR }}>● 有效聯邦基金利率</span>{" "}
          <span style={{ color: LO_COLOR }}>● 目標下緣</span>{" "}
          <span style={{ color: HI_COLOR }}>● 目標上緣</span>
        </span>
        <span className="chart-legend-group">
          目標區間僅在 FOMC 決議後變動。
          {source ? ` 資料來源：${source}。` : ""}
        </span>
      </div>
    </div>
  );
}
