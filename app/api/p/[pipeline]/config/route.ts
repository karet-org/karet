import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";
import {
  getPipelineConfig,
  PreconditionFailedError,
  putPipelineConfig,
} from "@/lib/services/config-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const config = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(config);

  return wrapS3Error(async () => {
    const current = await getPipelineConfig(client, config);
    if (current === null) {
      return NextResponse.json({ error: "pipeline_config_not_found" }, { status: 404 });
    }
    const headers: Record<string, string> = {};
    if (current.etag) headers.ETag = `"${current.etag}"`;
    return NextResponse.json(current.config, { status: 200, headers });
  }, `GET /api/p/${pipeline}/config`);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const config = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(config);

  let body: string;
  try {
    body = await request.text();
    JSON.parse(body);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `invalid_json: ${(err as Error).message}` },
      { status: 422 },
    );
  }

  const ifMatchHeader = request.headers.get("If-Match") ?? undefined;
  const ifMatch = ifMatchHeader ? ifMatchHeader.replace(/^"|"$/g, "") : undefined;

  return wrapS3Error(async () => {
    try {
      const result = await putPipelineConfig(client, config, body, ifMatch);
      const headers: Record<string, string> = {};
      if (result.etag) headers.ETag = `"${result.etag}"`;
      return NextResponse.json({ ok: true, etag: result.etag ?? null }, { status: 200, headers });
    } catch (err) {
      if (err instanceof PreconditionFailedError) {
        return NextResponse.json({ ok: false, error: err.message }, { status: 412 });
      }
      throw err;
    }
  }, `PUT /api/p/${pipeline}/config`);
}
