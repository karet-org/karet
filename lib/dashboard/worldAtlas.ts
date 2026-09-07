// Atlas loader for the chartjs-chart-geo map panels.
//
// Fetches `/world-110m-topo.json` (world-atlas@2 Natural Earth TopoJSON) and
// decodes it to GeoJSON, cached. Features carry ISO-3166 numeric ids as
// `feature.id`, which `./iso3166` resolves user-supplied codes/names to.

import { useEffect, useState } from "react";
import { feature as topoFeature } from "topojson-client";
import type {
  Feature,
  FeatureCollection,
  Geometry,
} from "geojson";

/** Loose shape of the world-atlas@2 TopoJSON, enough for `topoFeature()`. */
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
  features: Feature<Geometry, { name: string }>[];
  /** Useful as the `outline` dataset for chartjs-chart-geo. */
  collection: FeatureCollection<Geometry, { name: string }>;
  /** Keyed by ISO numeric code with zero-padding stripped. */
  byNumeric: Map<string, Feature<Geometry, { name: string }>>;
}

let cached: Promise<DecodedAtlas> | null = null;

async function fetchAtlas(): Promise<DecodedAtlas> {
  const res = await fetch("/world-110m-topo.json");
  if (!res.ok) throw new Error(`world-110m-topo.json: ${res.status}`);
  const topo = (await res.json()) as WorldAtlasTopology;
  const countries = topo.objects.countries;
  if (!countries) {
    throw new Error("world-110m-topo.json missing `objects.countries`");
  }
  // topoFeature takes both args as `any` at runtime; cast so its strict
  // Topology typings don't leak into our loose shape.
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

function loadWorldAtlas(): Promise<DecodedAtlas> {
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
