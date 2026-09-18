import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";

import { readManifest } from "@/lib/services/table-manifest";
import { withRole } from "@/lib/auth/guard";
import { getLiveConfig } from "@/lib/services/pipeline-store";

async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const base = loadS3Config();
  const cfg = pipelineS3Config(base, pipeline);
  const client = createS3Client(base);

  return wrapS3Error(async () => {
    const pcfg = await getLiveConfig(pipeline);
    if (!pcfg) return NextResponse.json({ error: "pipeline_not_found" }, { status: 404 });

    // Analytic tables (warehouse). fileCount and version come from the
    // published manifest, so retained older versions aren't counted.
    const tables = [];
    for (const t of pcfg.config.analytic_tables) {
      const manifest = await readManifest(pipeline, t.id);
      tables.push({
        id: t.id,
        name: t.name,
        schema: t.schema,
        fileCount: manifest?.files.length ?? 0,
        version: manifest?.version ?? 0,
      });
    }

    return NextResponse.json({ tables });
  }, `GET /api/p/${pipeline}/tables`);
}

export const GET = withRole(handleGet);
