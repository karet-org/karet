import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { deleteQuery, getQuery } from "@/lib/services/document-store";
import { withRole } from "@/lib/auth/guard";

async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string; name: string }> },
) {
  const { pipeline, name } = await context.params;
  const config = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(config);

  return wrapS3Error(async () => {
    const query = await getQuery(client, config, name);
    if (query === null) {
      return NextResponse.json({ error: "query_not_found", name }, { status: 404 });
    }
    return NextResponse.json(query);
  }, `GET /api/p/${pipeline}/queries/${name}`);
}

async function handleDelete(
  _request: Request,
  context: { params: Promise<{ pipeline: string; name: string }> },
) {
  const { pipeline, name } = await context.params;
  const config = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(config);

  return wrapS3Error(async () => {
    await deleteQuery(client, config, name);
    return NextResponse.json({ ok: true });
  }, `DELETE /api/p/${pipeline}/queries/${name}`);
}

export const GET = withRole(handleGet);
export const DELETE = withRole(handleDelete);
