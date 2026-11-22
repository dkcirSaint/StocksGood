export default function VolumeMaAnalysis() {
  return (
    <section className="analysis-section">
      <h4 className="analysis-heading">均量</h4>
      <p className="analysis-note">
        均量是成交量的正常水位，用來判斷當日是放量還是縮量。圖上為 5
        日（短線）與 20 日（約一個月）。
      </p>
      <ul className="analysis-rules">
        <li>
          <span className="analysis-tag high">放量突破</span>
          價格越過均線或前高，同時量明顯高於均量，比較有機會是真突破。
        </li>
        <li>
          <span className="analysis-tag low">價漲量縮</span>
          上漲但量低於均量，動能可能不夠。
        </li>
        <li>
          <span className="analysis-tag high">價跌量增</span>
          下跌同時放量，賣壓比較重。
        </li>
        <li>
          <span className="analysis-tag low">長期均量下滑</span>
          流動性變差，波動可能變大。
        </li>
      </ul>
    </section>
  );
}
