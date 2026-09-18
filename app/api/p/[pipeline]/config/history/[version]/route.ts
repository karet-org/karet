import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import { getLiveConfig, getVersion } from "@/lib/services/pipeline-store";
import { diffConfigs } from "@/lib/config/diff";

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

  const entry = await getVersion(pipeline, n);
  if (!entry) return NextResponse.json({ error: "version_not_found" }, { status: 404 });
  const live = await getLiveConfig(pipeline);

  return NextResponse.json({
    version: entry.version,
    saved_at: entry.createdAt,
    author: entry.authorName,
    note: entry.note ?? undefined,
    config: entry.config,
    diffFromCurrent: live
      ? diffConfigs(live.config, entry.config)
      : { changes: [], onlyLayout: false },
  });
}

export const GET = withRole(handleGet);
