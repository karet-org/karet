import { withRole } from "@/lib/auth/guard";
import { fieldStatsSql, fieldValuesSql } from "@/lib/services/search";
import { prepareSearch, SearchQueryError } from "@/lib/services/search-run";

/**
 * The most common values of one field among the events a search matches:
 * the search parameters plus `field=`.
 */
async function handleGet(request: Request, context: { params: Promise<{ pipeline: string }> }) {
  const { pipeline } = await context.params;
  const params = new URL(request.url).searchParams;
  const field = params.get("field");
  try {
    const prepared = await prepareSearch(pipeline, params);
    if (prepared.kind === "empty") {
      return Response.json({ field, total: 0, present: 0, distinct: 0, values: [] });
    }
    if (prepared.kind === "invalid") {
      return Response.json({ error: "invalid_search", message: prepared.message }, { status: 400 });
    }
    const { plan, run } = prepared;
    if (!field || !plan.columns.some((c) => c.name === field)) {
      return Response.json({ error: "invalid_search", message: `No field named "${field ?? ""}".` }, { status: 400 });
    }

    const [stats, values] = await Promise.all([run(fieldStatsSql(plan, field)), run(fieldValuesSql(plan, field))]);
    return Response.json({
      field,
      total: Number(stats[0]?.total ?? 0),
      present: Number(stats[0]?.present ?? 0),
      distinct: Number(stats[0]?.distinct_values ?? 0),
      values: values.map((r) => ({ value: String(r.value), count: Number(r.n) })),
    });
  } catch (err) {
    if (err instanceof SearchQueryError) {
      return Response.json({ error: "query_error", message: err.message }, { status: 400 });
    }
    console.error(`GET /api/p/${pipeline}/search/fields failed:`, err);
    return Response.json({ error: "query_error", message: (err as Error).message }, { status: 503 });
  }
}

export const GET = withRole(handleGet);
