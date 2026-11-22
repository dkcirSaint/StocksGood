"use client";

import type { DailyPrice } from "@/lib/types";
import type { MacroPoint } from "@/lib/macro-series";
import type { TreasuryYieldPoint } from "@/lib/treasury-yields";
import {
  REGIME_DEFS,
  assessMarketRegime,
  regimeTone,
  type RegimeAssessment,
  type RegimeId,
} from "@/lib/market-regime";
import {
  PMI_LINE,
  assessPmiReading,
  type PmiSide,
} from "@/lib/pmi-reading";

function formatPmi(n: number): string {
  return n.toFixed(1);
}

function formatDelta(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}`;
}

function PmiOverlay({
  twPmi,
  usPmi,
  regimeId,
}: {
  twPmi?: MacroPoint[] | null;
  usPmi?: MacroPoint[] | null;
  regimeId: RegimeId;
}) {
  const reading = assessPmiReading(twPmi, usPmi, regimeId);
  if (!reading.tw && !reading.us) return null;

  return (
    <section>
      <h4 className="market-analysis-heading">台灣／美國 PMI</h4>
      <div className="market-pmi-sides">
        {reading.tw ? <PmiSideCard side={reading.tw} /> : null}
        {reading.us ? <PmiSideCard side={reading.us} /> : null}
      </div>
      {reading.comboName && reading.comboMeaning ? (
        <p className="market-pmi-combo">
          <strong>{reading.comboName}</strong>
          {"　"}
          {reading.comboMeaning}
        </p>
      ) : (
        <p className="market-regime-basis">
          缺一側 PMI 時只讀單邊榮枯，不合成台美組合。
        </p>
      )}
      {reading.vsRegime ? (
        <p className="market-regime-basis">{reading.vsRegime}</p>
      ) : null}
    </section>
  );
}

function PmiSideCard({ side }: { side: PmiSide }) {
  return (
    <div className="market-pmi-card">
      <div className="market-pmi-card-head">
        <span className="market-pmi-label">{side.label}</span>
        <span
          className={`market-pmi-tag ${side.expand ? "expand" : "contract"}`}
        >
          {side.expand ? "擴張" : "收縮"}
        </span>
        <span className="market-pmi-value">{formatPmi(side.value)}</span>
      </div>
      <p className="market-pmi-meta">
        {side.date}
        {side.delta != null && side.prevDate
          ? ` · 較上月 ${formatDelta(side.delta)}（自 ${side.prevDate} 的 ${formatPmi(side.prevValue ?? 0)}）`
          : ""}
        {" · "}
        榮枯線 {PMI_LINE} · 確認{side.confirms}
      </p>
    </div>
  );
}

export default function MarketAnalysisPanel({
  yields,
  vix,
  dxy,
  twPmi,
  usPmi,
  nowMs,
}: {
  yields: TreasuryYieldPoint[];
  vix: DailyPrice[];
  dxy: DailyPrice[];
  twPmi?: MacroPoint[] | null;
  usPmi?: MacroPoint[] | null;
  nowMs: number;
}) {
  const assessment: RegimeAssessment | null = assessMarketRegime(
    yields,
    vix,
    dxy,
    new Date(nowMs)
  );

  if (!assessment) {
    return <p className="empty">市場分析需要公債、VIX 與美元指數資料。</p>;
  }

  const current = REGIME_DEFS.find((d) => d.id === assessment.id);

  return (
    <div className="market-analysis">
      <section
        className={`market-regime-now tone-${regimeTone(assessment.id)}`}
        aria-live="polite"
      >
        <p className="market-regime-kicker">目前判定</p>
        <h3 className="market-regime-title">
          狀況 {assessment.id}　{current?.name}
        </h3>
        {assessment.invertedBadge ? (
          <p className="market-regime-badge">另記：10Y−2Y 曲線倒掛</p>
        ) : null}
        <p className="market-regime-meaning">{current?.meaning}</p>
        {current ? (
          <p className="market-regime-basis">分類依據：{current.basis}</p>
        ) : null}
      </section>

      <section>
        <h4 className="market-analysis-heading">為什麼是這個狀況</h4>
        <ul className="market-regime-reasons">
          {assessment.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </section>

      <PmiOverlay
        twPmi={twPmi}
        usPmi={usPmi}
        regimeId={assessment.id}
      />

      <section>
        <h4 className="market-analysis-heading">九種狀況參考（由看多到看空）</h4>
        <ol className="market-regime-list">
          {REGIME_DEFS.map((d) => (
            <li
              key={d.id}
              className={`market-regime-item${d.id === assessment.id ? ` current tone-${regimeTone(d.id)}` : ""}`}
            >
              <div className="market-regime-item-head">
                <span className="market-regime-item-id">狀況 {d.id}</span>
                <span className="market-regime-item-name">{d.name}</span>
                {d.id === assessment.id ? (
                  <span className="market-regime-item-hit">目前</span>
                ) : null}
                {!d.auto ? (
                  <span className="market-regime-item-manual">不自動判定</span>
                ) : null}
              </div>
              <p>{d.meaning}</p>
              <p className="market-regime-basis">分類依據：{d.basis}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
