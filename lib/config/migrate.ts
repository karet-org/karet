// Bring a stored config up to the current shape on read.
//
// Configs written before Dimensions replaced Lookups carry `lookup_mappings`
// and `lookup_ref` expressions, and configs written before Rollups have no
// `rollups` at all. Reading is where that gap is cheapest to close: the rest
// of the app then only ever sees the current shape, and the upgrade persists
// the next time the pipeline is saved.
//
// The mapping matches `scripts/migrate-lookups-to-dimensions.mjs`, which does
// the same job in bulk for configs the UI will not open.

import type { AstNode, Dimension, PipelineConfig } from "@/lib/types/config";

/** Shape of the fields this module knows how to upgrade. */
interface LegacyLookupRow {
  input_patterns?: string[];
  output?: string;
  priority?: number;
}

interface LegacyLookupMapping {
  id: string;
  name?: string;
  match?: string;
  case_insensitive?: boolean;
  rows?: LegacyLookupRow[];
  children?: LegacyLookupMapping[];
  catch_all?: { output?: string };
}

/** The single value column a migrated lookup produces. */
const VALUE_COLUMN = "value";

function dimensionFromLookup(lookup: LegacyLookupMapping): Dimension {
  const dimension: Dimension = {
    id: lookup.id,
    ...(lookup.name != null ? { name: lookup.name } : {}),
    match: lookup.match === "exact" ? "exact" : "keyword_substring",
    ...(lookup.case_insensitive != null
      ? { case_insensitive: lookup.case_insensitive }
      : {}),
    rows: {
      values: [VALUE_COLUMN],
      rows: (lookup.rows ?? []).map((row) => ({
        patterns: row.input_patterns ?? [],
        values: [row.output ?? ""],
        ...(row.priority ? { priority: row.priority } : {}),
      })),
    },
  };
  if (lookup.catch_all?.output != null) {
    dimension.on_miss = { literal: lookup.catch_all.output };
  }
  return dimension;
}

/**
 * Flatten a lookup tree. Dimension ids are flat, so a child keeps its own id
 * and any `lookup_ref` to the dotted path is rewritten to it below.
 */
function flattenLookups(lookups: LegacyLookupMapping[]): Dimension[] {
  const out: Dimension[] = [];
  const walk = (nodes: LegacyLookupMapping[]) => {
    for (const node of nodes) {
      out.push(dimensionFromLookup(node));
      if (node.children?.length) walk(node.children);
    }
  };
  walk(lookups);
  return out;
}

/** Rewrite `lookup_ref` to `dim_ref`, dropping any dotted path. */
function upgradeExpr(node: AstNode): AstNode {
  const entries = Object.entries(node as unknown as Record<string, unknown>);
  const out: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (key === "kind" && value === "lookup_ref") {
      out.kind = "dim_ref";
    } else if (key === "lookup_id" && typeof value === "string") {
      // A child lookup became its own dimension under the leaf id.
      out.dim_id = value.includes(".") ? value.slice(value.lastIndexOf(".") + 1) : value;
    } else if (Array.isArray(value)) {
      out[key] = value.map((v) =>
        v && typeof v === "object" ? upgradeExpr(v as AstNode) : v,
      );
    } else if (value && typeof value === "object") {
      out[key] = upgradeExpr(value as AstNode);
    } else {
      out[key] = value;
    }
  }
  return out as unknown as AstNode;
}

/**
 * True when `raw` uses a shape this module rewrites, so callers can tell an
 * upgraded config from one that was already current.
 */
export function needsUpgrade(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const cfg = raw as Record<string, unknown>;
  return "lookup_mappings" in cfg || !Array.isArray(cfg.dimensions);
}

/** Upgrade a stored config to the current shape. Idempotent. */
export function normalizePipelineConfig(raw: unknown): PipelineConfig {
  const cfg = { ...(raw as Record<string, unknown>) } as Record<string, unknown>;

  const legacy = cfg.lookup_mappings as LegacyLookupMapping[] | undefined;
  if (Array.isArray(legacy)) {
    cfg.dimensions = flattenLookups(legacy);
    delete cfg.lookup_mappings;
  }
  // `dimensions` is required by the current type, so a config that has none
  // still needs the empty array. Everything else is left exactly as stored:
  // normalising more than the legacy fields would rewrite configs that are
  // already current.
  if (!Array.isArray(cfg.dimensions)) cfg.dimensions = [];

  const mappings = Array.isArray(cfg.mappings) ? cfg.mappings : [];
  if (!Array.isArray(cfg.mappings)) return cfg as unknown as PipelineConfig;
  cfg.mappings = mappings.map((m) => {
    const mapping = { ...(m as Record<string, unknown>) };
    const columns = Array.isArray(mapping.columns) ? mapping.columns : [];
    mapping.columns = columns.map((c) => {
      const column = c as { name: string; expr: AstNode };
      return { ...column, expr: upgradeExpr(column.expr) };
    });
    if (mapping.where) mapping.where = upgradeExpr(mapping.where as AstNode);
    return mapping;
  });

  return cfg as unknown as PipelineConfig;
}
