import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { getDashboard } from "@/lib/services/config-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ pipeline: string; name: string }> },
) {
  const { pipeline, name } = await context.params;
  const config = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(config);

  return wrapS3Error(async () => {
    const dashboard = await getDashboard(client, config, name);
    if (dashboard === null) {
      return NextResponse.json({ error: "dashboard_not_found", name }, { status: 404 });
    }
    return NextResponse.json(dashboard);
  }, `GET /api/p/${pipeline}/dashboards/${name}`);
}
