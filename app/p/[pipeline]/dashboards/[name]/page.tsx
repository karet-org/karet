import { notFound } from "next/navigation";
import { createS3Client, loadS3Config, pipelineS3Config } from "@/lib/config/s3-client";
import {
  fetchObject,
  getDashboard,
  getPipelineConfig,
  listParquetKeys,
} from "@/lib/services/config-service";
import { parseParquet, serializeRow } from "@/lib/services/parquet-parser";
import type { ColumnSchema } from "@/lib/types/config";
import DashboardView from "@/components/dashboard/DashboardView";
import type { Row } from "@/components/dashboard/types";

export const dynamic = "force-dynamic";

async function loadRowsForTable(
  client: ReturnType<typeof createS3Client>,
  cfg: ReturnType<typeof loadS3Config>,
  tableId: string,
): Promise<Row[]> {
  const keys = await listParquetKeys(client, cfg, tableId);
  if (keys.length === 0) return [];
  const rows: Row[] = [];
  for (const key of keys) {
    try {
      const buffer = await fetchObject(client, cfg.bucket, key);
      const parsed = await parseParquet(buffer);
      for (const row of parsed) rows.push(serializeRow<Row>(row));
    } catch (err) {
      console.warn(`Skipping Parquet file ${key}:`, err);
    }
  }
  return rows;
}

export default async function PipelineDashboardPage({
  params,
}: {
  params: Promise<{ pipeline: string; name: string }>;
}) {
  const { pipeline, name } = await params;
  const cfg = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(cfg);

  const dashboard = await getDashboard(client, cfg, name);
  if (!dashboard) notFound();

  const pipelineCfg = await getPipelineConfig(client, cfg);
  const rows = await loadRowsForTable(client, cfg, dashboard.analytic_table_id);

  let schema: ColumnSchema[] | null =
    pipelineCfg?.config.analytic_tables.find(
      (t) => t.id === dashboard.analytic_table_id,
    )?.schema ?? null;

  if (!schema) {
    const inferred = new Map<string, string>();
    for (const row of rows) {
      for (const [k, v] of Object.entries(row)) {
        if (inferred.has(k)) continue;
        inferred.set(k, typeof v === "number" ? "number" : typeof v === "boolean" ? "bool" : "string");
      }
    }
    schema = Array.from(inferred.entries()).map(([name, type]) => ({ name, type }));
  }

  return (
    <main className="min-h-screen space-y-4 bg-gray-50 p-6">
      <header>
        <h1 className="text-2xl font-semibold">{dashboard.name}</h1>
        <p className="text-xs text-gray-500">
          Table: {dashboard.analytic_table_id} · {rows.length} rows
        </p>
      </header>
      <DashboardView config={dashboard} rows={rows} schema={schema} />
    </main>
  );
}
