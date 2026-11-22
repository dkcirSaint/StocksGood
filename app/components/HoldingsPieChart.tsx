"use client";

import type { HoldingRow } from "@/lib/holdings";

const PIE_COLORS = [
  "#4f8cff",
  "#f6c454",
  "#ff5c75",
  "#2ecc8f",
  "#a78bfa",
  "#fb923c",
  "#38bdf8",
  "#f472b6",
  "#34d399",
  "#facc15",
];

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function slicePath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number
): string {
  const [x1, y1] = polar(cx, cy, r, startDeg);
  const [x2, y2] = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

export default function HoldingsPieChart({
  rows,
  title = "持股比例",
}: {
  rows: HoldingRow[];
  title?: string;
}) {
  const slices = rows
    .filter((r) => r.weight != null && r.weight > 0 && r.marketValue != null)
    .sort((a, b) => (b.weight as number) - (a.weight as number));

  if (slices.length === 0) {
    return (
      <div className="holdings-pie" aria-label="持股比例圓餅圖">
        <h3 className="holdings-pie-title">{title}</h3>
        <p className="holdings-empty">尚無市值資料，無法繪製持股比例。</p>
      </div>
    );
  }

  const cx = 100;
  const cy = 100;
  const r = 92;
  let cursor = 0;
  const paths = slices.map((row, i) => {
    const sweep = (row.weight as number) * 360;
    const start = cursor;
    const end = i === slices.length - 1 ? 360 : cursor + sweep;
    cursor = end;
    const isFull = end - start >= 359.99;
    return {
      row,
      color: PIE_COLORS[i % PIE_COLORS.length],
      d: isFull
        ? undefined
        : slicePath(cx, cy, r, start, Math.max(end, start + 0.01)),
      full: isFull,
    };
  });

  return (
    <div className="holdings-pie">
      <h3 className="holdings-pie-title">{title}</h3>
      <div className="holdings-pie-body">
        <svg
          className="holdings-pie-svg"
          viewBox="0 0 200 200"
          role="img"
          aria-label="持股市值比例圓餅圖"
        >
          {paths.map((p) =>
            p.full ? (
              <circle
                key={p.row.stockId}
                cx={cx}
                cy={cy}
                r={r}
                fill={p.color}
              />
            ) : (
              <path key={p.row.stockId} d={p.d} fill={p.color} />
            )
          )}
        </svg>
        <ul className="holdings-pie-legend">
          {paths.map((p) => (
            <li key={p.row.stockId}>
              <span
                className="holdings-pie-swatch"
                style={{ background: p.color }}
              />
              <span className="holdings-pie-legend-name">
                {p.row.stockId} {p.row.stockName}
              </span>
              <span className="holdings-pie-legend-pct">
                {((p.row.weight as number) * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
