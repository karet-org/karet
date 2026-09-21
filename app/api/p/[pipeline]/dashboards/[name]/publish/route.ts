import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { getDashboardV2, publishDashboardV2 } from "@/lib/services/document-store";
import { fullDashboardGate } from "@/lib/services/dashboard-data";
import { withRole } from "@/lib/auth/guard";

/** Publishes a draft after the full gate (structure, SQL, bindings). */
async function handlePost(
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
    const gate = await fullDashboardGate(client, config, pipeline, name, draft.body);
    if (!gate.ok) {
      return NextResponse.json(
        { error: "invalid_config", errors: gate.errors },
        { status: 422 },
      );
    }
    await publishDashboardV2(client, config, name, draft.body);
    return NextResponse.json({ ok: true, id: name });
  }, `POST /api/p/${pipeline}/dashboards/${name}/publish`);
}

export const POST = withRole(handlePost);
