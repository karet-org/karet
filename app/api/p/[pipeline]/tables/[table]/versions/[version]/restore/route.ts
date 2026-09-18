import { NextResponse } from "next/server";
import { wrapS3Error } from "@/lib/config/s3-client";
import { withRole } from "@/lib/auth/guard";
import { restoreTableVersion } from "@/lib/services/table-manifest";

export const dynamic = "force-dynamic";

/**
 * Make an older version of a table live again.
 *
 * No Parquet moves: the new version names the same objects, so this is two
 * small JSON writes and takes effect for every reader at once. The next pipeline
 * run publishes on top of it as normal.
 */
async function handlePost(
  _request: Request,
  context: { params: Promise<{ pipeline: string; table: string; version: string }> },
) {
  const { pipeline, table, version } = await context.params;
  const n = Number(version);
  if (!Number.isInteger(n) || n < 1) {
    return NextResponse.json({ error: "invalid_version" }, { status: 400 });
  }

  return wrapS3Error(async () => {
    const result = await restoreTableVersion(pipeline, table, n);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json({ ok: true, version: result.version, restoredFrom: n });
  }, `POST /api/p/${pipeline}/tables/${table}/versions/${version}/restore`);
}

export const POST = withRole(handlePost);
