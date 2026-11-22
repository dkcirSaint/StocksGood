export {
  taiwanWeekBounds,
} from "./calendar-event-utils";

export function formatRatioPct(ratio: number): string {
  return `${ratio.toFixed(2)}%`;
}

export function formatPeople(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("zh-TW");
}

export function formatWowChange(change: number | null): string {
  if (change == null) return "—";
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}

/** 較上期：比例%(人數)，例如 -0.04%(+6) */
export function formatWowWithPeople(
  change: number | null,
  peopleChange: number | null
): string {
  if (change == null && peopleChange == null) return "—";
  const pct = change != null ? formatWowChange(change) : "—";
  if (peopleChange == null) return pct;
  const sign = peopleChange > 0 ? "+" : "";
  const people = `${sign}${Math.round(peopleChange).toLocaleString("zh-TW")}`;
  return `${pct}(${people})`;
}
