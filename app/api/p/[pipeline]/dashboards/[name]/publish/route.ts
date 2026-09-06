import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";
import {
  getDashboardV2,
  getPipelineConfig,
  getQuery,
  publishDashboardV2,
} from "@/lib/services/config-service";
import { validateDashboardSql } from "@/lib/services/dashboard-data";
import { validateDashboardV2 } from "@/lib/types/dashboard-v2";
import type { SavedQuery } from "@/lib/types/query";

/**
 * Publishes a draft after the full gate: YAML parses, structure
 * validates, every query plans against the warehouse, and every
 * binding names a returned column.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ pipeline: string; name: string }> },
) {
  const { pipeline, name } = await context.params;
  const config = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(config);

  return wrapS3Error(async () => {
    const draft = await getDashboardV2(client, config, name, { draft: true });
    if (draft === null) {
      return NextResponse.json({ error: "draft_not_found", name }, { status: 404 });
    }
    const result = validateDashboardV2(draft.body);
    if (!result.ok) {
      return NextResponse.json(
        { error: "invalid_config", errors: result.errors },
        { status: 422 },
      );
    }
    if (result.config.id !== name) {
      return NextResponse.json(
        { error: "id_mismatch", message: `Config id "${result.config.id}" must match "${name}"` },
        { status: 422 },
      );
    }

    const pipelineCfg = await getPipelineConfig(client, config);
    if (!pipelineCfg) {
      return NextResponse.json({ error: "pipeline_not_found" }, { status: 404 });
    }
    const referenced = [
      ...new Set(result.config.panels.flatMap((p) => (p.query_id ? [p.query_id] : []))),
    ];
    const savedQueries = new Map<string, SavedQuery>();
    await Promise.all(
      referenced.map(async (id) => {
        const q = await getQuery(client, config, id);
        if (q) savedQueries.set(id, q);
      }),
    );
    const sqlErrors = await validateDashboardSql(
      pipeline,
      pipelineCfg.config,
      result.config,
      savedQueries,
    );
    if (sqlErrors.length > 0) {
      return NextResponse.json(
        { error: "invalid_config", errors: sqlErrors },
        { status: 422 },
      );
    }

    await publishDashboardV2(client, config, name, draft.body);
    return NextResponse.json({ ok: true, id: name });
  }, `POST /api/p/${pipeline}/dashboards/${name}/publish`);
}
