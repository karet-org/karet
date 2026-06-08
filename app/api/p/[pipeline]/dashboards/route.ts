import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { listDashboardsWithNames } from "@/lib/services/config-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const config = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(config);

  return wrapS3Error(async () => {
    const listings = await listDashboardsWithNames(client, config);
    // `dashboards` (ids) kept for backward compatibility.
    return NextResponse.json({
      dashboards: listings.map((l) => l.id),
      listings,
    });
  }, `GET /api/p/${pipeline}/dashboards`);
}
