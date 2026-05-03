"use client";

// Proportional-symbol map using chartjs-chart-geo's BubbleMapController.
// Renders a world outline and one bubble per aggregated lat/lon bucket,
// with radius proportional to the aggregated value via chart.js's built-in
// SizeScale.

import { useEffect, useMemo, useRef } from "react";
import {
  Chart as ChartJS,
  Legend,
  Tooltip,
  type ChartConfiguration,
} from "chart.js";
import {
  BubbleMapController,
  GeoFeature,
  ProjectionScale,
  SizeScale,
} from "chartjs-chart-geo";
import type { Panel } from "@/lib/types/dashboard";
import { useWorldAtlas } from "@/lib/dashboard/worldAtlas";
import { formatValue, toNum } from "@/lib/dashboard/format";
import { aggregateValues } from "./aggregate";
import type { PanelProps } from "./types";

ChartJS.register(
  BubbleMapController,
  GeoFeature,
  ProjectionScale,
  SizeScale,
  Tooltip,
  Legend,
);

type SymbolMapPanelConfig = Extract<Panel, { kind: "symbol_map" }>;

const DEFAULT_MAX_RADIUS = 18;

export function SymbolMapPanel({
  config,
  rows,
}: PanelProps<SymbolMapPanelConfig>) {
  const atlas = useWorldAtlas();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<ChartJS<"bubbleMap"> | null>(null);

  const points = useMemo(() => {
    const buckets = new Map<string, { lat: number; lon: number; values: number[] }>();
    for (const row of rows) {
      const lat = toNum(row[config.lat]);
      const lon = toNum(row[config.lon]);
      if (lat === null || lon === null) continue;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
      const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { lat, lon, values: [] };
        buckets.set(key, bucket);
      }
      if (config.value) {
        const v = toNum(row[config.value]);
        bucket.values.push(v ?? 0);
      } else {
        bucket.values.push(1);
      }
    }
    const out = Array.from(buckets.values()).map((b) => ({
      longitude: b.lon,
      latitude: b.lat,
      value: aggregateValues(b.values, config.agg),
    }));
    // Larger bubbles drawn last so small ones aren't obscured.
    out.sort((a, b) => a.value - b.value);
    return out;
  }, [rows, config.lat, config.lon, config.value, config.agg]);

  useEffect(() => {
    if (!atlas || !canvasRef.current) return;
    chartRef.current?.destroy();

    const maxRadius = config.max_radius ?? DEFAULT_MAX_RADIUS;

    const chartCfg: ChartConfiguration<"bubbleMap"> = {
      type: "bubbleMap",
      data: {
        labels: points.map((p) => `${p.latitude.toFixed(2)}, ${p.longitude.toFixed(2)}`),
        datasets: [
          {
            label: config.title,
            outline: atlas.collection.features,
            showOutline: true,
            data: points,
            backgroundColor: "rgba(249, 115, 22, 0.55)",
            borderColor: "#ea580c",
            borderWidth: 0.75,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => {
                const raw = item.raw as { latitude: number; longitude: number; value: number };
                return `${raw.latitude.toFixed(2)}, ${raw.longitude.toFixed(2)}: ${formatValue(raw.value)}`;
              },
            },
          },
        },
        scales: {
          projection: {
            axis: "x",
            projection: "naturalEarth1",
          },
          size: {
            axis: "x",
            range: [2, maxRadius],
            // `area` mode means the circle *area* scales linearly with
            // value (i.e. radius ∝ sqrt(value)), which is the perceptually
            // correct encoding for proportional-symbol maps.
            mode: "area",
          },
        },
      },
    };
    chartRef.current = new ChartJS(canvasRef.current, chartCfg);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [atlas, points, config.title, config.max_radius]);

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-800">{config.title}</h3>
      <div className="relative mt-3 h-64">
        {!atlas ? (
          <div className="flex h-full items-center justify-center text-xs text-gray-400">
            Loading map…
          </div>
        ) : points.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-gray-400">
            No points
          </div>
        ) : (
          <canvas ref={canvasRef} />
        )}
      </div>
    </div>
  );
}

export default SymbolMapPanel;
