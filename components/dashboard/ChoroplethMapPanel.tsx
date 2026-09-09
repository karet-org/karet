"use client";

// Interactive world choropleth on Leaflet: country polygons as a GeoJSON
// vector layer (no tile basemap), with pan/zoom, hover highlight, and
// value tooltips. Rows are bucketed by ISO-3166 numeric code via
// resolveCountry() so alpha-2/alpha-3/numeric/name data all work.

import { useEffect, useMemo, useRef } from "react";
import type * as LeafletNS from "leaflet";
import type { Feature, Geometry } from "geojson";
import type { PanelV2 } from "@/lib/types/dashboard-v2";
import { resolveCountry } from "@/lib/dashboard/iso3166";
import { useWorldAtlas } from "@/lib/dashboard/worldAtlas";
import { formatValue, toNum } from "@/lib/dashboard/format";
import { chartAreaProps, panelCardClass } from "./types";
import type { PanelProps } from "./types";
import "leaflet/dist/leaflet.css";

type ChoroplethMapPanelConfig = Extract<PanelV2, { kind: "choropleth_map" }>;

type CountryFeature = Feature<Geometry, { name: string }>;

function ChoroplethMapPanel({ config, data }: PanelProps<ChoroplethMapPanelConfig>) {
  const atlas = useWorldAtlas();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);

  // Antarctica (ISO numeric 010) is empty map area; dropping it keeps the
  // world fit on inhabited landmass.
  const features = useMemo(
    () => atlas?.features.filter((f) => String(f.id) !== "010") ?? null,
    [atlas],
  );

  const { values, max, unresolved } = useMemo(() => {
    const values = new Map<string, number>();
    let unresolved = 0;
    for (const row of data.rows) {
      const raw = row[config.region];
      const entry = resolveCountry(raw);
      if (!entry) {
        if (raw != null) unresolved++;
        continue;
      }
      const key = entry.numeric.replace(/^0+/, "");
      values.set(key, (values.get(key) ?? 0) + (toNum(row[config.value]) ?? 0));
    }
    let max = 0;
    for (const v of values.values()) if (v > max) max = v;
    return { values, max, unresolved };
  }, [data.rows, config.region, config.value]);

  useEffect(() => {
    if (!features || !containerRef.current) return;
    // Required, not imported: Leaflet touches `window` at module scope.
    const L = require("leaflet") as typeof LeafletNS;

    mapRef.current?.remove();
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
      worldCopyJump: true,
      minZoom: 1,
      maxZoom: 7,
      zoomSnap: 0.25,
      maxBoundsViscosity: 1,
    });
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution("Natural Earth");

    const keyOf = (f: CountryFeature) =>
      f.id != null ? String(f.id).replace(/^0+/, "") : "";

    const layer = L.geoJSON(features as CountryFeature[], {
      style: (f) => {
        const v = values.get(keyOf(f as CountryFeature)) ?? 0;
        return {
          fillColor: colorFor(v, max),
          fillOpacity: 1,
          color: "#3a3b42", // country borders
          weight: 0.7,
        };
      },
      onEachFeature: (f, lyr) => {
        const cf = f as CountryFeature;
        const v = values.get(keyOf(cf)) ?? 0;
        lyr.bindTooltip(
          `${cf.properties?.name ?? ""}: ${formatValue(v)}`,
          { sticky: true, direction: "top", opacity: 0.95 },
        );
        lyr.on("mouseover", () => (lyr as LeafletNS.Path).setStyle({ weight: 1.5, color: "#9ca3af" }));
        lyr.on("mouseout", () => (lyr as LeafletNS.Path).setStyle({ weight: 0.7, color: "#3a3b42" }));
      },
    }).addTo(map);

    const bounds = layer.getBounds();
    map.fitBounds(bounds, { padding: [4, 4] });
    map.setMaxBounds(bounds.pad(0.25));

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [features, values, max]);

  return (
    <div className={panelCardClass()}>
      <h3 className="text-sm font-semibold text-[color:var(--color-leaf-deep)]">{config.title}</h3>
      <div {...chartAreaProps(config)}>
        {!atlas ? (
          <div className="flex h-full items-center justify-center text-xs text-[color:var(--color-ink-3)]">
            Loading map…
          </div>
        ) : (
          <div ref={containerRef} className="karet-map h-full w-full rounded-lg" />
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

// Blue ramp over a neutral zero fill, matching the previous chart colors.
function colorFor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return "#404148";
  const t = Math.min(1, Math.sqrt(value / max));
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
  return `rgb(${r}, ${g}, ${b})`;
}

export default ChoroplethMapPanel;
