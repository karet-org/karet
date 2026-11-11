// Shared setup for the search routes: find the table's live files, read its
// columns, and plan the search from the request parameters.

import { describeSource, executeUserQuery, isVanishedFileError, warehouseSource } from "@/lib/services/duckdb";
import { planSearch, SEARCH_ALIAS, type SearchPlan } from "@/lib/services/search";

export type Prepared =
  | { kind: "ok"; plan: SearchPlan; run: (sql: string, values?: string[]) => Promise<Record<string, unknown>[]> }
  | { kind: "empty" }
  | { kind: "invalid"; message: string; position?: number | null };

export class SearchQueryError extends Error {}

export async function prepareSearch(pipeline: string, params: URLSearchParams): Promise<Prepared> {
  const table = params.get("table");
  if (!table) return { kind: "invalid", message: "Choose a table to search." };

  const source = await warehouseSource(pipeline, table);
  if (!source) return { kind: "empty" };

  let columns: { name: string; type: string }[];
  try {
    columns = await describeSource(source);
  } catch (err) {
    if (isVanishedFileError(err)) return { kind: "empty" };
    throw err;
  }

  const plan = planSearch(params, columns, Date.now() / 1000);
  if ("error" in plan) return { kind: "invalid", message: plan.error, position: plan.position };

  const relations = [{ slug: SEARCH_ALIAS, source }];
  const run = async (sql: string, values = plan.values) => {
    const res = await executeUserQuery(relations, sql, { values });
    if ("error" in res) throw new SearchQueryError(res.error);
    return res.rows;
  };
  return { kind: "ok", plan, run };
}
