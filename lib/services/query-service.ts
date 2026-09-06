// Shared query helpers: the single warehouse-only execution path used by the
// Data page's query endpoint and by dashboards backed by a saved query.
//
// Every analytic table (warehouse) is exposed to the SQL as a relation named
// by its slugified table name. Lake sources are intentionally not exposed,
// queries run against query-ready Parquet only.

import type { PipelineConfig } from "@/lib/types/config";
import { describeUserQuery, executeUserQuery, warehouseSource, type QueryRelation } from "@/lib/services/duckdb";

/** Display name to a SQL-safe identifier used as a relation name in queries. */
export function nameToSlug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "_x";
}

/** Every analytic table exposed as a warehouse relation the query can name. */
function warehouseRelations(
  pipeline: string,
  config: PipelineConfig,
): QueryRelation[] {
  return config.analytic_tables.map((t) => ({
    slug: nameToSlug(t.name),
    source: warehouseSource(pipeline, t.id),
  }));
}

/**
 * Run a user's read-only SELECT against the pipeline's warehouse tables.
 * With `validateOnly`, the query is planned but no rows are returned, used
 * to check a query is valid before saving it.
 */
export function runPipelineQuery(
  pipeline: string,
  config: PipelineConfig,
  sql: string,
  options: { validateOnly?: boolean; values?: (string | null)[] } = {},
): ReturnType<typeof executeUserQuery> {
  return executeUserQuery(warehouseRelations(pipeline, config), sql, options);
}

/** Column names a query would produce against this pipeline's warehouse. */
export function describePipelineQuery(
  pipeline: string,
  config: PipelineConfig,
  sql: string,
) {
  return describeUserQuery(warehouseRelations(pipeline, config), sql);
}
