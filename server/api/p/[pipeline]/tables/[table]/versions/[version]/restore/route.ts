import { withRole } from "@/lib/auth/guard";
import { restoreTableVersion } from "@/lib/services/table-versions";

/**
 * Make an older version of a table current. The worker copies that version's
 * rows into a new version, so the restore can itself be undone. The next run
 * of each mapping is a full run.
 */
async function handlePost(
  _request: Request,
  context: { params: Promise<{ pipeline: string; table: string; version: string }> },
) {
  const { pipeline, table, version } = await context.params;
  const n = Number(version);
  if (!Number.isInteger(n) || n < 1) {
    return Response.json({ error: "invalid_version" }, { status: 400 });
  }
  try {
    const r = await restoreTableVersion(pipeline, table, n);
    return r.ok
      ? Response.json({ ok: true, version: r.version, restoredFrom: n })
      : Response.json({ error: r.error, message: r.message }, { status: r.status });
  } catch (err) {
    console.error(`POST /api/p/${pipeline}/tables/${table}/versions/${version}/restore failed:`, err);
    return Response.json({ error: "worker_unreachable", message: (err as Error).message }, { status: 502 });
  }
}

export const POST = withRole(handlePost);
