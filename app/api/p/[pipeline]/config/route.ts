import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import type { Principal } from "@/lib/auth/service-token";
import { findUserByUsername } from "@/lib/auth/users";
import { getLiveConfig, pipelineExists } from "@/lib/services/pipeline-store";
import { publishConfig } from "@/lib/services/config-publish";

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
  const published = await publishConfig(pipeline, parsed, {
    id: author?.id ?? null,
    name: principal.username,
  });
  if (!published.ok) {
    return NextResponse.json({ ok: false, error: published.message }, { status: published.status });
  }

  const saved = published.value;
  return NextResponse.json(
    { ok: true, version: saved.version, versionId: saved.versionId },
    { status: 200, headers: { "X-Karet-Config-Version": String(saved.version) } },
  );
}

export const GET = withRole(handleGet);
export const PUT = withRole(handlePut);

