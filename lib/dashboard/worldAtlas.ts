// Atlas loader for the chartjs-chart-geo based map panels.
//
// Fetches `/world-110m-topo.json` (raw Natural Earth TopoJSON from
// world-atlas@2), decodes it via topojson-client into GeoJSON, caches the
// result, and exposes a React hook + lookup helpers. The decoded features
// carry ISO-3166 numeric ids as `feature.id`; the ISO-3166 lookup table
// in `./iso3166` maps user-supplied codes/names to those numeric ids.

import { useEffect, useState } from "react";
import { feature as topoFeature } from "topojson-client";
import type {
  Feature,
  FeatureCollection,
  Geometry,
} from "geojson";

/**
 * Loose structural type for the world-atlas@2 TopoJSON document. We don't
 * pull in topojson-specification just for this — the only thing we need
 * is enough shape for `topojson-client`'s `feature()` call to accept it,
 * and it takes `any` anyway at runtime.
 */
interface WorldAtlasTopology {
  type: "Topology";
  objects: {
    countries?: {
      type: string;
      geometries: unknown[];
    };
    [k: string]: unknown;
  };
}

export interface DecodedAtlas {
  /** Full list of country features with numeric ids. */
  features: Feature<Geometry, { name: string }>[];
  /** FeatureCollection — useful as the `outline` dataset for chartjs-chart-geo. */
  collection: FeatureCollection<Geometry, { name: string }>;
  /** Map from ISO numeric code (zero-padding stripped) to feature. */
  byNumeric: Map<string, Feature<Geometry, { name: string }>>;
}

let cached: Promise<DecodedAtlas> | null = null;

async function fetchAtlas(): Promise<DecodedAtlas> {
  const res = await fetch("/world-110m-topo.json");
  if (!res.ok) throw new Error(`world-110m-topo.json: ${res.status}`);
  const topo = (await res.json()) as WorldAtlasTopology;
  // The world-atlas@2 bundle nests countries under `objects.countries`.
  const countries = topo.objects.countries;
  if (!countries) {
    throw new Error("world-110m-topo.json missing `objects.countries`");
  }
  // topojson-client.feature takes both args as `any` internally; cast at
  // the call site so the strict Topology/GeometryCollection requirements
  // of its typings don't leak into our loose runtime shape.
  const collection = topoFeature(
    topo as unknown as Parameters<typeof topoFeature>[0],
    countries as unknown as Parameters<typeof topoFeature>[1],
  ) as FeatureCollection<Geometry, { name: string }>;

  const byNumeric = new Map<string, Feature<Geometry, { name: string }>>();
  for (const f of collection.features) {
    const raw = f.id;
    if (raw == null) continue;
    const key = String(raw).replace(/^0+/, "");
    byNumeric.set(key, f);
  }
  return { features: collection.features, collection, byNumeric };
}

export function loadWorldAtlas(): Promise<DecodedAtlas> {
  if (!cached) {
    cached = fetchAtlas().catch((err) => {
      cached = null; // Reset so subsequent calls retry.
      throw err;
    });
  }
  return cached;
}

export function useWorldAtlas(): DecodedAtlas | null {
  const [atlas, setAtlas] = useState<DecodedAtlas | null>(null);
  useEffect(() => {
    let alive = true;
    loadWorldAtlas()
      .then((a) => {
        if (alive) setAtlas(a);
      })
      .catch((err) => {
        console.error("failed to load world atlas:", err);
      });
    return () => {
      alive = false;
    };
  }, []);
  return atlas;
}
