import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";
import {
  deleteDashboard,
  getDashboard,
  getDraftDashboard,
  putDashboard,
} from "@/lib/services/config-service";
import { validateDashboardConfig } from "@/lib/services/dashboard-validation";

export async function GET(
  request: Request,
  context: { params: Promise<{ pipeline: string; name: string }> },
) {
  const { pipeline, name } = await context.params;
  const config = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(config);
  const wantDraft = new URL(request.url).searchParams.get("draft") === "1";

  return wrapS3Error(async () => {
    if (wantDraft) {
      const draft = await getDraftDashboard(client, config, name);
      if (draft !== null) {
        return new NextResponse(draft, {
          headers: { "Content-Type": "application/json", "X-Karet-Draft": "1" },
        });
      }
    }
    const dashboard = await getDashboard(client, config, name);
    if (dashboard === null) {
      return NextResponse.json({ error: "dashboard_not_found", name }, { status: 404 });
    }
    return NextResponse.json(dashboard);
  }, `GET /api/p/${pipeline}/dashboards/${name}`);
}

/**
 * Saves a dashboard body. `?draft=1` writes to the drafts prefix with no
 * validation gate (drafts may be mid-edit); otherwise the body must
 * validate and replaces the published config directly.
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ pipeline: string; name: string }> },
) {
  const { pipeline, name } = await context.params;
  const config = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(config);
  const draft = new URL(request.url).searchParams.get("draft") === "1";

  const body = await request.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 422 });
  }
  if (!draft) {
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
  }

  return wrapS3Error(async () => {
    await putDashboard(client, config, name, body, { draft });
    return NextResponse.json({ ok: true, draft });
  }, `PUT /api/p/${pipeline}/dashboards/${name}`);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ pipeline: string; name: string }> },
) {
  const { pipeline, name } = await context.params;
  const config = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(config);

  return wrapS3Error(async () => {
    await deleteDashboard(client, config, name);
    return NextResponse.json({ ok: true });
  }, `DELETE /api/p/${pipeline}/dashboards/${name}`);
}
