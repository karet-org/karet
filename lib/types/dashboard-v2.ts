// Dashboard config v2: YAML documents with per-panel DuckDB SQL and
// column bindings. See karet-dashboards-v2-design.html.

import { parse } from "yaml";

export type FilterKindV2 = "dropdown" | "date_range";

export interface DashboardFilterV2 {
  /** Parameter name: dropdown exposes $name, date_range $name_from/$name_to. */
  name: string;
  kind: FilterKindV2;
  label?: string;
  /** Dropdown option source; single-column SELECT. */
  options_sql?: string;
}

export interface PanelGridV2 {
  /** Column span: a number or "full". */
  span?: number | "full";
  aspect?: string;
  maxHeight?: string;
}

interface PanelBase {
  title: string;
  /** Inline SQL; exactly one of query/query_id. */
  query?: string;
  /** Saved query reference (stem of queries/<id>.json). */
  query_id?: string;
  grid?: PanelGridV2;
}

export type PanelV2 = PanelBase &
  (
    | { kind: "kpi"; value: string; format?: "number" | "currency" | "raw"; currency?: string; icon?: string }
    | { kind: "bar"; x: string; y: string; series?: string; horizontal?: boolean }
    | { kind: "line"; x: string; y: string; series?: string }
    | { kind: "doughnut"; label: string; value: string }
    | { kind: "table"; columns?: string[]; page_size?: number }
    | { kind: "sankey"; source: string; target: string; value: string }
    | { kind: "choropleth_map"; region: string; value: string }
    | { kind: "symbol_map"; lat: string; lon: string; value: string; label?: string; max_radius?: number }
    | { kind: "summary" }
  );

export interface DashboardConfigV2 {
  version: 2;
  id: string;
  name: string;
  filters: DashboardFilterV2[];
  panels: PanelV2[];
  layout?: {
    columns?: number;
    gap?: string;
  };
}

export const PANEL_KINDS_V2 = [
  "kpi",
  "bar",
  "line",
  "doughnut",
  "table",
  "sankey",
  "choropleth_map",
  "symbol_map",
  "summary",
] as const;

/** Required column bindings per kind. */
const REQUIRED_BINDINGS: Record<string, string[]> = {
  kpi: ["value"],
  bar: ["x", "y"],
  line: ["x", "y"],
  doughnut: ["label", "value"],
  table: [],
  sankey: ["source", "target", "value"],
  choropleth_map: ["region", "value"],
  symbol_map: ["lat", "lon", "value"],
  summary: [],
};

const ID_RE = /^[a-z0-9][a-z0-9-_]*$/;
const PARAM_NAME_RE = /^[a-z][a-z0-9_]*$/;

/** `$name` references in SQL, outside single-quoted strings and comments. */
export function extractParams(sql: string): string[] {
  const out = new Set<string>();
  const stripped = sql
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of stripped.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)) out.add(m[1]);
  return [...out];
}

/** Parameter names a filter declares. */
export function filterParams(f: DashboardFilterV2): string[] {
  return f.kind === "date_range" ? [`${f.name}_from`, `${f.name}_to`] : [f.name];
}

export type V2ValidationResult =
  | { ok: true; config: DashboardConfigV2; panelCount: number }
  | { ok: false; errors: string[] };

/** Parse YAML source and structurally validate it as a v2 config. */
export function validateDashboardV2(source: string): V2ValidationResult {
  let raw: unknown;
  try {
    raw = parse(source, { schema: "core" });
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message.split("\n")[0] : "Invalid YAML"] };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ["Config must be a YAML mapping"] };
  }
  const cfg = raw as Record<string, unknown>;
  const errors: string[] = [];

  if (cfg.version !== 2) errors.push('"version" must be 2');
  if (typeof cfg.id !== "string" || !ID_RE.test(cfg.id)) {
    errors.push('"id" must be a lowercase slug');
  }
  if (typeof cfg.name !== "string" || cfg.name.trim() === "") {
    errors.push('"name" must be a non-empty string');
  }

  const declared = new Set<string>();
  if (cfg.filters === undefined) {
    cfg.filters = [];
  } else if (!Array.isArray(cfg.filters)) {
    errors.push('"filters" must be a list');
  } else {
    cfg.filters.forEach((f, i) => {
      const filter = (f ?? {}) as Record<string, unknown>;
      if (typeof filter.name !== "string" || !PARAM_NAME_RE.test(filter.name)) {
        errors.push(`filters[${i}].name must be a lowercase identifier`);
        return;
      }
      if (filter.kind !== "dropdown" && filter.kind !== "date_range") {
        errors.push(`filters[${i}].kind must be dropdown or date_range`);
        return;
      }
      if (filter.kind === "dropdown" && typeof filter.options_sql !== "string") {
        errors.push(`filters[${i}] (dropdown) requires options_sql`);
      }
      for (const p of filterParams(filter as unknown as DashboardFilterV2)) {
        if (declared.has(p)) errors.push(`filter parameter $${p} declared twice`);
        declared.add(p);
      }
    });
  }

  if (!Array.isArray(cfg.panels) || cfg.panels.length === 0) {
    errors.push('"panels" must be a non-empty list');
  } else {
    cfg.panels.forEach((p, i) => {
      const panel = (p ?? {}) as Record<string, unknown>;
      const kind = panel.kind as string;
      if (!PANEL_KINDS_V2.includes(kind as (typeof PANEL_KINDS_V2)[number])) {
        errors.push(`panels[${i}].kind "${String(panel.kind)}" is not one of: ${PANEL_KINDS_V2.join(", ")}`);
        return;
      }
      if (typeof panel.title !== "string" || panel.title.trim() === "") {
        errors.push(`panels[${i}].title must be a non-empty string`);
      }
      const hasQuery = typeof panel.query === "string" && panel.query.trim() !== "";
      const hasRef = typeof panel.query_id === "string" && panel.query_id.trim() !== "";
      if (hasQuery === hasRef) {
        errors.push(`panels[${i}] needs exactly one of query or query_id`);
      }
      for (const b of REQUIRED_BINDINGS[kind]) {
        if (typeof panel[b] !== "string" || panel[b] === "") {
          errors.push(`panels[${i}] (${kind}) requires the "${b}" binding`);
        }
      }
      if (hasQuery) {
        for (const param of extractParams(panel.query as string)) {
          if (!declared.has(param)) {
            errors.push(`panels[${i}] references $${param}, which no filter declares`);
          }
        }
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    config: cfg as unknown as DashboardConfigV2,
    panelCount: (cfg.panels as unknown[]).length,
  };
}

/** Starter template for new drafts. */
export function templateV2(id: string): string {
  return `version: 2
id: ${id}
name: Untitled dashboard

# Filters become named SQL parameters: $account here.
filters: []
#  - name: account
#    kind: dropdown
#    label: Account
#    options_sql: SELECT DISTINCT account FROM transactions ORDER BY 1

panels: []
#  - kind: bar
#    title: Monthly spend
#    query: |
#      SELECT strftime(date, '%Y-%m') AS month, sum(amount) AS total
#      FROM transactions GROUP BY 1 ORDER BY 1
#    x: month
#    y: total
`;
}
