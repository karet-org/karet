// Formatting + coercion helpers shared by every dashboard panel.

/** Coerce an unknown cell to a finite number, or null when it can't. */
export function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Render a number with commas; keeps 2 decimal places for non-integers. */
export function formatValue(v: number): string {
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
