import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import { listVersions } from "@/lib/services/pipeline-store";

export const dynamic = "force-dynamic";

/**
 * Saved versions, newest first.
 *
 * Metadata only: one query, no configs read. How a version differs from what is
 * live is computed when that version is inspected, which is the question anyone
 * actually asks.
 */
async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const versions = await listVersions(pipeline);

  return NextResponse.json({
    versions: versions.map((v) => ({
      version: v.version,
      saved_at: v.createdAt,
      author: v.authorName,
      note: v.note ?? undefined,
      live: v.live,
    })),
    current: versions.find((v) => v.live)?.version ?? null,
  });
}

export const GET = withRole(handleGet);
