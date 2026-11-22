import { withRole } from "@/lib/auth/guard";
import { getLiveConfig } from "@/lib/services/pipeline-store";
import { liveRowCount, liveVersion } from "@/lib/services/table-versions";

async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  try {
    const pcfg = await getLiveConfig(pipeline);
    if (!pcfg) return Response.json({ error: "pipeline_not_found" }, { status: 404 });

    const tables = [];
    for (const t of pcfg.config.analytic_tables) {
      const live = await liveVersion(pipeline, t.id);
      tables.push({
        rowCount: live ? await rowCount(pipeline, t.id) : 0,
        publishedAt: live?.created_at ?? null,
        id: t.id,
        name: t.name,
        schema: t.schema,
        partitionKeys: t.partition_keys ?? [],
        dedupKeys: t.dedup_keys ?? [],
        fileCount: live?.files ?? 0,
        version: live?.version ?? 0,
      });
    }
    return Response.json({ tables });
  } catch (err) {
    console.error(`GET /api/p/${pipeline}/tables failed:`, err);
    return Response.json({ error: "lake_error", message: (err as Error).message }, { status: 503 });
  }
}

/** Null when the count cannot be read, so the navigator leaves it out. */
async function rowCount(pipeline: string, tableId: string): Promise<number | null> {
  try {
    return await liveRowCount(pipeline, tableId);
  } catch (err) {
    console.error(`row count for ${pipeline}/${tableId} failed:`, err);
    return null;
  }
}

export const GET = withRole(handleGet);
