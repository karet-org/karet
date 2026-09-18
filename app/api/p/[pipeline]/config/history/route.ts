import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import { getVersion, listVersions } from "@/lib/services/pipeline-store";
import { diffConfigs, summarizeDiff } from "@/lib/config/diff";
import type { PipelineConfig } from "@/lib/types/config";

export const dynamic = "force-dynamic";

/**
 * Saved versions, newest first, each with a summary of what it changed relative
 * to the version before it. Summaries are computed here so the list is useful
 * without the browser fetching every config.
 */
async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const metas = await listVersions(pipeline);

  // Oldest to newest, so each version is compared with its predecessor.
  const ascending = [...metas].sort((a, b) => a.version - b.version);
  const summaries = new Map<number, string>();
  let previous: PipelineConfig | null = null;
  for (const meta of ascending) {
    const entry = await getVersion(pipeline, meta.version);
    const current = entry?.config ?? null;
    summaries.set(
      meta.version,
      previous ? summarizeDiff(diffConfigs(previous, current)) : "created",
    );
    previous = current;
  }

  return NextResponse.json({
    versions: metas.map((m) => ({
      version: m.version,
      saved_at: m.createdAt,
      author: m.authorName,
      note: m.note ?? undefined,
      summary: summaries.get(m.version) ?? "",
    })),
    current: metas.find((m) => m.live)?.version ?? null,
  });
}

export const GET = withRole(handleGet);
