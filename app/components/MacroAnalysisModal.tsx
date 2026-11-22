"use client";

import Modal from "./Modal";

export default function MacroAnalysisModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} title="數據分析" onClose={onClose}>
      <section className="analysis-section">
        <p className="modal-text">
          利率與資金流向是股市的「水庫水位」，直接決定市場的資金成本與評價標準。
        </p>
      </section>

      <section className="analysis-section">
        <h4 className="analysis-heading">美國公債</h4>
        <p className="analysis-note">被視為全球最安全（無風險）的資產。</p>
        <ul className="analysis-rules">
          <li>
            <span className="analysis-tag high">殖利率飆升</span>
            意味著「不用冒險買股票就能拿到高回報」，會降低股票吸引力（股票評價被修剪，特別是高本益比科技股）
          </li>
          <li>
            <span className="analysis-tag high">殖利率倒掛</span>
            短期殖利率 &gt; 長期殖利率：歷史上常被視為經濟衰退（Recession）的預警信號，易引發市場恐慌賣壓
          </li>
        </ul>
      </section>

      <section className="analysis-section">
        <h4 className="analysis-heading">台灣 PMI／美國 PMI</h4>
        <p className="analysis-note">
          製造業採購經理人指數，50 為榮枯線。領先反映訂單與生產，對出口供應鏈與景氣方向比非農等落後資料更早。
        </p>
        <ul className="analysis-rules">
          <li>
            <span className="analysis-tag high">跌破 50 收縮</span>
            製造業活動走弱，出口、庫存與資本支出預期轉保守，台股電子／傳產與美股週期股易受壓
          </li>
          <li>
            <span className="analysis-tag low">站上 50 擴張</span>
            新訂單與生產回溫，有利風險資產；台灣 PMI 偏台股出口鏈，美國 ISM 偏美股與全球供應鏈需求
          </li>
        </ul>
      </section>

      <section className="analysis-section">
        <h4 className="analysis-heading">HY 利差</h4>
        <p className="analysis-note">
          美國高收益債相對公債的選擇權調整利差（OAS）。量的是信用市場要求的風險補償，與股市波動（VIX）、公債曲線是不同市場。
        </p>
        <ul className="analysis-rules">
          <li>
            <span className="analysis-tag high">利差走闊</span>
            投資人要求更高補償才願意持有垃圾債，信用緊縮、風險趨避，股市（尤其高槓桿與小型股）常同步承壓
          </li>
          <li>
            <span className="analysis-tag low">利差走窄</span>
            信用寬鬆、風險偏好回升；若同時公債殖利率穩定，較有利風險資產，但過窄也可能代表定價過於樂觀
          </li>
        </ul>
      </section>
    </Modal>
  );
}
