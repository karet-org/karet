import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";
import {
  listDashboardsWithNames,
  listDraftDashboards,
  getDraftDashboard,
  putDashboard,
} from "@/lib/services/config-service";

const ID_RE = /^[a-z0-9][a-z0-9-_]*$/;

export async function GET(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const config = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(config);

  return wrapS3Error(async () => {
    const [listings, draftIds] = await Promise.all([
      listDashboardsWithNames(client, config),
      listDraftDashboards(client, config),
    ]);
    const published = new Set(listings.map((l) => l.id));
    const drafts = draftIds.filter((id) => !published.has(id));
    // `dashboards` (ids) kept for backward compatibility.
    return NextResponse.json({
      dashboards: listings.map((l) => l.id),
      listings,
      drafts,
    });
  }, `GET /api/p/${pipeline}/dashboards`);
}

/** Creates a new draft dashboard from a starter template. */
export async function POST(
  request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const config = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(config);

  const body = (await request.json().catch(() => ({}))) as { id?: string };
  const id = body.id ?? `dashboard-${Date.now()}`;
  if (!ID_RE.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 422 });
  }

  return wrapS3Error(async () => {
    if ((await getDraftDashboard(client, config, id)) !== null) {
      return NextResponse.json({ error: "draft_exists", id }, { status: 409 });
    }
    const template = {
      id,
      name: "Untitled dashboard",
      analytic_table_id: "",
      filters: [],
      panels: [],
    };
    await putDashboard(client, config, id, JSON.stringify(template, null, 2), {
      draft: true,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  }, `POST /api/p/${pipeline}/dashboards`);
}
