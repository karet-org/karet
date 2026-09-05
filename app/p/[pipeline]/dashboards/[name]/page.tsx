import Link from "next/link";
import { notFound } from "next/navigation";
import { createS3Client, loadS3Config, pipelineS3Config } from "@/lib/config/s3-client";
import {
  getDashboard,
  getPipelineConfig,
  getQuery,
} from "@/lib/services/config-service";
import { loadTableRowsDuckDB } from "@/lib/services/duckdb";
import { runPipelineQuery } from "@/lib/services/query-service";
import type { ColumnSchema } from "@/lib/types/config";
import DashboardView from "@/components/dashboard/DashboardView";
import type { Row } from "@/components/dashboard/types";

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

  // When the dashboard is backed by a saved query, run it against the
  // warehouse and take its result columns as the schema. Otherwise read the
  // analytic table's Parquet directly and use its declared schema.
  let rows: Row[] = [];
  let schema: ColumnSchema[] | null = null;
  // Non-null when a query-backed dashboard can't produce rows, so the page
  // can explain why the panels are empty instead of silently showing "No
  // data" everywhere.
  let dataError: string | null = null;

  if (dashboard.query_id && pipelineCfg) {
    const saved = await getQuery(client, cfg, dashboard.query_id);
    if (!saved) {
      dataError = `Saved query "${dashboard.query_id}" no longer exists. Recreate it on the Data page or update this dashboard's query_id.`;
    } else {
      const result = await runPipelineQuery(pipeline, pipelineCfg.config, saved.sql);
      if ("error" in result) {
        dataError = `The saved query "${dashboard.query_id}" failed to run: ${result.error}`;
      } else {
        rows = result.rows as Row[];
        schema = result.columns.map((name) => ({ name, type: "string" }));
      }
    }
  } else {
    rows = await loadTableRowsDuckDB<Row>(pipeline, dashboard.analytic_table_id);
    schema =
      pipelineCfg?.config.analytic_tables.find(
        (t) => t.id === dashboard.analytic_table_id,
      )?.schema ?? null;
  }

  if (!schema || schema.length === 0) {
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
      <header className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] px-3 py-2 shadow-sm sm:px-4 sm:py-3">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-[color:var(--color-carrot)] sm:text-lg">{dashboard.name}</h1>
          <p className="text-xs text-[color:var(--color-ink-3)]">
            {dashboard.query_id
              ? `Query: ${dashboard.query_id}`
              : `Table: ${dashboard.analytic_table_id}`}{" "}
            · {rows.length} rows
          </p>
        </div>
        <Link
          href={`/p/${pipeline}/dashboards/${name}/edit`}
          className="shrink-0 rounded-md border border-[color:var(--color-rule)] px-3.5 py-1.5 text-[12.5px] font-medium text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
        >
          Edit
        </Link>
      </header>
      {dataError && (
        <div
          role="alert"
          className="rounded-lg border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-3 py-2.5 text-sm text-[color:var(--color-rose-deep)] sm:px-4"
        >
          <strong className="font-semibold">Couldn&apos;t load this dashboard&apos;s data.</strong>{" "}
          {dataError}
        </div>
      )}
      <DashboardView config={dashboard} rows={rows} schema={schema} />
    </main>
  );
}
