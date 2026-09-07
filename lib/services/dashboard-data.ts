// Dashboard v2 data execution: run each panel's SQL (and each dropdown's
// options_sql) against the warehouse with named filter parameters bound
// through prepared statements. Parallel with a small cap; per-panel
// failure isolation; bounded row counts.

import type { PipelineConfig } from "@/lib/types/config";
import type {
  DashboardConfigV2,
  DashboardFilterV2,
  PanelV2,
} from "@/lib/types/dashboard-v2";
import { extractParams } from "@/lib/types/dashboard-v2";
import type { SavedQuery } from "@/lib/types/query";
import { runPipelineQuery } from "@/lib/services/query-service";

const PANEL_ROW_CAP = 10_000;
const OPTIONS_ROW_CAP = 500;
const CONCURRENCY = 4;

export type ParamValue = string | null;
export type Params = Record<string, ParamValue>;

export interface PanelResult {
  columns: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
}

export interface PanelError {
  error: string;
}

export interface DashboardData {
  panels: (PanelResult | PanelError)[];
  filters: Record<string, { options: string[] }>;
}

/** Rewrite $name refs to positional placeholders; the driver binds values. */
export function bindParams(
  sql: string,
  params: Params,
): { sql: string; values: ParamValue[] } | { error: string } {
  const referenced = extractParams(sql);
  for (const name of referenced) {
    if (!(name in params)) return { error: `Missing parameter $${name}` };
  }
  const values: ParamValue[] = [];
  const parts = sql.split(/('(?:[^']|'')*')/);
  const bound = parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => {
        values.push(params[name] ?? null);
        return "?";
      });
    })
    .join("");
  return { sql: bound, values };
}

/** Coerce unknown client input into typed params: filter params plus emit params. */
export function coerceParams(
  dashboard: Pick<DashboardConfigV2, "filters" | "panels">,
  raw: unknown,
): Params {
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const names = new Set<string>();
  for (const f of dashboard.filters) {
    if (f.kind === "date_range") {
      names.add(`${f.name}_from`);
      names.add(`${f.name}_to`);
    } else {
      names.add(f.name);
    }
  }
  for (const p of dashboard.panels) {
    if ("emit" in p && p.emit) names.add(p.emit.param);
  }
  const params: Params = {};
  for (const n of names) {
    const v = input[n];
    params[n] = typeof v === "string" && v !== "" ? v : null;
  }
  return params;
}

/** `$name` -> NULL outside string literals, for DESCRIBE-time validation. */
export function bindNulls(sql: string): string {
  const parts = sql.split(/('(?:[^']|'')*')/);
  return parts
    .map((part, i) =>
      i % 2 === 1 ? part : part.replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, "NULL"),
    )
    .join("");
}

/** Column bindings a panel declares (kind fields that name result columns). */
export function panelBindings(panel: PanelV2): string[] {
  switch (panel.kind) {
    case "kpi":
      return [panel.value];
    case "bar":
    case "line":
      return [panel.x, panel.y, ...(panel.series ? [panel.series] : [])];
    case "doughnut":
      return [panel.label, panel.value];
    case "sankey":
      return [panel.source, panel.target, panel.value, panel.source_layer, panel.target_layer];
    case "choropleth_map":
      return [panel.region, panel.value];
    case "symbol_map":
      return [panel.lat, panel.lon, panel.value, ...(panel.label ? [panel.label] : [])];
    case "table":
      return panel.columns ?? [];
    case "summary":
      return [];
  }
}

/** Every query must plan (DESCRIBE) and every binding must name a returned column. */
export async function validateDashboardSql(
  pipeline: string,
  pipelineConfig: PipelineConfig,
  dashboard: DashboardConfigV2,
  savedQueries: Map<string, SavedQuery>,
): Promise<string[]> {
  const { describePipelineQuery } = await import("@/lib/services/query-service");
  const errors: string[] = [];
  for (const [i, panel] of dashboard.panels.entries()) {
    const sql = panelSql(panel, savedQueries);
    if (typeof sql !== "string") {
      errors.push(`panels[${i}]: ${sql.error}`);
      continue;
    }
    const described = await describePipelineQuery(pipeline, pipelineConfig, bindNulls(sql));
    if ("error" in described) {
      errors.push(`panels[${i}] SQL: ${described.error}`);
      continue;
    }
    for (const b of panelBindings(panel)) {
      if (!described.columns.includes(b)) {
        errors.push(
          `panels[${i}] binds "${b}" but the query returns: ${described.columns.join(", ")}`,
        );
      }
    }
  }
  for (const [i, f] of dashboard.filters.entries()) {
    if (f.kind !== "dropdown" || !f.options_sql) continue;
    const described = await describePipelineQuery(pipeline, pipelineConfig, bindNulls(f.options_sql));
    if ("error" in described) errors.push(`filters[${i}].options_sql: ${described.error}`);
    else if (described.columns.length !== 1)
      errors.push(`filters[${i}].options_sql must return exactly one column`);
  }
  return errors;
}

/** Full gate: structure, then SQL planning and binding checks. */
export async function fullDashboardGate(
  client: import("@aws-sdk/client-s3").S3Client,
  s3cfg: import("@/lib/config/s3-client").S3Config,
  pipeline: string,
  expectedId: string,
  body: string,
): Promise<{ ok: boolean; errors: string[] }> {
  const { validateDashboardV2 } = await import("@/lib/types/dashboard-v2");
  const { getPipelineConfig, getQuery } = await import("@/lib/services/config-service");

  const result = validateDashboardV2(body);
  if (!result.ok) return { ok: false, errors: result.errors };
  if (result.config.id !== expectedId) {
    return { ok: false, errors: [`Config id "${result.config.id}" must match "${expectedId}"`] };
  }
  const pipelineCfg = await getPipelineConfig(client, s3cfg);
  if (!pipelineCfg) return { ok: false, errors: ["Pipeline config not found"] };

  const referenced = [
    ...new Set(result.config.panels.flatMap((p) => (p.query_id ? [p.query_id] : []))),
  ];
  const savedQueries = new Map<string, SavedQuery>();
  await Promise.all(
    referenced.map(async (id) => {
      const q = await getQuery(client, s3cfg, id);
      if (q) savedQueries.set(id, q);
    }),
  );
  const sqlErrors = await validateDashboardSql(
    pipeline,
    pipelineCfg.config,
    result.config,
    savedQueries,
  );
  return { ok: sqlErrors.length === 0, errors: sqlErrors };
}

async function runOne(
  pipeline: string,
  config: PipelineConfig,
  sql: string,
  params: Params,
  cap: number,
): Promise<PanelResult | PanelError> {
  const bound = bindParams(sql, params);
  if ("error" in bound) return { error: bound.error };
  const result = await runPipelineQuery(pipeline, config, bound.sql, {
    values: bound.values,
  });
  if ("error" in result) return { error: result.error };
  const truncated = result.rows.length > cap;
  return {
    columns: result.columns,
    rows: truncated ? result.rows.slice(0, cap) : result.rows,
    truncated,
  };
}

/** Resolve a panel's SQL: inline query or saved-query reference. */
function panelSql(
  panel: PanelV2,
  savedQueries: Map<string, SavedQuery>,
): string | { error: string } {
  if (panel.query) return panel.query;
  const saved = panel.query_id ? savedQueries.get(panel.query_id) : undefined;
  if (!saved) return { error: `Saved query "${panel.query_id}" not found` };
  return saved.sql;
}

/** Run everything a dashboard needs, with bounded concurrency. */
export async function executeDashboard(
  pipeline: string,
  pipelineConfig: PipelineConfig,
  dashboard: DashboardConfigV2,
  params: Params,
  savedQueries: Map<string, SavedQuery>,
): Promise<DashboardData> {
  type Task = () => Promise<void>;
  const tasks: Task[] = [];

  const panels: (PanelResult | PanelError)[] = new Array(dashboard.panels.length);
  dashboard.panels.forEach((panel, i) => {
    tasks.push(async () => {
      const sql = panelSql(panel, savedQueries);
      panels[i] =
        typeof sql === "string"
          ? await runOne(pipeline, pipelineConfig, sql, params, PANEL_ROW_CAP)
          : sql;
    });
  });

  const filters: DashboardData["filters"] = {};
  for (const f of dashboard.filters) {
    if (f.kind !== "dropdown" || !f.options_sql) continue;
    tasks.push(async () => {
      const r = await runOne(pipeline, pipelineConfig, f.options_sql!, {}, OPTIONS_ROW_CAP);
      filters[f.name] = {
        options:
          "error" in r
            ? []
            : r.rows
                .map((row) => Object.values(row)[0])
                .filter((v) => v != null)
                .map(String),
      };
    });
  }

  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const task = tasks[next++];
      await task();
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));

  return { panels, filters };
}
