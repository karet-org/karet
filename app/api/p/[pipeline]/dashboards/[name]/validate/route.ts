import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { fullDashboardGate } from "@/lib/services/dashboard-data";

/**
 * Advisory full-gate validation for the editor: always 200, with the
 * gate's verdict in the body. The binding PUT/publish routes enforce.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ pipeline: string; name: string }> },
) {
  const { pipeline, name } = await context.params;
  const config = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(config);
  const body = await request.text();

  return wrapS3Error(async () => {
    const gate = await fullDashboardGate(client, config, pipeline, name, body);
    return NextResponse.json(gate);
  }, `POST /api/p/${pipeline}/dashboards/${name}/validate`);
}
