// Runs a user's SQL against the pipeline's warehouse tables via DuckDB. Each
// analytic table is exposed as a relation the query can name by its
// slugified table name.

import { wrapS3Error } from "@/lib/config/s3-client";

import { runPipelineQuery } from "@/lib/services/query-service";
import { withRole } from "@/lib/auth/guard";
import { getLiveConfig } from "@/lib/services/pipeline-store";

const MAX_QUERY_LIMIT = 10_000;

async function handlePost(
  request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;

  const body = (await request.json().catch(() => null)) as {
    sql?: string;
    /** Read a table as of a retained version: `{ "requests": 3 }`. */
    versions?: Record<string, number>;
    /** Return at most this many rows, and say whether there were more. */
    limit?: number;
  } | null;
  const sql = body?.sql?.trim();
  if (!sql) {
    return Response.json(
      { error: "missing_sql", message: "Request body must include a `sql` field." },
      { status: 422 },
    );
  }

  if (sql.length > 10_000) {
    return Response.json(
      { error: "query_too_long", message: "SQL query exceeds 10 000 character limit." },
      { status: 422 },
    );
  }

  const limit = body?.limit;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > MAX_QUERY_LIMIT)) {
    return Response.json(
      { error: "invalid_limit", message: `limit must be between 1 and ${MAX_QUERY_LIMIT}.` },
      { status: 422 },
    );
  }

  return wrapS3Error(async () => {
    const pcfg = await getLiveConfig(pipeline);
    if (!pcfg) {
      return Response.json({ error: "pipeline_not_found" }, { status: 404 });
    }

    // One extra row tells a capped result apart from one that fit exactly.
    const capped = limit === undefined ? sql : `SELECT * FROM (${sql}\n) LIMIT ${limit + 1}`;
    const result = await runPipelineQuery(pipeline, pcfg.config, capped, {
      versions: body?.versions,
    });

    if ("error" in result) {
      return Response.json({ error: "query_error", message: result.error }, { status: 400 });
    }

    const truncated = limit !== undefined && result.rows.length > limit;
    const rows = truncated ? result.rows.slice(0, limit) : result.rows;
    return Response.json({
      columns: result.columns,
      rows,
      rowCount: rows.length,
      truncated,
    });
  }, `POST /api/p/${pipeline}/query`);
}

export const POST = withRole(handlePost);
