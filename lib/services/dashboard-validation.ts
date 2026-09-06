// Structural validation for dashboard configs: the editor's live
// feedback and the publish gate.

import type { DashboardConfig } from "@/lib/types/dashboard";

export const PANEL_KINDS = [
  "kpi",
  "summary",
  "doughnut",
  "line",
  "bar",
  "table",
  "symbol_map",
  "choropleth_map",
  "sankey",
] as const;

const FILTER_KINDS = ["dropdown", "date_range"] as const;
const ID_RE = /^[a-z0-9][a-z0-9-_]*$/;

export type ValidationResult =
  | { ok: true; config: DashboardConfig; panelCount: number }
  | { ok: false; errors: string[] };

export function validateDashboardConfig(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ["Config must be a JSON object"] };
  }
  const cfg = raw as Record<string, unknown>;

  if (typeof cfg.id !== "string" || !ID_RE.test(cfg.id)) {
    errors.push('"id" must be a lowercase slug (letters, digits, - or _)');
  }
  if (typeof cfg.name !== "string" || cfg.name.trim() === "") {
    errors.push('"name" must be a non-empty string');
  }
  if (typeof cfg.analytic_table_id !== "string" || cfg.analytic_table_id === "") {
    errors.push('"analytic_table_id" must name an analytic table');
  }
  if (cfg.query_id !== undefined && typeof cfg.query_id !== "string") {
    errors.push('"query_id" must be a string when present');
  }

  if (!Array.isArray(cfg.panels) || cfg.panels.length === 0) {
    errors.push('"panels" must be a non-empty array');
  } else {
    cfg.panels.forEach((p, i) => {
      if (typeof p !== "object" || p === null) {
        errors.push(`panels[${i}] must be an object`);
        return;
      }
      const panel = p as Record<string, unknown>;
      if (!PANEL_KINDS.includes(panel.kind as (typeof PANEL_KINDS)[number])) {
        errors.push(
          `panels[${i}].kind "${String(panel.kind)}" is not one of: ${PANEL_KINDS.join(", ")}`,
        );
      }
      if (typeof panel.title !== "string" || panel.title.trim() === "") {
        errors.push(`panels[${i}].title must be a non-empty string`);
      }
    });
  }

  if (!Array.isArray(cfg.filters)) {
    errors.push('"filters" must be an array (use [] for no filters)');
  } else {
    {
      cfg.filters.forEach((f, i) => {
        const filter = (f ?? {}) as Record<string, unknown>;
        if (!FILTER_KINDS.includes(filter.kind as (typeof FILTER_KINDS)[number])) {
          errors.push(
            `filters[${i}].kind "${String(filter.kind)}" is not one of: ${FILTER_KINDS.join(", ")}`,
          );
        }
        if (typeof filter.column !== "string" || filter.column === "") {
          errors.push(`filters[${i}].column must be a column name`);
        }
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    config: cfg as unknown as DashboardConfig,
    panelCount: (cfg.panels as unknown[]).length,
  };
}
