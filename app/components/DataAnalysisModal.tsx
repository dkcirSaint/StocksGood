"use client";

import Modal from "./Modal";
import VolumeMaAnalysis from "./VolumeMaAnalysis";

export default function DataAnalysisModal({
  open,
  onClose,
  variant = "stock",
}: {
  open: boolean;
  onClose: () => void;
  variant?: "stock" | "index";
}) {
  return (
    <Modal open={open} title="數據分析" onClose={onClose}>
      {variant === "stock" && (
      <section className="analysis-section">
        <h4 className="analysis-heading">MACD 三層分析</h4>
        <p className="analysis-note">
          採用與 K 線圖相同參數 MACD(12, 26, 9)。三層由上而下：戰術動能 → 結構背離 → 進出場確認。
        </p>

        <h5 className="analysis-subheading">第一層・戰術（5 日 4 日同向）</h5>
        <ul className="analysis-rules">
          <li>
            <span className="macd-tactical weak">短波段轉弱</span>
            當天 DIF ≥ DEA，且近 5 個交易日內至少 4 日 DIF-DEA 收斂（適合持倉防回吐、短線轉弱預警）
          </li>
          <li>
            <span className="macd-tactical strong">短波段轉強</span>
            當天 DIF &lt; DEA，且近 5 個交易日內至少 4 日 DIF-DEA 遞增（空頭力道回補、短線轉強觀察）
          </li>
          <li>
            <span className="macd-tactical golden-cross">剛金叉</span>
            近 5 個交易日內 DIF 由下向上穿越 DEA（優先顯示，避免交叉當下被 5 日 4 日同向規則忽略）
          </li>
          <li>
            <span className="macd-tactical death-cross">剛死叉</span>
            近 5 個交易日內 DIF 由上向下穿越 DEA（優先顯示，避免交叉當下被 5 日 4 日同向規則忽略）
          </li>
        </ul>

        <h5 className="analysis-subheading">第二層・結構（標準背離）</h5>
        <ul className="analysis-rules">
          <li>
            <span className="analysis-tag high">頂背離</span>
            價格後一個波峰「更高」，但 DIF 對應高點「更低」，且高點位於零軸之上（上漲動能衰竭，看跌）
          </li>
          <li>
            <span className="analysis-tag low">底背離</span>
            價格後一個波谷「更低」，但 DIF 對應低點「更高」，且低點位於零軸之下（下跌動能減弱，看漲）
          </li>
          <li>
            前一個波峰／波谷以 swing 轉折（左右各 3 根）認定；當前段取到最新交易日為止的最高／最低，每個交易日皆可即時判定
          </li>
        </ul>

        <h5 className="analysis-subheading">第三層・進出場（確認交叉）</h5>
        <p className="analysis-note">
          底背離對應<strong>進場</strong>標籤；頂背離對應<strong>出場</strong>標籤。
        </p>
        <ul className="analysis-rules">
          <li>
            <span className="macd-status watching">等金叉</span>
            底背離成立、尚未金叉：等待 DIF 上穿 DEA 後再考慮進場
          </li>
          <li>
            <span className="macd-status confirmed">可偏多進場</span>
            底背離後已出現金叉，可考慮偏多進場
          </li>
          <li>
            <span className="macd-status expired">暫緩</span>
            底背離已失效，暫緩進場
          </li>
          <li>
            <span className="macd-status watching">等死叉</span>
            頂背離成立、尚未死叉：等待 DIF 下穿 DEA 後再考慮減碼／出場
          </li>
          <li>
            <span className="macd-status confirmed">可減碼／出場</span>
            頂背離後已出現死叉，可考慮減碼或出場
          </li>
          <li>
            <span className="macd-status expired">訊號取消</span>
            頂背離已失效，出場訊號取消
          </li>
        </ul>
      </section>
      )}
      {variant === "index" && (
      <section className="analysis-section">
        <h4 className="analysis-heading">VIX 恐慌指數</h4>
        <p className="analysis-note">
          CBOE 波動率指數，衡量市場對未來 30 天股價波動的預期。高＝恐慌、低＝偏自滿。
        </p>
        <ul className="analysis-rules">
          <li>
            <span className="analysis-tag high">急升</span>
            常伴隨風險性資產賣壓，資金偏向避險
          </li>
          <li>
            <span className="analysis-tag low">低檔盤整</span>
            市場偏自滿，一旦意外衝擊，波動可能快速放大
          </li>
        </ul>
      </section>
      )}
      <VolumeMaAnalysis />
    </Modal>
  );
}
