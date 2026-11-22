"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import type { DailyPrice } from "@/lib/types";
import { computeMacd, computeSma, MA_COLORS, MA_PERIODS, type MaPeriod } from "@/lib/indicators";

type Range = "3m" | "6m" | "1y";
const RANGE_DAYS: Record<Range, number> = { "3m": 63, "6m": 126, "1y": 252 };
const RANGE_LABEL: Record<Range, string> = {
  "3m": "3月",
  "6m": "6月",
  "1y": "1年",
};

// 台股慣例：紅漲綠跌
const UP = "#ff5c75";
const DOWN = "#2ecc8f";
const DIF_COLOR = "#f6c454";
const DEA_COLOR = "#4f8cff";
const VOL_MA5_COLOR = "#c0c8d8";
const VOL_MA20_COLOR = "#7dd3fc";

interface Refs {
  candle: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  volMa5: ISeriesApi<"Line">;
  volMa20: ISeriesApi<"Line">;
  ma: Record<MaPeriod, ISeriesApi<"Line">>;
  macdHist: ISeriesApi<"Histogram">;
  dif: ISeriesApi<"Line">;
  dea: ISeriesApi<"Line">;
}

interface HoverBarInfo {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  volMa5: number | null;
  volMa20: number | null;
  dif: number;
  dea: number;
  hist: number;
}

interface MacdByDate {
  dif: number;
  dea: number;
  hist: number;
}

function formatPrice(n: number): string {
  return n.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
}

function formatVolume(n: number, unit: string): string {
  return `${n.toLocaleString("zh-TW")}${unit ? ` ${unit}` : ""}`;
}

function formatMacd(n: number): string {
  return n.toFixed(4);
}

export default function PriceChart({
  data,
  volumeUnit = "股",
  showVolumeMa = false,
}: {
  data: DailyPrice[];
  /** 成交量單位；指數可傳空字串 */
  volumeUnit?: string;
  /** 在量能軸上疊 5 日／20 日均量（台股個股、加權、櫃買） */
  showVolumeMa?: boolean;
}) {
  // 部分指數（如費城半導體、美元指數）無成交量資料
  const hasVolume = data.some((d) => d.volume > 0);
  const showVolMa = showVolumeMa && hasVolume;
  const hasVolumeRef = useRef(hasVolume);
  hasVolumeRef.current = hasVolume;
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<Refs | null>(null);
  const priceByDateRef = useRef<Map<string, DailyPrice>>(new Map());
  const macdByDateRef = useRef<Map<string, MacdByDate>>(new Map());
  const [range, setRange] = useState<Range>("6m");
  const [hoverBar, setHoverBar] = useState<HoverBarInfo | null>(null);

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
        scaleMargins: { top: 0.08, bottom: 0.24 },
      },
      timeScale: { borderColor: "#243154", rightOffset: 4 },
      crosshair: { mode: 0 },
    });

    const candle = chart.addSeries(
      CandlestickSeries,
      {
        upColor: UP,
        downColor: DOWN,
        borderUpColor: UP,
        borderDownColor: DOWN,
        wickUpColor: UP,
        wickDownColor: DOWN,
      },
      0
    );

    const volume = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: "volume" }, priceScaleId: "" },
      0
    );
    volume.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    const volMaOptions = {
      lineWidth: 1 as const,
      priceScaleId: "",
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: { type: "volume" as const },
    };
    const volMa5 = chart.addSeries(
      LineSeries,
      { ...volMaOptions, color: VOL_MA5_COLOR },
      0
    );
    const volMa20 = chart.addSeries(
      LineSeries,
      { ...volMaOptions, color: VOL_MA20_COLOR },
      0
    );

    const ma = {} as Record<MaPeriod, ISeriesApi<"Line">>;
    for (const period of MA_PERIODS) {
      ma[period] = chart.addSeries(
        LineSeries,
        {
          color: MA_COLORS[period],
          lineWidth: period >= 60 ? 2 : 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        0
      );
    }

    const macdHist = chart.addSeries(HistogramSeries, {}, 1);
    const dif = chart.addSeries(
      LineSeries,
      { color: DIF_COLOR, lineWidth: 1, priceLineVisible: false },
      1
    );
    const dea = chart.addSeries(
      LineSeries,
      { color: DEA_COLOR, lineWidth: 1, priceLineVisible: false },
      1
    );

    try {
      const panes = chart.panes();
      panes[0]?.setStretchFactor(3);
      panes[1]?.setStretchFactor(1);
    } catch {
      /* 舊版無 panes API 時忽略 */
    }

    chartRef.current = chart;
    seriesRef.current = { candle, volume, volMa5, volMa20, ma, macdHist, dif, dea };

    const onCrosshairMove = (param: MouseEventParams<Time>) => {
      if (param.time == null || param.point == undefined) {
        setHoverBar(null);
        return;
      }
      const candleData = param.seriesData.get(candle) as CandlestickData | undefined;
      const volumeData = param.seriesData.get(volume) as { value: number } | undefined;
      const difData = param.seriesData.get(dif) as { value: number } | undefined;
      const deaData = param.seriesData.get(dea) as { value: number } | undefined;
      const histData = param.seriesData.get(macdHist) as { value: number } | undefined;

      const date = String(param.time);
      const fromMap = priceByDateRef.current.get(date);
      const macdMap = macdByDateRef.current.get(date);

      const open = candleData?.open ?? fromMap?.open;
      const high = candleData?.high ?? fromMap?.high;
      const low = candleData?.low ?? fromMap?.low;
      const close = candleData?.close ?? fromMap?.close;
      const volumeVal = volumeData?.value ?? fromMap?.volume;
      const volMa5Val = param.seriesData.get(volMa5) as { value: number } | undefined;
      const volMa20Val = param.seriesData.get(volMa20) as { value: number } | undefined;
      const difVal = difData?.value ?? macdMap?.dif;
      const deaVal = deaData?.value ?? macdMap?.dea;
      const histVal = histData?.value ?? macdMap?.hist;

      if (
        open == null ||
        high == null ||
        low == null ||
        close == null ||
        difVal == null ||
        deaVal == null ||
        histVal == null ||
        (hasVolumeRef.current &&
          (volumeVal == null || !Number.isFinite(volumeVal))) ||
        !Number.isFinite(difVal) ||
        !Number.isFinite(deaVal) ||
        !Number.isFinite(histVal)
      ) {
        setHoverBar(null);
        return;
      }
      setHoverBar({
        date,
        open,
        high,
        low,
        close,
        volume: volumeVal ?? 0,
        volMa5: volMa5Val?.value ?? null,
        volMa20: volMa20Val?.value ?? null,
        dif: difVal,
        dea: deaVal,
        hist: histVal,
      });
    };
    chart.subscribeCrosshairMove(onCrosshairMove);

    // 在隱藏的 tab 內建立時寬度為 0，顯示後需重新 fit，否則 K 棒會擠在右側
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

    const macd = computeMacd(data.map((d) => d.close));
    const closes = data.map((d) => d.close);
    const smaByPeriod = Object.fromEntries(
      MA_PERIODS.map((p) => [p, computeSma(closes, p)])
    ) as Record<MaPeriod, (number | null)[]>;

    const n = RANGE_DAYS[range];
    const start = Math.max(0, data.length - n);
    const slice = data.slice(start);
    const macdSlice = macd.slice(start);
    priceByDateRef.current = new Map(slice.map((d) => [d.date, d]));
    macdByDateRef.current = new Map(
      slice.map((d, i) => [
        d.date,
        { dif: macdSlice[i].dif, dea: macdSlice[i].dea, hist: macdSlice[i].hist },
      ])
    );

    s.candle.setData(
      slice.map((d) => ({
        time: d.date,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
    );
    s.volume.setData(
      hasVolume
        ? slice.map((d) => ({
            time: d.date,
            value: d.volume,
            color:
              d.close >= d.open ? "rgba(255,92,117,0.5)" : "rgba(46,204,143,0.5)",
          }))
        : []
    );

    const volumes = data.map((d) => d.volume);
    const volMa5 = computeSma(volumes, 5);
    const volMa20 = computeSma(volumes, 20);
    const toVolMaData = (sma: (number | null)[]) =>
      showVolMa
        ? slice
            .map((d, i) => {
              const v = sma[start + i];
              return v != null ? { time: d.date, value: v } : null;
            })
            .filter((p): p is { time: string; value: number } => p != null)
        : [];
    s.volMa5.setData(toVolMaData(volMa5));
    s.volMa20.setData(toVolMaData(volMa20));

    for (const period of MA_PERIODS) {
      const sma = smaByPeriod[period].slice(start);
      s.ma[period].setData(
        slice
          .map((d, i) => {
            const v = sma[i];
            return v != null ? { time: d.date, value: v } : null;
          })
          .filter((p): p is { time: string; value: number } => p != null)
      );
    }

    s.macdHist.setData(
      macdSlice.map((m, i) => ({
        time: slice[i].date,
        value: m.hist,
        color: m.hist >= 0 ? UP : DOWN,
      }))
    );
    s.dif.setData(macdSlice.map((m, i) => ({ time: slice[i].date, value: m.dif })));
    s.dea.setData(macdSlice.map((m, i) => ({ time: slice[i].date, value: m.dea })));

    chart.timeScale().fitContent();
  }, [data, range, hasVolume, showVolMa]);

  return (
    <div className="chart-wrap">
      <div className="chart-toolbar">
        <div className="chart-ohlc" aria-live="polite">
          {hoverBar ? (
            <>
              <div className="chart-ohlc-row">
                <span className="chart-ohlc-date">{hoverBar.date}</span>
                <span className="chart-ohlc-item">
                  開{" "}
                  <strong className={hoverBar.close >= hoverBar.open ? "up" : "down"}>
                    {formatPrice(hoverBar.open)}
                  </strong>
                </span>
                <span className="chart-ohlc-item">
                  高 <strong className="up">{formatPrice(hoverBar.high)}</strong>
                </span>
                <span className="chart-ohlc-item">
                  低 <strong className="down">{formatPrice(hoverBar.low)}</strong>
                </span>
                <span className="chart-ohlc-item">
                  收{" "}
                  <strong className={hoverBar.close >= hoverBar.open ? "up" : "down"}>
                    {formatPrice(hoverBar.close)}
                  </strong>
                </span>
                {hasVolume && (
                  <>
                    <span className="chart-ohlc-sep" aria-hidden>
                      |
                    </span>
                    <span className="chart-ohlc-item">
                      量 <strong>{formatVolume(hoverBar.volume, volumeUnit)}</strong>
                    </span>
                    {showVolMa && hoverBar.volMa5 != null && (
                      <span className="chart-ohlc-item">
                        5日均量{" "}
                        <strong style={{ color: VOL_MA5_COLOR }}>
                          {formatVolume(hoverBar.volMa5, volumeUnit)}
                        </strong>
                      </span>
                    )}
                    {showVolMa && hoverBar.volMa20 != null && (
                      <span className="chart-ohlc-item">
                        20日均量{" "}
                        <strong style={{ color: VOL_MA20_COLOR }}>
                          {formatVolume(hoverBar.volMa20, volumeUnit)}
                        </strong>
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="chart-ohlc-row chart-ohlc-row--macd">
                <span className="chart-ohlc-item">
                  DIF{" "}
                  <strong style={{ color: DIF_COLOR }}>{formatMacd(hoverBar.dif)}</strong>
                </span>
                <span className="chart-ohlc-item">
                  DEA{" "}
                  <strong style={{ color: DEA_COLOR }}>{formatMacd(hoverBar.dea)}</strong>
                </span>
                <span className="chart-ohlc-item">
                  DIF-DEA{" "}
                  <strong className={hoverBar.hist >= 0 ? "up" : "down"}>
                    {formatMacd(hoverBar.hist)}
                  </strong>
                </span>
              </div>
            </>
          ) : (
            <span className="chart-ohlc-hint">移動游標查看當日行情</span>
          )}
        </div>
        <div className="chart-range">
          {(["3m", "6m", "1y"] as Range[]).map((r) => (
            <button
              key={r}
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
          上：K線{hasVolume ? "＋成交量" : ""}
          {showVolMa ? "＋均量" : ""}＋MA({MA_PERIODS.join(",")})
        </span>
        <span className="chart-legend-group chart-legend-ma">
          {MA_PERIODS.map((p) => (
            <span key={p} className="chart-legend-item" style={{ color: MA_COLORS[p] }}>
              ● MA{p}
            </span>
          ))}
        </span>
        {showVolMa && (
          <span className="chart-legend-group">
            <span style={{ color: VOL_MA5_COLOR }}>● 5日均量</span>{" "}
            <span style={{ color: VOL_MA20_COLOR }}>● 20日均量</span>
          </span>
        )}
        <span className="chart-legend-group">
          下：MACD(12,26,9){" "}
          <span style={{ color: DIF_COLOR }}>● DIF</span>{" "}
          <span style={{ color: DEA_COLOR }}>● DEA</span>
        </span>
      </div>
    </div>
  );
}
