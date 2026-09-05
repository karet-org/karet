import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";
import {
  getDraftDashboard,
  publishDashboard,
} from "@/lib/services/config-service";
import { validateDashboardConfig } from "@/lib/services/dashboard-validation";

/**
 * Publishes a draft dashboard. The gate: the draft must parse and pass
 * structural validation, and its id must match the URL. Invalid configs
 * cannot be published.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ pipeline: string; name: string }> },
) {
  const { pipeline, name } = await context.params;
  const config = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(config);

  return wrapS3Error(async () => {
    const body = await getDraftDashboard(client, config, name);
    if (body === null) {
      return NextResponse.json({ error: "draft_not_found", name }, { status: 404 });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return NextResponse.json(
        { error: "invalid_config", errors: ["Draft is not valid JSON"] },
        { status: 422 },
      );
    }
    const result = validateDashboardConfig(parsed);
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
    await publishDashboard(client, config, name, body);
    return NextResponse.json({ ok: true, id: name });
  }, `POST /api/p/${pipeline}/dashboards/${name}/publish`);
}
