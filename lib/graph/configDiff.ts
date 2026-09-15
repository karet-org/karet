// Is the working config actually different from the saved one?
//
// A boolean "dirty" flag latches on the first edit and never comes back, so
// typing a character and deleting it, or dragging a node and dragging it back,
// leaves the pipeline looking unsaved when nothing has changed. Comparing
// values instead means the answer follows the config.
//
// Two wrinkles make a plain `JSON.stringify` comparison wrong:
//   - key order. Editors rebuild objects with spreads, so dropping and
//     re-adding a field (`mapping.where`) moves it to the end of the object
//     without changing meaning.
//   - layout floats. React Flow reports positions as floats, and a drag that
//     ends where it started can differ in the last decimal.

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

/** True when `current` differs from `saved` in any way that would be written. */
export function configsDiffer(
  current: PipelineConfig | null | undefined,
  saved: PipelineConfig | null | undefined,
): boolean {
  if (!current || !saved) return false;
  return configFingerprint(current) !== configFingerprint(saved);
}
