import { newId } from "@/lib/config/id";
import { withPipelineS3 } from "@/lib/config/s3-client";
import {
  getDashboardV2,
  listDashboardsWithNamesV2,
  listDraftDashboardsV2,
  putDashboardV2,
} from "@/lib/services/document-store";
import { templateV2 } from "@/lib/types/dashboard-v2";
import { withRole } from "@/lib/auth/guard";

const ID_RE = /^[a-z0-9][a-z0-9-_]*$/;

async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;

  return withPipelineS3(pipeline, `GET /api/p/${pipeline}/dashboards`, async (client, config) => {
    const [listings, draftIds] = await Promise.all([
      listDashboardsWithNamesV2(client, config),
      listDraftDashboardsV2(client, config),
    ]);
    const published = new Set(listings.map((l) => l.id));
    const drafts = draftIds.filter((id) => !published.has(id));
    return Response.json({
      dashboards: listings.map((l) => l.id),
      listings,
      drafts,
    });
  });
}

/** Creates a new draft dashboard from the v2 YAML template. */
async function handlePost(
  request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;

  const body = (await request.json().catch(() => ({}))) as { id?: string };
  const id = body.id ?? newId("dash");
  if (!ID_RE.test(id)) {
    return Response.json({ error: "invalid_id" }, { status: 422 });
  }

  return withPipelineS3(pipeline, `POST /api/p/${pipeline}/dashboards`, async (client, config) => {
    if ((await getDashboardV2(client, config, id, { draft: true })) !== null) {
      return Response.json({ error: "draft_exists", id }, { status: 409 });
    }
    await putDashboardV2(client, config, id, templateV2(id), { draft: true });
    return Response.json({ ok: true, id }, { status: 201 });
  });
}

export const GET = withRole(handleGet);
export const POST = withRole(handlePost);
