// Runs a user's SQL against the pipeline's warehouse tables via DuckDB. Each
// analytic table is exposed as a relation the query can name by its
// slugified table name.

import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { getPipelineConfig } from "@/lib/services/config-service";
import { runPipelineQuery } from "@/lib/services/query-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const base = loadS3Config();
  const cfg = pipelineS3Config(base, pipeline);
  const client = createS3Client(base);

  const body = (await request.json().catch(() => null)) as { sql?: string } | null;
  const sql = body?.sql?.trim();
  if (!sql) {
    return NextResponse.json(
      { error: "missing_sql", message: "Request body must include a `sql` field." },
      { status: 422 },
    );
  }

  if (sql.length > 10_000) {
    return NextResponse.json(
      { error: "query_too_long", message: "SQL query exceeds 10 000 character limit." },
      { status: 422 },
    );
  }

  return wrapS3Error(async () => {
    const pcfg = await getPipelineConfig(client, cfg);
    if (!pcfg) {
      return NextResponse.json({ error: "pipeline_not_found" }, { status: 404 });
    }

    const result = await runPipelineQuery(pipeline, pcfg.config, sql);

    if ("error" in result) {
      return NextResponse.json({ error: "query_error", message: result.error }, { status: 400 });
    }

    return NextResponse.json({
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rows.length,
    });
  }, `POST /api/p/${pipeline}/query`);
}
