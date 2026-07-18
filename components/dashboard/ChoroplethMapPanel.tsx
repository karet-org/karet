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
import type { Panel } from "@/lib/types/dashboard";
import { resolveCountry } from "@/lib/dashboard/iso3166";
import { useWorldAtlas } from "@/lib/dashboard/worldAtlas";
import { formatValue, toNum } from "@/lib/dashboard/format";
import { aggregateValues } from "./aggregate";
import { chartAreaProps, type PanelProps, type CrossFilterProps } from "./types";

ChartJS.register(
  ChoroplethController,
  GeoFeature,
  ColorScale,
  ProjectionScale,
  Tooltip,
  Legend,
);

type ChoroplethMapPanelConfig = Extract<Panel, { kind: "choropleth_map" }>;

type CountryFeature = Feature<Geometry, { name: string }>;

export function ChoroplethMapPanel({
  config,
  rows,
  onFilter,
  activeFilter,
}: PanelProps<ChoroplethMapPanelConfig> & CrossFilterProps) {
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
    for (const row of rows) {
      const raw = row[config.country];
      const entry = resolveCountry(raw);
      if (!entry) {
        if (raw != null) unresolved++;
        continue;
      }
      const key = entry.numeric.replace(/^0+/, "");
      const bucket = buckets.get(key) ?? [];
      if (config.value) {
        const v = toNum(row[config.value]);
        bucket.push(v ?? 0);
      } else {
        bucket.push(1);
      }
      buckets.set(key, bucket);
      // Remember the first raw form we saw so cross-filter clicks pass
      // back something the dashboard's filter can match against.
      if (!originals.has(key) && raw != null) {
        originals.set(key, String(raw));
      }
    }
    const aggregated = new Map<string, number>();
    for (const [k, vs] of buckets) aggregated.set(k, aggregateValues(vs, config.agg));
    originalCountryByNumeric.current = originals;
    // Build one data point per atlas feature. Features without data get
    // value 0 so the color scale still paints them in a "zero" shade.
    const data = atlas.features.map((f) => {
      const key = f.id != null ? String(f.id).replace(/^0+/, "") : "";
      const value = key ? aggregated.get(key) ?? 0 : 0;
      return { feature: f as CountryFeature, value };
    });
    return { chartData: data, unresolved };
  }, [atlas, rows, config.country, config.value, config.agg]);

  // Create / recreate the chart when atlas or data changes.
  useEffect(() => {
    if (!atlas || !canvasRef.current || !chartData) return;
    // Tear down any previous instance before re-creating, Chart.js does
    // not support reassigning `data.labels` + `datasets[0].outline` on an
    // existing choropleth cleanly.
    chartRef.current?.destroy();

    const active = activeFilter && activeFilter.column === config.country;
    const activeNumeric = active
      ? resolveCountry(activeFilter.value)?.numeric.replace(/^0+/, "") ?? null
      : null;

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
        onClick: (_evt, elements) => {
          if (!onFilter || elements.length === 0) return;
          const el = elements[0];
          const raw = chartData[el.index];
          if (!raw) return;
          const key = raw.feature.id != null
            ? String(raw.feature.id).replace(/^0+/, "")
            : "";
          const original = originalCountryByNumeric.current.get(key);
          if (original) onFilter(config.country, original);
        },
        onHover: (event, elements) => {
          const target = event.native?.target as HTMLElement | null;
          if (target) target.style.cursor = elements.length > 0 ? "pointer" : "default";
        },
      },
    };
    chartRef.current = new ChartJS(canvasRef.current, chartCfg);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [
    atlas,
    chartData,
    config.title,
    config.country,
    onFilter,
    activeFilter,
  ]);

  return (
    <div className="flex flex-1 flex-col min-w-0 rounded-lg border border-orange-100 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-emerald-600">{config.title}</h3>
      <div {...chartAreaProps(config)}>
        {!atlas ? (
          <div className="flex h-full items-center justify-center text-xs text-gray-400">
            Loading map…
          </div>
        ) : (
          <canvas ref={canvasRef} />
        )}
      </div>
      {unresolved > 0 && (
        <p className="mt-2 text-[11px] text-amber-600">
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
  if (value <= 0 || max <= 0) return `rgba(229, 231, 235, ${alpha})`; // gray-200
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
