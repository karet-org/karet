import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import { listVersionConfigs } from "@/lib/services/pipeline-store";
import { describeChange, diffConfigs } from "@/lib/config/diff";

export const dynamic = "force-dynamic";

/**
 * Saved versions, newest first, each with what it changed from the version
 * before it. The first version has `changes: null`.
 */
async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const versions = await listVersionConfigs(pipeline);

  return NextResponse.json({
    versions: versions.map((v, i) => {
      const previous = versions[i + 1];
      return {
        version: v.version,
        saved_at: v.createdAt,
        author: v.authorName,
        note: v.note ?? undefined,
        live: v.live,
        changes: previous ? diffConfigs(previous.config, v.config).changes.map(describeChange) : null,
      };
    }),
    current: versions.find((v) => v.live)?.version ?? null,
  });
}

export const GET = withRole(handleGet);
