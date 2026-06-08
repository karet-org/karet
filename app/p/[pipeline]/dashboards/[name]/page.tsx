import { notFound } from "next/navigation";
import { createS3Client, loadS3Config, pipelineS3Config } from "@/lib/config/s3-client";
import {
  fetchObject,
  getDashboard,
  getPipelineConfig,
  listParquetKeys,
} from "@/lib/services/config-service";
import { loadTableRows } from "@/lib/services/parquet-parser";
import type { ColumnSchema } from "@/lib/types/config";
import DashboardView from "@/components/dashboard/DashboardView";
import type { Row } from "@/components/dashboard/types";

async function loadRowsForTable(
  client: ReturnType<typeof createS3Client>,
  cfg: ReturnType<typeof loadS3Config>,
  tableId: string,
): Promise<Row[]> {
  const keys = await listParquetKeys(client, cfg, tableId);
  if (keys.length === 0) return [];
  return loadTableRows<Row>(keys, (key) => fetchObject(client, cfg.bucket, key));
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

  // pipeline config (for the schema) and the rows are independent; fetch
  // them concurrently rather than one after the other.
  const [pipelineCfg, rows] = await Promise.all([
    getPipelineConfig(client, cfg),
    loadRowsForTable(client, cfg, dashboard.analytic_table_id),
  ]);

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
    <main className="mx-auto min-h-screen max-w-[1400px] space-y-3 p-3 sm:space-y-4 sm:p-4 lg:p-6">
      <header className="rounded-lg border border-orange-100 bg-white px-3 py-2 shadow-sm sm:px-4 sm:py-3">
        <h1 className="text-base font-semibold text-orange-600 sm:text-lg">{dashboard.name}</h1>
        <p className="text-xs text-gray-500">
          Table: {dashboard.analytic_table_id} · {rows.length} rows
        </p>
      </header>
      <DashboardView config={dashboard} rows={rows} schema={schema} />
    </main>
  );
}
