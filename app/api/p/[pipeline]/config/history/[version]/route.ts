import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import { getLiveConfig, getVersion } from "@/lib/services/pipeline-store";
import { unifiedConfigDiff } from "@/lib/config/text-diff";

export const dynamic = "force-dynamic";

/**
 * One saved version, and a unified diff against the live config.
 *
 * Computed here rather than in the browser so the canonicalisation rules — sorted
 * keys, node positions dropped — live in one place with tests around them, and so
 * the client does not have to fetch two configs to show one diff.
 */
async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string; version: string }> },
) {
  const { pipeline, version } = await context.params;
  const n = Number(version);
  if (!Number.isInteger(n) || n < 1) {
    return NextResponse.json({ error: "invalid_version" }, { status: 400 });
  }

  const entry = await getVersion(pipeline, n);
  if (!entry) return NextResponse.json({ error: "version_not_found" }, { status: 404 });
  const live = await getLiveConfig(pipeline);

  return NextResponse.json({
    version: entry.version,
    saved_at: entry.createdAt,
    author: entry.authorName,
    note: entry.note ?? undefined,
    live: entry.live,
    liveVersion: live?.version ?? null,
    // From live to this version, so it reads as "what restoring would change".
    diff: unifiedConfigDiff(live?.config ?? null, entry.config),
  });
}

export const GET = withRole(handleGet);
