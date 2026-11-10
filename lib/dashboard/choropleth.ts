// Colour scale, legend ticks and tooltip text for the choropleth panel.
//
// Values per country are usually spread over several orders of magnitude
// (requests per country run from 1 to hundreds of thousands), so colour
// follows log10 of the value, from the smallest value shown to the largest.
// A linear or square-root scale paints all but the top few countries in the
// lowest colour.

import { formatValue } from "./format";

/** Fill for a country with no row in the result. */
export const NO_DATA_FILL = "#2c2d33";

/** Dim to bright on the dark panel, so a brighter country has more. */
const STOPS: [number, number, number][] = [
  [74, 42, 31],
  [154, 63, 31],
  [255, 107, 53], // carrot orange, CHART_PALETTE[0]
  [253, 186, 116],
  [255, 237, 213],
];

/** The positive range a set of values covers, or null when none is positive. */
export function valueRange(values: Iterable<number>): { min: number; max: number } | null {
  let min = Infinity;
  let max = 0;
  for (const v of values) {
    if (v <= 0) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max > 0 ? { min, max } : null;
}

/** Position of `value` between `min` and `max` on a log scale, 0 to 1. */
export function scalePosition(value: number, min: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  if (max <= min) return 1;
  const t = (Math.log10(value) - Math.log10(min)) / (Math.log10(max) - Math.log10(min));
  return Math.max(0, Math.min(1, t));
}

/** Colour at position `t` (0 to 1) along the ramp. */
export function rampColor(t: number): string {
  const scaled = Math.max(0, Math.min(1, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(scaled));
  const frac = scaled - i;
  const [r1, g1, b1] = STOPS[i];
  const [r2, g2, b2] = STOPS[i + 1];
  return `rgb(${Math.round(r1 + (r2 - r1) * frac)}, ${Math.round(g1 + (g2 - g1) * frac)}, ${Math.round(b1 + (b2 - b1) * frac)})`;
}

/** Fill for a country: no-data grey when it has no row, else its ramp colour. */
export function fillFor(value: number | undefined, min: number, max: number): string {
  if (value === undefined) return NO_DATA_FILL;
  return rampColor(scalePosition(value, min, max));
}

/** CSS gradient matching the ramp, for the legend bar. */
export function legendGradient(): string {
  const stops = STOPS.map((_, i) => `${rampColor(i / (STOPS.length - 1))} ${(i / (STOPS.length - 1)) * 100}%`);
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** Closest two legend labels may sit, as a fraction of the bar. */
const MIN_TICK_GAP = 0.08;

/**
 * Legend ticks: `min`, the powers of ten between, and `max`, each with its
 * position on the bar. A power of ten too close to either end is dropped so
 * the labels do not overlap.
 */
export function legendTicks(min: number, max: number): { label: string; position: number }[] {
  if (max <= 0) return [];
  if (max <= min) return [{ label: compact.format(max), position: 1 }];
  const ticks = [{ label: compact.format(min), position: 0 }];
  for (let p = 10 ** Math.ceil(Math.log10(min)); p < max; p *= 10) {
    const position = scalePosition(p, min, max);
    if (position >= MIN_TICK_GAP && position <= 1 - MIN_TICK_GAP) {
      ticks.push({ label: compact.format(p), position });
    }
  }
  ticks.push({ label: compact.format(max), position: 1 });
  return ticks;
}

/** Tooltip text: value, share of the total, and rank among countries with data. */
export function tooltipText(
  name: string,
  value: number | undefined,
  rank: number | undefined,
  total: number,
  count: number,
): string {
  if (value === undefined) return `${name}: no data`;
  const share = total > 0 ? ` (${((value / total) * 100).toFixed(1)}%)` : "";
  const place = rank !== undefined ? `, #${rank} of ${count}` : "";
  return `${name}: ${formatValue(value)}${share}${place}`;
}

/** Rank by value, highest first; ties share the rank of the first. */
export function ranks(values: Map<string, number>): Map<string, number> {
  const sorted = [...values.entries()].sort((a, b) => b[1] - a[1]);
  const out = new Map<string, number>();
  sorted.forEach(([key, v], i) => {
    const prev = i > 0 ? sorted[i - 1] : null;
    out.set(key, prev && prev[1] === v ? out.get(prev[0])! : i + 1);
  });
  return out;
}

/** The values the map could not place, shortened to the first few. */
export function skippedSummary(values: string[], shown = 6): string {
  if (values.length <= shown) return values.join(", ");
  return `${values.slice(0, shown).join(", ")} and ${values.length - shown} more`;
}
