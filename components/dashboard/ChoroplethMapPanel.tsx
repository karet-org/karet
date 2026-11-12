// Interactive world choropleth on Leaflet: country polygons as a GeoJSON
// vector layer (no tile basemap), with pan/zoom, hover highlight, value
// tooltips and a colour legend. Rows are bucketed by ISO-3166 numeric code via
// resolveCountry() so alpha-2/alpha-3/numeric/name data all work.

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import type { Feature, Geometry } from "geojson";
import type { PanelV2 } from "@/lib/types/dashboard-v2";
import { resolveCountry } from "@/lib/dashboard/iso3166";
import { useWorldAtlas } from "@/lib/dashboard/worldAtlas";
import { toNum } from "@/lib/dashboard/format";
import {
  fillFor,
  legendGradient,
  legendTicks,
  NO_DATA_FILL,
  ranks,
  skippedSummary,
  tooltipText,
  valueRange,
} from "@/lib/dashboard/choropleth";
import { chartAreaProps, panelCardClass } from "./types";
import type { PanelProps } from "./types";
import "leaflet/dist/leaflet.css";

type ChoroplethMapPanelConfig = Extract<PanelV2, { kind: "choropleth_map" }>;

type CountryFeature = Feature<Geometry, { name: string }>;

function ChoroplethMapPanel({ config, data }: PanelProps<ChoroplethMapPanelConfig>) {
  const atlas = useWorldAtlas();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);

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

  const stats = useMemo(() => {
    const values = new Map<string, number>();
    // Values the map cannot place: unknown names, and countries too small for
    // the 110m atlas (Singapore, Hong Kong). They still count in the total, so
    // a country's share is of everything the query returned.
    const skipped = new Set<string>();
    let total = 0;
    for (const row of data.rows) {
      const raw = row[config.region];
      const v = toNum(row[config.value]) ?? 0;
      const entry = resolveCountry(raw);
      if (!entry) {
        if (raw != null) {
          skipped.add(String(raw));
          total += v;
        }
        continue;
      }
      const key = entry.numeric.replace(/^0+/, "");
      values.set(key, (values.get(key) ?? 0) + v);
      total += v;
    }
    const range = valueRange(values.values());
    return { values, range, total, skipped: [...skipped].sort(), ranks: ranks(values) };
  }, [data.rows, config.region, config.value]);

  // The tooltip handler is bound once with the map, so it reads the latest
  // values through a ref rather than the values it was created with.
  const statsRef = useRef(stats);
  statsRef.current = stats;

  // Build the map once per atlas. A filter change only restyles the countries
  // (below), so the zoom and pan the reader chose are kept.
  useEffect(() => {
    if (!features || !containerRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
      worldCopyJump: true,
      minZoom: 1,
      maxZoom: 7,
      // One mouse wheel notch or one + click is a whole zoom level, so the
      // world view to the zoom limit is six steps; at a quarter level per
      // click it was 24. 80px per level gives one level for Chromium's
      // 100px notch, measured. zoomSnap stays fine so a trackpad's small
      // scroll deltas still zoom smoothly instead of rounding to nothing.
      zoomSnap: 0.25,
      zoomDelta: 1,
      wheelPxPerZoomLevel: 80,
      maxBoundsViscosity: 1,
      // SVG renderer: hover hit-testing is native, where Leaflet's canvas
      // renderer throttles it to 32ms and the tooltip visibly trails the
      // cursor. Padded a full viewport because the default 10% margin left
      // unpainted map visible while dragging.
      renderer: L.svg({ padding: 1 }),
    });
    L.control.zoom({ position: "topright" }).addTo(map);

    const layer = L.geoJSON(features as CountryFeature[], {
      style: () => ({ fillColor: NO_DATA_FILL, fillOpacity: 1, color: BORDER, weight: 0.7 }),
    }).addTo(map);

    // One tooltip owned by the map, repositioned and re-filled as the cursor
    // moves. Per-feature bound tooltips churn open/close on every border
    // crossing, which left the previous country's text on screen.
    const tooltip = L.tooltip({ direction: "top", offset: [0, -8], opacity: 0.95 });
    let hovered: L.Path | null = null;

    const clearHover = () => {
      hovered?.setStyle({ weight: 0.7, color: BORDER });
      hovered = null;
    };

    layer.on("mousemove", (e: L.LeafletMouseEvent) => {
      const lyr = (e.propagatedFrom ?? e.target) as L.Path & { feature?: CountryFeature };
      const cf = lyr.feature;
      if (!cf) return;
      if (hovered !== lyr) {
        clearHover();
        hovered = lyr;
        lyr.setStyle({ weight: 1.5, color: "#9ca3af" });
      }
      const { values, ranks: rankOf, total } = statsRef.current;
      const key = keyOf(cf);
      tooltip
        .setContent(
          tooltipText(cf.properties?.name ?? "", values.get(key), rankOf.get(key), total, values.size),
        )
        .setLatLng(e.latlng)
        .openOn(map);
    });

    layer.on("mouseout", () => {
      clearHover();
      map.closeTooltip(tooltip);
    });

    // Double-click returns to the whole world instead of zooming in.
    const bounds = layer.getBounds();
    map.doubleClickZoom.disable();
    map.on("dblclick", () => map.fitBounds(bounds, { padding: [4, 4] }));
    map.fitBounds(bounds, { padding: [4, 4] });
    map.setMaxBounds(bounds.pad(0.25));

    mapRef.current = map;
    layerRef.current = layer;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [features]);

  useEffect(() => {
    const { values, range } = stats;
    layerRef.current?.setStyle((f) => ({
      fillColor: fillFor(values.get(keyOf(f as CountryFeature)), range?.min ?? 0, range?.max ?? 0),
    }));
  }, [stats, features]);

  const ticks = stats.range ? legendTicks(stats.range.min, stats.range.max) : [];

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
      {ticks.length > 0 && (
        <div data-testid="choropleth-legend" className="mt-3 flex items-start gap-4 text-[11px] text-[color:var(--color-ink-3)]">
          <div className="flex items-center gap-1.5 pt-0.5">
            <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: NO_DATA_FILL }} />
            No data
          </div>
          <div className="relative flex-1 pb-4">
            <div className="h-2.5 rounded-sm" style={{ background: legendGradient() }} />
            {ticks.map((t) => (
              <span
                key={t.label}
                // End labels align to the bar's edges instead of overhanging them.
                className={`absolute top-3.5 ${
                  t.position === 0 ? "" : t.position === 1 ? "-translate-x-full" : "-translate-x-1/2"
                }`}
                style={{ left: `${t.position * 100}%` }}
              >
                {t.label}
              </span>
            ))}
          </div>
        </div>
      )}
      {stats.skipped.length > 0 && (
        <p
          className="mt-2 text-[11px] text-[color:var(--color-amber-deep)]"
          title={stats.skipped.join(", ")}
        >
          Not on the map: {skippedSummary(stats.skipped)}
        </p>
      )}
    </div>
  );
}

const BORDER = "#3a3b42";

function keyOf(f: CountryFeature): string {
  return f.id != null ? String(f.id).replace(/^0+/, "") : "";
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

export default ChoroplethMapPanel;
