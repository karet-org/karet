import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, pipelineS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { fetchObject, listParquetKeys } from "@/lib/services/config-service";
import { loadTableRows } from "@/lib/services/parquet-parser";

export async function GET(
  _request: Request,
  context: { params: Promise<{ pipeline: string; table: string }> },
) {
  const { pipeline, table } = await context.params;
  const config = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(config);

  return wrapS3Error(async () => {
    const keys = await listParquetKeys(client, config, table);
    if (keys.length === 0) return NextResponse.json({ rows: [] });

    const rows = await loadTableRows(keys, (key) =>
      fetchObject(client, config.bucket, key),
    );
    return NextResponse.json({ rows });
  }, `GET /api/p/${pipeline}/tables/${table}/rows`);
}
