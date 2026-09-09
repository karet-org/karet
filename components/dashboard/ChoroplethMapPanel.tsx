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
  // world fit on inhabited landmass. Rings that cross the antimeridian
  // (Russia, Fiji) are shifted into 0..360 lon space, otherwise Leaflet
  // draws them as streaks across the whole map.
  const features = useMemo(() => {
    if (!atlas) return null;
    return atlas.features
      .filter((f) => String(f.id) !== "010")
      .map(unwrapAntimeridian);
  }, [atlas]);

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
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: true,
      worldCopyJump: true,
      minZoom: 1,
      maxZoom: 7,
      // Fine-grained zoom: one wheel notch is a quarter level, not a whole
      // one (Leaflet's default 60px-per-level is a big jump on a world map).
      zoomSnap: 0.25,
      zoomDelta: 0.25,
      wheelPxPerZoomLevel: 240,
      maxBoundsViscosity: 1,
      // Canvas renderer, padded well beyond the viewport: the SVG renderer
      // only paints ~10% past the edges, so dragging showed blank area
      // until dragend forced a repaint.
      preferCanvas: true,
      renderer: L.canvas({ padding: 1 }),
    });
    L.control.zoom({ position: "topright" }).addTo(map);
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
    }).addTo(map);

    // One tooltip owned by the map, repositioned and re-filled as the cursor
    // moves. Per-feature bound tooltips churn open/close on every border
    // crossing, which left the previous country's text on screen.
    const tooltip = L.tooltip({ direction: "top", offset: [0, -8], opacity: 0.95 });
    let hovered: LeafletNS.Path | null = null;

    const clearHover = () => {
      hovered?.setStyle({ weight: 0.7, color: "#3a3b42" });
      hovered = null;
    };

    layer.on("mousemove", (e: LeafletNS.LeafletMouseEvent) => {
      const lyr = (e.propagatedFrom ?? e.target) as LeafletNS.Path & { feature?: CountryFeature };
      const cf = lyr.feature;
      if (!cf) return;
      if (hovered !== lyr) {
        clearHover();
        hovered = lyr;
        lyr.setStyle({ weight: 1.5, color: "#9ca3af" });
      }
      tooltip
        .setContent(`${cf.properties?.name ?? ""}: ${formatValue(values.get(keyOf(cf)) ?? 0)}`)
        .setLatLng(e.latlng)
        .openOn(map);
    });

    layer.on("mouseout", () => {
      clearHover();
      map.closeTooltip(tooltip);
    });

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

/**
 * Shift polygon rings that span the antimeridian into 0..360 longitude
 * space so Leaflet renders them contiguously instead of as world-wide
 * horizontal bands.
 */
function unwrapAntimeridian(f: CountryFeature): CountryFeature {
  const fixRing = (ring: number[][]): number[][] => {
    const lons = ring.map((p) => p[0]);
    if (Math.max(...lons) - Math.min(...lons) <= 180) return ring;
    return ring.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]);
  };
  const g = f.geometry;
  if (g.type === "Polygon") {
    return { ...f, geometry: { ...g, coordinates: g.coordinates.map(fixRing) } };
  }
  if (g.type === "MultiPolygon") {
    return {
      ...f,
      geometry: { ...g, coordinates: g.coordinates.map((poly) => poly.map(fixRing)) },
    };
  }
  return f;
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
