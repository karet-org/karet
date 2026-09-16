// Fingerprint of a config, for deciding whether it differs from the saved one.
// A boolean dirty flag latches on the first edit and never clears, so undoing
// an edit left the pipeline looking unsaved. Two wrinkles rule out a plain
// `JSON.stringify`: editors rebuild objects with spreads, so re-adding a field
// reorders keys without changing meaning, and React Flow reports node positions
// as floats that drift in the last decimal.

import type { PipelineConfig } from "@/lib/types/config";

/** Positions are compared to this many decimal places. */
const POSITION_PRECISION = 2;

function canonical(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((v) => canonical(v));
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return entries.map(([k, v]) => [k, canonical(v, k)]);
  }
  if (typeof value === "number" && (key === "x" || key === "y")) {
    return Number(value.toFixed(POSITION_PRECISION));
  }
  return value;
}

/** Stable string for a config, independent of key order and float noise. */
export function configFingerprint(cfg: PipelineConfig | null | undefined): string {
  if (!cfg) return "";
  return JSON.stringify(canonical(cfg));
}
