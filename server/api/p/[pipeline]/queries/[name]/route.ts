import { withPipelineS3 } from "@/lib/config/s3-client";
import { deleteQuery, getQuery } from "@/lib/services/document-store";
import { withRole } from "@/lib/auth/guard";

async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string; name: string }> },
) {
  const { pipeline, name } = await context.params;

  return withPipelineS3(pipeline, `GET /api/p/${pipeline}/queries/${name}`, async (client, config) => {
    const query = await getQuery(client, config, name);
    if (query === null) {
      return Response.json({ error: "query_not_found", name }, { status: 404 });
    }
    return Response.json(query);
  });
}

async function handleDelete(
  _request: Request,
  context: { params: Promise<{ pipeline: string; name: string }> },
) {
  const { pipeline, name } = await context.params;

  return withPipelineS3(pipeline, `DELETE /api/p/${pipeline}/queries/${name}`, async (client, config) => {
    await deleteQuery(client, config, name);
    return Response.json({ ok: true });
  });
}

export const GET = withRole(handleGet);
export const DELETE = withRole(handleDelete);
