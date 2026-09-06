import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";
import {
  deleteDashboardV2,
  getDashboardV2,
  putDashboardV2,
} from "@/lib/services/config-service";
import { validateDashboardV2 } from "@/lib/types/dashboard-v2";

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
      const draft = await getDashboardV2(client, config, name, { draft: true });
      if (draft !== null) {
        return new NextResponse(draft.body, {
          headers: { "Content-Type": "application/yaml", "X-Karet-Draft": "1" },
        });
      }
    }
    const dashboard = await getDashboardV2(client, config, name);
    if (dashboard === null) {
      return NextResponse.json({ error: "dashboard_not_found", name }, { status: 404 });
    }
    return new NextResponse(dashboard.body, {
      headers: { "Content-Type": "application/yaml" },
    });
  }, `GET /api/p/${pipeline}/dashboards/${name}`);
}

/** Saves a dashboard body. `?draft=1` skips validation (mid-edit). */
export async function PUT(
  request: Request,
  context: { params: Promise<{ pipeline: string; name: string }> },
) {
  const { pipeline, name } = await context.params;
  const config = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(config);
  const draft = new URL(request.url).searchParams.get("draft") === "1";

  const body = await request.text();
  if (!draft) {
    const result = validateDashboardV2(body);
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
    await putDashboardV2(client, config, name, body, { draft });
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
    await deleteDashboardV2(client, config, name);
    return NextResponse.json({ ok: true });
  }, `DELETE /api/p/${pipeline}/dashboards/${name}`);
}
