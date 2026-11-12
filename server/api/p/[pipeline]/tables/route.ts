import { wrapS3Error } from "@/lib/config/s3-client";

import { manifestUrls, readManifest } from "@/lib/services/table-manifest";
import { countSource, isVanishedFileError } from "@/lib/services/duckdb";
import { withRole } from "@/lib/auth/guard";
import { getLiveConfig } from "@/lib/services/pipeline-store";

async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;

  return wrapS3Error(async () => {
    const pcfg = await getLiveConfig(pipeline);
    if (!pcfg) return Response.json({ error: "pipeline_not_found" }, { status: 404 });

    // Analytic tables (warehouse). fileCount and version come from the
    // published manifest, so retained older versions aren't counted.
    const tables = [];
    for (const t of pcfg.config.analytic_tables) {
      const manifest = await readManifest(pipeline, t.id);
      tables.push({
        rowCount: manifest ? await rowCount(pipeline, t.id, manifest) : 0,
        publishedAt: manifest?.created_at ?? null,
        id: t.id,
        name: t.name,
        schema: t.schema,
        partitionKeys: t.partition_keys ?? [],
        dedupKeys: t.dedup_keys ?? [],
        fileCount: manifest?.files.length ?? 0,
        version: manifest?.version ?? 0,
      });
    }

    return Response.json({ tables });
  }, `GET /api/p/${pipeline}/tables`);
}

/** Null when the count cannot be read, so the navigator leaves it out. */
async function rowCount(
  pipeline: string,
  tableId: string,
  manifest: NonNullable<Awaited<ReturnType<typeof readManifest>>>,
): Promise<number | null> {
  if (manifest.files.length === 0) return 0;
  const list = manifestUrls(pipeline, tableId, manifest)
    .map((u) => `'${u.replace(/'/g, "''")}'`)
    .join(", ");
  try {
    return await countSource(`read_parquet([${list}])`);
  } catch (err) {
    if (isVanishedFileError(err)) return null;
    console.error(`row count for ${pipeline}/${tableId} failed:`, err);
    return null;
  }
}

export const GET = withRole(handleGet);
