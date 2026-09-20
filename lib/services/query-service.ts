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
export async function relationsForConfig(
  pipeline: string,
  config: PipelineConfig,
  /** Per-table version to read as of; omitted tables read what is live. */
  versions: Record<string, number> = {},
): Promise<QueryRelation[]> {
  const out: QueryRelation[] = [];
  const seen = new Set<string>();
  for (const t of config.analytic_tables) {
    // One manifest read per table, not per alias.
    const source = await warehouseSource(pipeline, t.id, versions[t.id]);
    if (!source) continue;
    for (const slug of new Set([nameToSlug(t.name), t.id])) {
      if (seen.has(slug)) continue;
      seen.add(slug);
      out.push({ slug, source });
    }
  }
  return out;
}

/**
 * A table only becomes a relation once a run has published it, so SQL naming one
 * that has never run hits DuckDB's catalog rather than anything we control. Its
 * answer ("Table with name transactions does not exist! Did you mean
 * \"duckdb_constraints\"?") is true and useless: the table is in the pipeline, it
 * just has no data. Say that instead, and keep DuckDB's wording for names that
 * really are unknown.
 */
function explainMissingRelation(
  message: string,
  config: PipelineConfig,
  relations: QueryRelation[],
): string {
  const missing = /Table with name ([A-Za-z0-9_]+) does not exist/.exec(message)?.[1];
  if (!missing) return message;

  const configured = config.analytic_tables.some(
    (t) => nameToSlug(t.name) === missing || t.id === missing,
  );
  if (configured) {
    return `Table "${missing}" has no data yet. Run the pipeline to load it.`;
  }
  const available = relations.map((r) => r.slug).sort();
  return available.length > 0
    ? `No table named "${missing}". Tables with data: ${available.join(", ")}.`
    : `No table named "${missing}", and no table has data yet. Run the pipeline first.`;
}

/** Run a read-only SELECT against the pipeline's warehouse tables; `validateOnly`
 * plans without returning rows. */
export async function runPipelineQuery(
  pipeline: string,
  config: PipelineConfig,
  sql: string,
  options: {
    validateOnly?: boolean;
    values?: (string | null)[];
    /** Per-table version to read as of; omitted tables read what is live. */
    versions?: Record<string, number>;
  } = {},
): ReturnType<typeof executeUserQuery> {
  const relations = await relationsForConfig(pipeline, config, options.versions);
  const result = await executeUserQuery(relations, sql, options);
  return "error" in result
    ? { error: explainMissingRelation(result.error, config, relations) }
    : result;
}

/** Column names a query would produce against this pipeline's warehouse. */
export async function describePipelineQuery(
  pipeline: string,
  config: PipelineConfig,
  sql: string,
) {
  return describeUserQuery(await relationsForConfig(pipeline, config), sql);
}
