import { withRole } from "@/lib/auth/guard";
import { listTableVersions } from "@/lib/services/table-versions";

/**
 * Retained versions of a table, newest first: the window the table can be
 * queried as of, or restored from.
 */
async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string; table: string }> },
) {
  const { pipeline, table } = await context.params;
  try {
    return Response.json({ versions: await listTableVersions(pipeline, table) });
  } catch (err) {
    console.error(`GET /api/p/${pipeline}/tables/${table}/versions failed:`, err);
    return Response.json({ error: "lake_error", message: (err as Error).message }, { status: 503 });
  }
}

export const GET = withRole(handleGet);
