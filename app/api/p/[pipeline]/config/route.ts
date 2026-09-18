import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import type { Principal } from "@/lib/auth/service-token";
import { findUserByUsername } from "@/lib/auth/users";
import { getLiveConfig, pipelineExists, saveConfig } from "@/lib/services/pipeline-store";
import { validateConfigForSave } from "@/lib/graph/validateConfig";
import type { PipelineConfig } from "@/lib/types/config";

export const dynamic = "force-dynamic";

async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const live = await getLiveConfig(pipeline);
  if (!live) {
    return NextResponse.json({ error: "pipeline_config_not_found" }, { status: 404 });
  }
  return NextResponse.json(live.config, {
    status: 200,
    // The version replaces the S3 ETag as the concurrency token: an editor saves
    // against the version it loaded, and a mismatch means someone else saved
    // first.
    headers: { "X-Karet-Config-Version": String(live.version) },
  });
}

async function handlePut(
  request: Request,
  context: { params: Promise<{ pipeline: string }> },
  principal: Principal,
) {
  const { pipeline } = await context.params;

  let parsed: unknown;
  try {
    parsed = JSON.parse(await request.text());
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
  const config = parsed as PipelineConfig;
  const errors = validateConfigForSave(config);
  if (errors.length > 0) {
    return NextResponse.json(
      { ok: false, error: `invalid_config: ${errors.join("; ")}` },
      { status: 422 },
    );
  }

  if (!(await pipelineExists(pipeline))) {
    return NextResponse.json({ error: "pipeline_not_found" }, { status: 404 });
  }

  // Optimistic concurrency: the editor sends the version it loaded.
  const expected = request.headers.get("X-Karet-Config-Version");
  if (expected !== null) {
    const live = await getLiveConfig(pipeline);
    if (live && String(live.version) !== expected) {
      return NextResponse.json(
        {
          ok: false,
          error: `stale_config: you loaded v${expected}, the live version is v${live.version}`,
        },
        { status: 412 },
      );
    }
  }

  const author = principal.service ? null : await findUserByUsername(principal.username);
  const saved = await saveConfig(pipeline, config, {
    id: author?.id ?? null,
    name: principal.username,
  });

  return NextResponse.json(
    { ok: true, version: saved.version, versionId: saved.versionId },
    { status: 200, headers: { "X-Karet-Config-Version": String(saved.version) } },
  );
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
