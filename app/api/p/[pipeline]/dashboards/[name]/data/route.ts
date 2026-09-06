import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";
import {
  getDashboardV2,
  getPipelineConfig,
  getQuery,
} from "@/lib/services/config-service";
import { coerceParams, executeDashboard } from "@/lib/services/dashboard-data";
import type { SavedQuery } from "@/lib/types/query";

export const dynamic = "force-dynamic";

/** Batch data fetch for a v2 dashboard: all panel queries plus dropdown options. */
export async function POST(
  request: Request,
  context: { params: Promise<{ pipeline: string; name: string }> },
) {
  const { pipeline, name } = await context.params;
  const config = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(config);
  const draft = new URL(request.url).searchParams.get("draft") === "1";

  const body = (await request.json().catch(() => ({}))) as { params?: unknown };

  return wrapS3Error(async () => {
    const [dash, pipelineCfg] = await Promise.all([
      getDashboardV2(client, config, name, { draft }),
      getPipelineConfig(client, config),
    ]);
    if (!dash) {
      return NextResponse.json({ error: "dashboard_not_found", name }, { status: 404 });
    }
    if (!dash.config) {
      return NextResponse.json(
        { error: "invalid_config", message: "Stored config does not validate" },
        { status: 422 },
      );
    }
    if (!pipelineCfg) {
      return NextResponse.json({ error: "pipeline_not_found" }, { status: 404 });
    }

    const referenced = [
      ...new Set(
        dash.config.panels.flatMap((p) => (p.query_id ? [p.query_id] : [])),
      ),
    ];
    const savedQueries = new Map<string, SavedQuery>();
    await Promise.all(
      referenced.map(async (id) => {
        const q = await getQuery(client, config, id);
        if (q) savedQueries.set(id, q);
      }),
    );

    const params = coerceParams(dash.config, body.params);
    const data = await executeDashboard(
      pipeline,
      pipelineCfg.config,
      dash.config,
      params,
      savedQueries,
    );
    return NextResponse.json(data);
  }, `POST /api/p/${pipeline}/dashboards/${name}/data`);
}
