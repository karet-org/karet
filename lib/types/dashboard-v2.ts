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

/** Click-to-filter: clicking a mark sets the named dropdown param. */
export interface EmitBinding {
  param: string;
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
    | { kind: "bar"; x: string; y: string; series?: string; horizontal?: boolean; emit?: EmitBinding }
    | { kind: "line"; x: string; y: string; series?: string }
    | { kind: "doughnut"; label: string; value: string; emit?: EmitBinding }
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

export interface DetailedError {
  message: string;
  /** YAML path for editor diagnostics; null when positionless. */
  path: (string | number)[] | null;
}

export type V2DetailedResult =
  | { ok: true; config: DashboardConfigV2; panelCount: number }
  | { ok: false; errors: DetailedError[] };

/** String-error wrapper over the detailed validator. */
export function validateDashboardV2(source: string): V2ValidationResult {
  const result = validateDashboardV2Detailed(source);
  if (result.ok) return result;
  return { ok: false, errors: result.errors.map((e) => e.message) };
}

/** Parse YAML source and structurally validate it as a v2 config. */
export function validateDashboardV2Detailed(source: string): V2DetailedResult {
  let raw: unknown;
  try {
    raw = parse(source, { schema: "core" });
  } catch (e) {
    return {
      ok: false,
      errors: [{ message: e instanceof Error ? e.message.split("\n")[0] : "Invalid YAML", path: null }],
    };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: [{ message: "Config must be a YAML mapping", path: null }] };
  }
  const cfg = raw as Record<string, unknown>;
  const errors: DetailedError[] = [];
  const err = (message: string, path: (string | number)[] | null) =>
    errors.push({ message, path });

  if (cfg.version !== 2) err('"version" must be 2', ["version"]);
  if (typeof cfg.id !== "string" || !ID_RE.test(cfg.id)) {
    err('"id" must be a lowercase slug', ["id"]);
  }
  if (typeof cfg.name !== "string" || cfg.name.trim() === "") {
    err('"name" must be a non-empty string', ["name"]);
  }

  const seenParams = new Set<string>();
  if (cfg.filters === undefined) {
    cfg.filters = [];
  } else if (!Array.isArray(cfg.filters)) {
    err('"filters" must be a list', ["filters"]);
  } else {
    cfg.filters.forEach((f, i) => {
      const filter = (f ?? {}) as Record<string, unknown>;
      if (typeof filter.name !== "string" || !PARAM_NAME_RE.test(filter.name)) {
        err(`filters[${i}].name must be a lowercase identifier`, ["filters", i, "name"]);
        return;
      }
      if (filter.kind !== "dropdown" && filter.kind !== "date_range") {
        err(`filters[${i}].kind must be dropdown or date_range`, ["filters", i, "kind"]);
        return;
      }
      if (filter.kind === "dropdown" && typeof filter.options_sql !== "string") {
        err(`filters[${i}] (dropdown) requires options_sql`, ["filters", i]);
      }
      for (const p of filterParams(filter as unknown as DashboardFilterV2)) {
        if (seenParams.has(p)) err(`filter parameter $${p} declared twice`, ["filters", i, "name"]);
        seenParams.add(p);
      }
    });
  }

  if (!Array.isArray(cfg.panels) || cfg.panels.length === 0) {
    err('"panels" must be a non-empty list', ["panels"]);
  } else {
    cfg.panels.forEach((p, i) => {
      const panel = (p ?? {}) as Record<string, unknown>;
      const kind = panel.kind as string;
      if (!PANEL_KINDS_V2.includes(kind as (typeof PANEL_KINDS_V2)[number])) {
        err(`panels[${i}].kind "${String(panel.kind)}" is not one of: ${PANEL_KINDS_V2.join(", ")}`, ["panels", i, "kind"]);
        return;
      }
      if (typeof panel.title !== "string" || panel.title.trim() === "") {
        err(`panels[${i}].title must be a non-empty string`, ["panels", i, "title"]);
      }
      const hasQuery = typeof panel.query === "string" && panel.query.trim() !== "";
      const hasRef = typeof panel.query_id === "string" && panel.query_id.trim() !== "";
      if (hasQuery === hasRef) {
        err(`panels[${i}] needs exactly one of query or query_id`, ["panels", i]);
      }
      for (const b of REQUIRED_BINDINGS[kind]) {
        if (typeof panel[b] !== "string" || panel[b] === "") {
          err(`panels[${i}] (${kind}) requires the "${b}" binding`, ["panels", i]);
        }
      }
      const emit = panel.emit as Record<string, unknown> | undefined;
      if (emit !== undefined) {
        if (kind !== "bar" && kind !== "doughnut") {
          err(`panels[${i}] (${kind}) does not support emit`, ["panels", i, "emit"]);
        } else if (typeof emit.param !== "string" || !PARAM_NAME_RE.test(emit.param)) {
          err(`panels[${i}].emit.param must be a lowercase identifier`, ["panels", i, "emit"]);
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
