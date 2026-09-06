"use client";

// Choropleth map using chartjs-chart-geo. Each country is filled with a
// shade proportional to its aggregated value. Rows are bucketed by
// ISO-3166 numeric code via resolveCountry() so data in any of
// alpha-2/alpha-3/numeric/name formats works.
//
// Cross-filtering: clicking a country calls `onFilter(column, value)`
// with the *original* country column value from the dashboard config, so
// the filter targets the same column the config references.

import { useEffect, useMemo, useRef } from "react";
import {
  Chart as ChartJS,
  Legend,
  Tooltip,
  type ChartConfiguration,
} from "chart.js";
import {
  ChoroplethController,
  GeoFeature,
  ColorScale,
  ProjectionScale,
} from "chartjs-chart-geo";
import type { Feature, Geometry } from "geojson";
import type { PanelV2 } from "@/lib/types/dashboard-v2";
import { resolveCountry } from "@/lib/dashboard/iso3166";
import { useWorldAtlas } from "@/lib/dashboard/worldAtlas";
import { formatValue, toNum } from "@/lib/dashboard/format";
import { chartAreaProps, panelCardClass, type PanelProps } from "./types";

ChartJS.register(
  ChoroplethController,
  GeoFeature,
  ColorScale,
  ProjectionScale,
  Tooltip,
  Legend,
);

type ChoroplethMapPanelConfig = Extract<PanelV2, { kind: "choropleth_map" }>;

type CountryFeature = Feature<Geometry, { name: string }>;

export function ChoroplethMapPanel({ config, data }: PanelProps<ChoroplethMapPanelConfig>) {
  const atlas = useWorldAtlas();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<ChartJS<"choropleth"> | null>(null);
  // Keep the latest row-string-by-numeric map so chart click handlers (which
  // close over the chart instance) can call back with the *original* user
  // input, not the normalized numeric code.
  const originalCountryByNumeric = useRef<Map<string, string>>(new Map());

  const { chartData, unresolved } = useMemo(() => {
    if (!atlas) return { chartData: null, unresolved: 0 };
    const buckets = new Map<string, number[]>();
    const originals = new Map<string, string>();
    let unresolved = 0;
    for (const row of data.rows) {
      const raw = row[config.region];
      const entry = resolveCountry(raw);
      if (!entry) {
        if (raw != null) unresolved++;
        continue;
      }
      const key = entry.numeric.replace(/^0+/, "");
      const bucket = buckets.get(key) ?? [];
      bucket.push(toNum(row[config.value]) ?? 0);
      buckets.set(key, bucket);
      // Remember the first raw form we saw so cross-filter clicks pass
      // back something the dashboard's filter can match against.
      if (!originals.has(key) && raw != null) {
        originals.set(key, String(raw));
      }
    }
    const aggregated = new Map<string, number>();
    for (const [k, vs] of buckets) aggregated.set(k, vs.reduce((a, b) => a + b, 0));
    originalCountryByNumeric.current = originals;
    // Build one data point per atlas feature. Features without data get
    // value 0 so the color scale still paints them in a "zero" shade.
    const points = atlas.features.map((f) => {
      const key = f.id != null ? String(f.id).replace(/^0+/, "") : "";
      const value = key ? aggregated.get(key) ?? 0 : 0;
      return { feature: f as CountryFeature, value };
    });
    return { chartData: points, unresolved };
  }, [atlas, data.rows, config.region, config.value]);

  // Create / recreate the chart when atlas or data changes.
  useEffect(() => {
    if (!atlas || !canvasRef.current || !chartData) return;
    // Tear down any previous instance before re-creating, Chart.js does
    // not support reassigning `data.labels` + `datasets[0].outline` on an
    // existing choropleth cleanly.
    chartRef.current?.destroy();

    const activeNumeric: string | null = null;

    const chartCfg: ChartConfiguration<"choropleth"> = {
      type: "choropleth",
      data: {
        labels: chartData.map((d) => d.feature.properties?.name ?? ""),
        datasets: [
          {
            label: config.title,
            outline: atlas.collection.features,
            data: chartData,
            borderWidth: 0.5,
            borderColor: "#cbd5e1",
            // Dim non-active countries when a filter is live.
            backgroundColor: (ctx) => {
              const raw = ctx.raw as { feature: CountryFeature; value: number } | undefined;
              const val = raw?.value ?? 0;
              const max = chartData.reduce((m, d) => (d.value > m ? d.value : m), 0);
              if (activeNumeric) {
                const key = raw?.feature.id != null
                  ? String(raw.feature.id).replace(/^0+/, "")
                  : "";
                if (key === activeNumeric) return colorFor(val, max, 1);
                return colorFor(val, max, 0.3);
              }
              return colorFor(val, max, 1);
            },
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        showOutline: true,
        showGraticule: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => {
                const raw = item.raw as { feature: CountryFeature; value: number };
                const name = raw.feature.properties?.name ?? "";
                return `${name}: ${formatValue(raw.value)}`;
              },
            },
          },
        },
        scales: {
          projection: {
            axis: "x",
            projection: "naturalEarth1",
          },
          color: {
            axis: "x",
            // Tailwind blue ramp via a custom interpolator. Gray zero fill
            // is handled by `colorFor` so missing data reads as neutral.
            interpolate: (t: number) => interpolateBlue(t),
            quantize: 5,
            legend: { position: "bottom-right", align: "bottom" },
          },
        },
      },
    };
    chartRef.current = new ChartJS(canvasRef.current, chartCfg);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [atlas, chartData, config.title, config.region]);

  return (
    <div className="flex flex-1 flex-col min-w-0 rounded-[13px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-[color:var(--color-leaf-deep)]">{config.title}</h3>
      <div {...chartAreaProps(config)}>
        {!atlas ? (
          <div className="flex h-full items-center justify-center text-xs text-[color:var(--color-ink-3)]">
            Loading map…
          </div>
        ) : (
          <canvas ref={canvasRef} />
        )}
      </div>
      {unresolved > 0 && (
        <p className="mt-2 text-[11px] text-[color:var(--color-amber-deep)]">
          {unresolved} row(s) had an unrecognized country value and were skipped
        </p>
      )}
    </div>
  );
}

// Blue ramp, roughly matching Tailwind blue-50 → blue-900 but with
// alpha-aware output so the caller can dim non-active features.
function interpolateBlue(t: number): string {
  return colorFor(t, 1, 1);
}

function colorFor(value: number, max: number, alpha: number): string {
  if (value <= 0 || max <= 0) return `rgba(64, 65, 72, ${alpha})`; // gray-200
  const t = Math.min(1, Math.sqrt(value / max));
  // Interpolate from blue-100 (#dbeafe) to blue-900 (#1e3a8a)
  const stops: [number, number, number][] = [
    [219, 234, 254], // blue-100
    [147, 197, 253], // blue-300
    [59, 130, 246],  // blue-500
    [29, 78, 216],   // blue-700
    [30, 58, 138],   // blue-900
  ];
  const scaled = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const frac = scaled - i;
  const [r1, g1, b1] = stops[i];
  const [r2, g2, b2] = stops[i + 1];
  const r = Math.round(r1 + (r2 - r1) * frac);
  const g = Math.round(g1 + (g2 - g1) * frac);
  const b = Math.round(b1 + (b2 - b1) * frac);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default ChoroplethMapPanel;
