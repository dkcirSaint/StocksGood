export {
  taiwanWeekBounds,
} from "./calendar-event-utils";

export function formatRatioPct(ratio: number): string {
  return `${ratio.toFixed(2)}%`;
}

export function formatWowChange(change: number | null): string {
  if (change == null) return "—";
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}
