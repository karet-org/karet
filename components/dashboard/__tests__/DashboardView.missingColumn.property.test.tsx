// Dashboard panel with missing column renders error; other panels render normally
//
// Generates dashboard configs where exactly one randomly-chosen panel
// references a column that is NOT present in the Analytic_Table schema.
// Asserts:
//   1. The targeted panel renders as an ErrorPanel (`role="alert"`).
//   2. Every other panel renders its regular panel-kind container
//      (not an ErrorPanel).
//

import React from "react";
import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { render, cleanup } from "@testing-library/react";
import type { ColumnSchema } from "@/lib/types/config";
import type { DashboardConfig, Panel } from "@/lib/types/dashboard";
import { arbDashboardConfig } from "@/lib/testgen";
import DashboardView from "../DashboardView";
import { requiredColumns } from "../types";

// Mock chart.js rendering, see DashboardView.order.property.test.tsx.
vi.mock("react-chartjs-2", () => {
  const stub = () => null;
  return { Doughnut: stub, Line: stub, Bar: stub };
});

/** Sentinel column name guaranteed not to appear in generated panels. */
const MISSING = "__definitely_missing_col__";

/** Map a panel to `kind`-specific testid produced by the panel components. */
function expectedTestId(panel: Panel): string {
  return `${panel.kind}-panel`;
}

/**
 * Rewrite `panel` so that one of its column references points at a column
 * that is guaranteed missing from the schema. Returns a new panel object
 * without mutating the input.
 */
function breakPanel(panel: Panel): Panel {
  switch (panel.kind) {
    case "kpi":
      return { ...panel, column: MISSING };
    case "summary":
      return { ...panel, columns: [MISSING, ...panel.columns.slice(1)] };
    case "doughnut":
      return { ...panel, group_by: MISSING };
    case "line":
      return { ...panel, x: MISSING };
    case "bar":
      return { ...panel, group_by: MISSING };
    case "table":
      return { ...panel, columns: [MISSING, ...panel.columns.slice(1)] };
    case "symbol_map":
      return { ...panel, lat: MISSING };
    case "choropleth_map":
      return { ...panel, country: MISSING };
    case "sankey": {
      const flows = panel.flows.length === 0
        ? panel.flows
        : [{ ...panel.flows[0], from: MISSING }, ...panel.flows.slice(1)];
      return { ...panel, flows };
    }
  }
}

describe("missing-column error isolation", () => {
  it("errors only the targeted panel; other panels render normally", () => {
    // Pair each config with a random panel index to break; bounded so the
    // generator stays fast.
    const scenario = arbDashboardConfig.chain((cfg) =>
      fc
        .integer({ min: 0, max: cfg.panels.length - 1 })
        .map((brokenIndex) => ({ cfg, brokenIndex })),
    );

    fc.assert(
      fc.property(scenario, ({ cfg, brokenIndex }) => {
        // Build a schema that satisfies every OTHER panel and rewrite
        // the target panel to reference MISSING.
        const otherCols = new Set<string>();
        for (let i = 0; i < cfg.panels.length; i++) {
          if (i === brokenIndex) continue;
          for (const c of requiredColumns(cfg.panels[i])) otherCols.add(c);
        }
        // Ensure MISSING is not accidentally satisfied by the generator.
        otherCols.delete(MISSING);
        const schema: ColumnSchema[] = Array.from(otherCols).map((name) => ({
          name,
          type: "string",
        }));

        const brokenPanels: Panel[] = cfg.panels.map((p, i) =>
          i === brokenIndex ? breakPanel(p) : p,
        );
        const brokenCfg: DashboardConfig = { ...cfg, panels: brokenPanels };

        const { container } = render(
          React.createElement(DashboardView, {
            config: brokenCfg,
            rows: [],
            schema,
          }),
        );

        const slots = Array.from(
          container.querySelectorAll<HTMLElement>(
            '[data-testid="panel-slot"]',
          ),
        );
        expect(slots.length).toBe(brokenCfg.panels.length);

        for (let i = 0; i < slots.length; i++) {
          const slot = slots[i];
          const errorPanel = slot.querySelector(
            '[data-testid="error-panel"]',
          );

          if (i === brokenIndex) {
            // Broken panel: error, not the normal panel container.
            expect(errorPanel).not.toBeNull();
            expect(errorPanel?.getAttribute("role")).toBe("alert");
            const regular = slot.querySelector(
              `[data-testid="${expectedTestId(brokenCfg.panels[i])}"]`,
            );
            expect(regular).toBeNull();
          } else {
            // Other panels: regular container, no error.
            expect(errorPanel).toBeNull();
            const regular = slot.querySelector(
              `[data-testid="${expectedTestId(brokenCfg.panels[i])}"]`,
            );
            expect(regular).not.toBeNull();
          }
        }

        cleanup();
      }),
      { numRuns: 100 },
    );
  });
});
