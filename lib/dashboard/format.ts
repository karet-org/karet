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

const ISO_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2}(\.\d+)?)?Z$/;

/**
 * Shorten an ISO timestamp for display: dates arrive from the warehouse as
 * `2026-09-10T00:00:00.000Z`, which crowds axes and table columns. Midnight
 * becomes `2026-09-10`, any other time `2026-09-10 14:05` (UTC). Anything
 * else is returned unchanged.
 */
export function formatLabel(v: string): string {
  const m = ISO_TIMESTAMP.exec(v);
  if (!m) return v;
  return m[2] === "00:00" && !/[1-9]/.test(m[3] ?? "") ? m[1] : `${m[1]} ${m[2]}`;
}
