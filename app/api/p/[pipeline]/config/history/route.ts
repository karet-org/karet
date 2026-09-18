import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { withRole } from "@/lib/auth/guard";
import { getPipelineConfig } from "@/lib/services/config-service";
import { listVersions, readVersion } from "@/lib/services/config-history";
import { diffConfigs, summarizeDiff } from "@/lib/config/diff";
import type { PipelineConfig } from "@/lib/types/config";

export const dynamic = "force-dynamic";

/**
 * Saved versions, newest first, each with a summary of what it changed relative
 * to the version before it. The summary is computed here rather than in the
 * browser so the list is useful without fetching every config.
 */
async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const base = loadS3Config();
  const config = pipelineS3Config(base, pipeline);
  const client = createS3Client(base);

  return wrapS3Error(async () => {
    const metas = await listVersions(client, config, pipeline);
    const head = await getPipelineConfig(client, config);

    // Walk oldest to newest so each version is compared with its predecessor.
    const ascending = [...metas].sort((a, b) => a.version - b.version);
    const summaries = new Map<number, string>();
    let previous: PipelineConfig | null = null;
    for (const meta of ascending) {
      const entry = await readVersion(client, config, pipeline, meta.version);
      const current = (entry?.config ?? null) as PipelineConfig | null;
      summaries.set(
        meta.version,
        previous ? summarizeDiff(diffConfigs(previous, current)) : "created",
      );
      previous = current;
    }

    return NextResponse.json({
      versions: metas.map((m) => ({ ...m, summary: summaries.get(m.version) ?? "" })),
      // Which version the live config matches, when it matches one at all: a
      // config edited outside the app (a script, the migration tool) will not.
      current: previous && head && diffConfigs(previous, head.config).changes.length === 0
        ? ascending.at(-1)?.version ?? null
        : null,
    });
  }, `GET /api/p/${pipeline}/config/history`);
}

export const GET = withRole(handleGet);
