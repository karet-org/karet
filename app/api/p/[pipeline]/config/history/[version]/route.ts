import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { withRole } from "@/lib/auth/guard";
import { getPipelineConfig } from "@/lib/services/config-service";
import { readVersion } from "@/lib/services/config-history";
import { diffConfigs } from "@/lib/config/diff";
import type { PipelineConfig } from "@/lib/types/config";

export const dynamic = "force-dynamic";

/** One saved version, plus how it differs from what is live now. */
async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string; version: string }> },
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
    const head = await getPipelineConfig(client, config);
    return NextResponse.json({
      ...entry,
      diffFromCurrent: head
        ? diffConfigs(head.config, entry.config as PipelineConfig)
        : { changes: [], onlyLayout: false },
    });
  }, `GET /api/p/${pipeline}/config/history/${version}`);
}

export const GET = withRole(handleGet);
