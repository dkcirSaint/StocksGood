"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  AreaSeries,
  LineSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import type { MarginUsagePoint } from "@/lib/types";

const RATE_COLOR = "#4f8cff";
const RATE_AREA_TOP = "rgba(79,140,255,0.28)";
const RATE_AREA_BOTTOM = "rgba(79,140,255,0.02)";
const PRICE_COLOR = "#ff9f43";

interface PricePoint {
  date: string;
  close: number;
}

function formatRate(n: number): string {
  return `${n.toFixed(2)}%`;
}

function formatPrice(n: number): string {
  return n.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
}

interface Refs {
  rate: ISeriesApi<"Area">;
  price: ISeriesApi<"Line">;
}

interface HoverInfo {
  date: string;
  rate: number | null;
  price: number | null;
}

export default function MarginUsageChart({
  data,
  prices,
}: {
  data: MarginUsagePoint[];
  prices: PricePoint[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<Refs | null>(null);
  const rateByDateRef = useRef<Map<string, number>>(new Map());
  const priceByDateRef = useRef<Map<string, number>>(new Map());
  const [hover, setHover] = useState<HoverInfo | null>(null);

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
      // 右軸：融資使用率(%)
      rightPriceScale: {
        visible: true,
        borderColor: "#243154",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      // 左軸：股價
      leftPriceScale: {
        visible: true,
        borderColor: "#243154",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: { borderColor: "#243154", rightOffset: 4 },
      crosshair: { mode: 0 },
    });

    const rate = chart.addSeries(AreaSeries, {
      lineColor: RATE_COLOR,
      topColor: RATE_AREA_TOP,
      bottomColor: RATE_AREA_BOTTOM,
      lineWidth: 2,
      priceScaleId: "right",
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: "custom", formatter: formatRate, minMove: 0.01 },
    });

    const price = chart.addSeries(LineSeries, {
      color: PRICE_COLOR,
      lineWidth: 2,
      priceScaleId: "left",
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });

    chartRef.current = chart;
    seriesRef.current = { rate, price };

    const onCrosshairMove = (param: MouseEventParams<Time>) => {
      if (param.time == null || param.point == undefined) {
        setHover(null);
        return;
      }
      const date = String(param.time);
      const rateData = param.seriesData.get(rate) as
        | { value: number }
        | undefined;
      const priceData = param.seriesData.get(price) as
        | { value: number }
        | undefined;
      const rateVal = rateData?.value ?? rateByDateRef.current.get(date) ?? null;
      const priceVal =
        priceData?.value ?? priceByDateRef.current.get(date) ?? null;
      if (rateVal == null && priceVal == null) {
        setHover(null);
        return;
      }
      setHover({ date, rate: rateVal, price: priceVal });
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

  // 帶入資料
  useEffect(() => {
    const s = seriesRef.current;
    const chart = chartRef.current;
    if (!s || !chart) return;

    // 股價只取與融資使用率相同的時間範圍（近半年）
    const minDate = data.length > 0 ? data[0].date : "";
    const priceSlice = (minDate
      ? prices.filter((p) => p.date >= minDate)
      : prices
    )
      .filter((p) => Number.isFinite(p.close) && p.close > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    rateByDateRef.current = new Map(data.map((p) => [p.date, p.rate]));
    priceByDateRef.current = new Map(priceSlice.map((p) => [p.date, p.close]));

    s.rate.setData(data.map((p) => ({ time: p.date, value: p.rate })));
    s.price.setData(priceSlice.map((p) => ({ time: p.date, value: p.close })));
    chart.timeScale().fitContent();
  }, [data, prices]);

  const latestRate = data.length > 0 ? data[data.length - 1] : null;
  const latestPrice = (() => {
    for (let i = prices.length - 1; i >= 0; i--) {
      const p = prices[i];
      if (Number.isFinite(p.close) && p.close > 0) return p;
    }
    return null;
  })();

  return (
    <div className="chart-wrap">
      <div className="chart-toolbar">
        <div className="chart-ohlc" aria-live="polite">
          {hover ? (
            <div className="chart-ohlc-row">
              <span className="chart-ohlc-date">{hover.date}</span>
              {hover.rate != null && (
                <span className="chart-ohlc-item">
                  融資使用率{" "}
                  <strong style={{ color: RATE_COLOR }}>
                    {formatRate(hover.rate)}
                  </strong>
                </span>
              )}
              {hover.price != null && (
                <span className="chart-ohlc-item">
                  股價{" "}
                  <strong style={{ color: PRICE_COLOR }}>
                    {formatPrice(hover.price)}
                  </strong>
                </span>
              )}
            </div>
          ) : latestRate ? (
            <div className="chart-ohlc-row">
              <span className="chart-ohlc-date">{latestRate.date}</span>
              <span className="chart-ohlc-item">
                融資使用率{" "}
                <strong style={{ color: RATE_COLOR }}>
                  {formatRate(latestRate.rate)}
                </strong>
              </span>
              {latestPrice && (
                <span className="chart-ohlc-item">
                  股價{" "}
                  <strong style={{ color: PRICE_COLOR }}>
                    {formatPrice(latestPrice.close)}
                  </strong>
                </span>
              )}
            </div>
          ) : (
            <span className="chart-ohlc-hint">
              移動游標查看當日融資使用率與股價
            </span>
          )}
        </div>
      </div>
      <div ref={containerRef} className="chart-canvas" />
      <div className="chart-legend">
        <span className="chart-legend-group">
          <span style={{ color: RATE_COLOR }}>● 融資使用率(%)</span>{" "}
          <span style={{ color: PRICE_COLOR }}>● 股價</span>
          （近半年）
        </span>
      </div>
    </div>
  );
}
