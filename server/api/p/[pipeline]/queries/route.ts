// Saved queries for a pipeline. GET lists them; POST creates a new one from
// a unique name + SQL. Named queries can be referenced from a dashboard
// config via `query_id`.

import { withPipelineS3 } from "@/lib/config/s3-client";
import {
  TargetExistsError,
  listQueries,
  putQuery,
} from "@/lib/services/document-store";
import { nameToSlug, runPipelineQuery } from "@/lib/services/query-service";
import type { SavedQuery } from "@/lib/types/query";
import { withRole } from "@/lib/auth/guard";
import { getLiveConfig } from "@/lib/services/pipeline-store";

async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;

  return withPipelineS3(pipeline, `GET /api/p/${pipeline}/queries`, async (client, config) => {
    const queries = await listQueries(client, config);
    return Response.json({ queries });
  });
}

async function handlePost(
  request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;

  const body = (await request.json().catch(() => null)) as
    | { name?: string; sql?: string }
    | null;
  const name = body?.name?.trim();
  const sql = body?.sql?.trim();
  if (!name || !sql) {
    return Response.json(
      { error: "missing_fields", message: "Request body must include `name` and `sql`." },
      { status: 422 },
    );
  }

  const id = nameToSlug(name);
  const query: SavedQuery = { id, name, sql };

  return withPipelineS3(pipeline, `POST /api/p/${pipeline}/queries`, async (client, config) => {
    const pcfg = await getLiveConfig(pipeline);
    if (!pcfg) {
      return Response.json({ error: "pipeline_not_found" }, { status: 404 });
    }

    // Reject a query that doesn't plan cleanly (bad syntax, unknown table or
    // column, non-SELECT) before persisting it, so a saved query is always
    // runnable and safe to reference from a dashboard.
    const check = await runPipelineQuery(pipeline, pcfg.config, sql, { validateOnly: true });
    if ("error" in check) {
      return Response.json(
        { error: "invalid_query", message: check.error },
        { status: 400 },
      );
    }

    try {
      await putQuery(client, config, query);
    } catch (err) {
      if (err instanceof TargetExistsError) {
        return Response.json(
          { error: "name_taken", message: err.message },
          { status: 409 },
        );
      }
      throw err;
    }
    return Response.json(query, { status: 201 });
  });
}

export const GET = withRole(handleGet);
export const POST = withRole(handlePost);
