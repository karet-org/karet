import { withPipelineS3 } from "@/lib/config/s3-client";
import { getDashboardV2, publishDashboardV2 } from "@/lib/services/document-store";
import { fullDashboardGate } from "@/lib/services/dashboard-data";
import { withRole } from "@/lib/auth/guard";

/** Publishes a draft after the full gate (structure, SQL, bindings). */
async function handlePost(
  _request: Request,
  context: { params: Promise<{ pipeline: string; name: string }> },
) {
  const { pipeline, name } = await context.params;

  return withPipelineS3(pipeline, `POST /api/p/${pipeline}/dashboards/${name}/publish`, async (client, config) => {
    const draft = await getDashboardV2(client, config, name, { draft: true });
    if (draft === null) {
      return Response.json({ error: "draft_not_found", name }, { status: 404 });
    }
    const gate = await fullDashboardGate(client, config, pipeline, name, draft.body);
    if (!gate.ok) {
      return Response.json(
        { error: "invalid_config", errors: gate.errors },
        { status: 422 },
      );
    }
    await publishDashboardV2(client, config, name, draft.body);
    return Response.json({ ok: true, id: name });
  });
}

export const POST = withRole(handlePost);
