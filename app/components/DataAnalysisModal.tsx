"use client";

import Modal from "./Modal";

export default function DataAnalysisModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} title="數據分析" onClose={onClose}>
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
        <ul className="analysis-rules">
          <li>
            <span className="macd-status watching">有效・待確認</span>
            背離成立且仍在有效區間，尚未出現 DIF/DEA 交叉（觀察中）
          </li>
          <li>
            <span className="macd-status confirmed">已確認・可進場</span>
            自背離轉折點後已出現 DIF/DEA 交叉（頂背離死叉、底背離金叉），作為進場依據
          </li>
          <li>
            <span className="macd-status expired">已失效</span>
            DIF 已重新超越前一波峰／跌破前一波谷，背離前提被破壞
          </li>
        </ul>
      </section>
    </Modal>
  );
}
