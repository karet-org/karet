// Shared query helpers: the single warehouse-only execution path used by the
// Data page's query endpoint and by dashboards backed by a saved query.
//
// Every analytic table (warehouse) is exposed to the SQL as a relation named
// by its slugified table name. Lake sources are intentionally not exposed,
// queries run against query-ready Parquet only.

import type { PipelineConfig } from "@/lib/types/config";
import { describeUserQuery, executeUserQuery, warehouseSource, type QueryRelation } from "@/lib/services/duckdb";

export { nameToSlug } from "@/lib/config/name-to-slug";
import { nameToSlug } from "@/lib/config/name-to-slug";

/**
 * Every analytic table exposed as a warehouse relation the query can name.
 * Both the slugified display name and the table id resolve, so renaming a
 * table in the inspector cannot break SQL written against the id.
 */
export function relationsForConfig(
  pipeline: string,
  config: PipelineConfig,
): QueryRelation[] {
  const out: QueryRelation[] = [];
  const seen = new Set<string>();
  for (const t of config.analytic_tables) {
    for (const slug of new Set([nameToSlug(t.name), t.id])) {
      if (seen.has(slug)) continue;
      seen.add(slug);
      out.push({ slug, source: warehouseSource(pipeline, t.id) });
    }
  }
  return out;
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
  return executeUserQuery(relationsForConfig(pipeline, config), sql, options);
}

/** Column names a query would produce against this pipeline's warehouse. */
export function describePipelineQuery(
  pipeline: string,
  config: PipelineConfig,
  sql: string,
) {
  return describeUserQuery(relationsForConfig(pipeline, config), sql);
}
