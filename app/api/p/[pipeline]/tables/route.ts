import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { getPipelineConfig, listParquetKeys } from "@/lib/services/config-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const base = loadS3Config();
  const cfg = pipelineS3Config(base, pipeline);
  const client = createS3Client(base);

  return wrapS3Error(async () => {
    const pcfg = await getPipelineConfig(client, cfg);
    if (!pcfg) return NextResponse.json({ error: "pipeline_not_found" }, { status: 404 });

    const tables = [];
    for (const t of pcfg.config.analytic_tables) {
      const keys = await listParquetKeys(client, cfg, t.id);
      tables.push({ id: t.id, name: t.name, schema: t.schema, fileCount: keys.length });
    }

    return NextResponse.json({ tables });
  }, `GET /api/p/${pipeline}/tables`);
}
