import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { withRole } from "@/lib/auth/guard";
import type { Principal } from "@/lib/auth/service-token";
import { putPipelineConfig } from "@/lib/services/config-service";
import { readVersion, recordVersion } from "@/lib/services/config-history";
import { validateConfigForSave } from "@/lib/graph/validateConfig";
import type { PipelineConfig } from "@/lib/types/config";

export const dynamic = "force-dynamic";

/**
 * Restore a saved version by writing it forward as a new one, rather than
 * winding the history back. Reverting is itself a change worth attributing, and
 * a revert you regret is then just another revert.
 */
async function handlePost(
  _request: Request,
  context: { params: Promise<{ pipeline: string; version: string }> },
  principal: Principal,
) {
  const { pipeline, version } = await context.params;
  const n = Number(version);
  if (!Number.isInteger(n) || n < 1) {
    return NextResponse.json({ error: "invalid_version" }, { status: 400 });
  }

  const base = loadS3Config();
  const config = pipelineS3Config(base, pipeline);
  const client = createS3Client(base);

  return wrapS3Error(async () => {
    const entry = await readVersion(client, config, pipeline, n);
    if (!entry) return NextResponse.json({ error: "version_not_found" }, { status: 404 });

    // An old version can be invalid under today's rules (it may predate a
    // schema change), so it goes through the same checks as any other save.
    const errors = validateConfigForSave(entry.config as PipelineConfig);
    if (errors.length > 0) {
      return NextResponse.json(
        { ok: false, error: `invalid_config: ${errors.join("; ")}` },
        { status: 422 },
      );
    }

    const body = JSON.stringify(entry.config, null, 2);
    await putPipelineConfig(client, config, body);
    const written = await recordVersion(
      client,
      config,
      pipeline,
      body,
      principal.username,
      `reverted to v${n}`,
    );
    return NextResponse.json({ ok: true, version: written, revertedFrom: n });
  }, `POST /api/p/${pipeline}/config/history/${version}/revert`);
}

export const POST = withRole(handlePost);
