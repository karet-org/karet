import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import { getLiveConfig, getPreviousVersion, getVersion } from "@/lib/services/pipeline-store";
import { unifiedConfigDiff } from "@/lib/config/text-diff";

export const dynamic = "force-dynamic";

/**
 * One saved version and a unified diff: by default from the live config to
 * this version, which is what restoring it would change; with
 * `?against=previous`, from the version before it, which is what this save
 * changed (`previousVersion` is null for the first version).
 *
 * Computed here rather than in the browser so the canonicalisation rules — sorted
 * keys, node positions dropped — live in one place with tests around them, and so
 * the client does not have to fetch two configs to show one diff.
 */
async function handleGet(
  request: Request,
  context: { params: Promise<{ pipeline: string; version: string }> },
) {
  const { pipeline, version } = await context.params;
  const n = Number(version);
  if (!Number.isInteger(n) || n < 1) {
    return NextResponse.json({ error: "invalid_version" }, { status: 400 });
  }

  const entry = await getVersion(pipeline, n);
  if (!entry) return NextResponse.json({ error: "version_not_found" }, { status: 404 });
  const against = new URL(request.url).searchParams.get("against") ?? "live";
  if (against !== "live" && against !== "previous") {
    return NextResponse.json({ error: "invalid_against" }, { status: 400 });
  }
  const live = await getLiveConfig(pipeline);
  const previous = against === "previous" ? await getPreviousVersion(pipeline, n) : null;

  return NextResponse.json({
    version: entry.version,
    saved_at: entry.createdAt,
    author: entry.authorName,
    note: entry.note ?? undefined,
    live: entry.live,
    liveVersion: live?.version ?? null,
    against,
    previousVersion: previous?.version ?? null,
    diff: unifiedConfigDiff(against === "previous" ? (previous?.config ?? null) : (live?.config ?? null), entry.config),
  });
}

export const GET = withRole(handleGet);
