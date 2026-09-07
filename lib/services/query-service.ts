// The single warehouse-only query path (Data page endpoint + saved-query
// dashboards). Lake sources are deliberately not exposed to user SQL.

import type { PipelineConfig } from "@/lib/types/config";
import { describeUserQuery, executeUserQuery, warehouseSource, type QueryRelation } from "@/lib/services/duckdb";

export { nameToSlug } from "@/lib/config/name-to-slug";
import { nameToSlug } from "@/lib/config/name-to-slug";

/**
 * Every analytic table as a nameable relation. Both the slugified display name
 * and the table id resolve, so renaming a table can't break SQL using the id.
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

/** Run a read-only SELECT against the pipeline's warehouse tables; `validateOnly`
 * plans without returning rows. */
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
