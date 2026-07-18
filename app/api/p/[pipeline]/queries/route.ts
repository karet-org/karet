// Saved queries for a pipeline. GET lists them; POST creates a new one from
// a unique name + SQL. Named queries can be referenced from a dashboard
// config via `query_id`.

import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { TargetExistsError, getPipelineConfig, listQueries, putQuery } from "@/lib/services/config-service";
import { nameToSlug, runPipelineQuery } from "@/lib/services/query-service";
import type { SavedQuery } from "@/lib/types/query";

export async function GET(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const config = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(config);

  return wrapS3Error(async () => {
    const queries = await listQueries(client, config);
    return NextResponse.json({ queries });
  }, `GET /api/p/${pipeline}/queries`);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const config = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(config);

  const body = (await request.json().catch(() => null)) as
    | { name?: string; sql?: string }
    | null;
  const name = body?.name?.trim();
  const sql = body?.sql?.trim();
  if (!name || !sql) {
    return NextResponse.json(
      { error: "missing_fields", message: "Request body must include `name` and `sql`." },
      { status: 422 },
    );
  }

  const id = nameToSlug(name);
  const query: SavedQuery = { id, name, sql };

  return wrapS3Error(async () => {
    const pcfg = await getPipelineConfig(client, config);
    if (!pcfg) {
      return NextResponse.json({ error: "pipeline_not_found" }, { status: 404 });
    }

    // Reject a query that doesn't plan cleanly (bad syntax, unknown table or
    // column, non-SELECT) before persisting it, so a saved query is always
    // runnable and safe to reference from a dashboard.
    const check = await runPipelineQuery(pipeline, pcfg.config, sql, { validateOnly: true });
    if ("error" in check) {
      return NextResponse.json(
        { error: "invalid_query", message: check.error },
        { status: 400 },
      );
    }

    try {
      await putQuery(client, config, query);
    } catch (err) {
      if (err instanceof TargetExistsError) {
        return NextResponse.json(
          { error: "name_taken", message: err.message },
          { status: 409 },
        );
      }
      throw err;
    }
    return NextResponse.json(query, { status: 201 });
  }, `POST /api/p/${pipeline}/queries`);
}
