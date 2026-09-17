import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";
import {
  getPipelineConfig,
  PreconditionFailedError,
  putPipelineConfig,
} from "@/lib/services/config-service";
import { withRole } from "@/lib/auth/guard";
import type { Principal } from "@/lib/auth/service-token";
import { recordVersion } from "@/lib/services/config-history";
import { validateConfigForSave } from "@/lib/graph/validateConfig";
import type { PipelineConfig } from "@/lib/types/config";

async function handleGet(
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

async function handlePut(
  request: Request,
  context: { params: Promise<{ pipeline: string }> },
  principal: Principal,
) {
  const { pipeline } = await context.params;
  const config = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(config);

  let body: string;
  let parsed: unknown;
  try {
    body = await request.text();
    parsed = JSON.parse(body);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `invalid_json: ${(err as Error).message}` },
      { status: 422 },
    );
  }

  // Valid JSON is not a valid pipeline. Writing `{}` here used to be accepted
  // and left every read of the pipeline failing, so the same checks the editor
  // runs before a save also run here.
  const shapeError = configShapeError(parsed);
  if (shapeError) {
    return NextResponse.json({ ok: false, error: shapeError }, { status: 422 });
  }
  const errors = validateConfigForSave(parsed as PipelineConfig);
  if (errors.length > 0) {
    return NextResponse.json(
      { ok: false, error: `invalid_config: ${errors.join("; ")}` },
      { status: 422 },
    );
  }

  const ifMatchHeader = request.headers.get("If-Match") ?? undefined;
  const ifMatch = ifMatchHeader ? ifMatchHeader.replace(/^"|"$/g, "") : undefined;

  return wrapS3Error(async () => {
    try {
      const result = await putPipelineConfig(client, config, body, ifMatch);
      // After the head lands, so a failed save leaves no phantom version.
      const version = await recordVersion(client, config, pipeline, body, principal.username);
      const headers: Record<string, string> = {};
      if (result.etag) headers.ETag = `"${result.etag}"`;
      return NextResponse.json(
        { ok: true, etag: result.etag ?? null, version },
        { status: 200, headers },
      );
    } catch (err) {
      if (err instanceof PreconditionFailedError) {
        return NextResponse.json({ ok: false, error: err.message }, { status: 412 });
      }
      throw err;
    }
  }, `PUT /api/p/${pipeline}/config`);
}

export const GET = withRole(handleGet);
export const PUT = withRole(handlePut);

/** The fields every config must carry, checked before the deeper pass. */
function configShapeError(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "invalid_config: expected a JSON object";
  }
  const cfg = value as Record<string, unknown>;
  for (const field of ["source_containers", "dimensions", "mappings", "analytic_tables"]) {
    if (!Array.isArray(cfg[field])) return `invalid_config: ${field} must be an array`;
  }
  return null;
}
