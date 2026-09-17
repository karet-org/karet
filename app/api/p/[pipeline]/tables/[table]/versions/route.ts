import { NextResponse } from "next/server";
import { wrapS3Error } from "@/lib/config/s3-client";
import { withRole } from "@/lib/auth/guard";
import { listTableVersions } from "@/lib/services/table-manifest";

export const dynamic = "force-dynamic";

/**
 * Versions of a table still on disk, newest first. This is the window the table
 * can be queried as of, or rolled back into; the worker retains a bounded
 * number and vacuums the rest.
 */
async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string; table: string }> },
) {
  const { pipeline, table } = await context.params;
  return wrapS3Error(
    async () => NextResponse.json({ versions: await listTableVersions(pipeline, table) }),
    `GET /api/p/${pipeline}/tables/${table}/versions`,
  );
}

export const GET = withRole(handleGet);
