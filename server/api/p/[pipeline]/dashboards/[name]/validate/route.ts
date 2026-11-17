import { withPipelineS3 } from "@/lib/config/s3-client";
import { fullDashboardGate } from "@/lib/services/dashboard-data";
import { withRole } from "@/lib/auth/guard";

/**
 * Advisory full-gate validation for the editor: always 200, with the
 * gate's verdict in the body. The binding PUT/publish routes enforce.
 */
async function handlePost(
  request: Request,
  context: { params: Promise<{ pipeline: string; name: string }> },
) {
  const { pipeline, name } = await context.params;
  const body = await request.text();

  return withPipelineS3(pipeline, `POST /api/p/${pipeline}/dashboards/${name}/validate`, async (client, config) => {
    const gate = await fullDashboardGate(client, config, pipeline, name, body);
    return Response.json(gate);
  });
}

export const POST = withRole(handlePost);
