// Dashboard panels render in declared order
//
// Generates dashboard configs with random panel lists, builds a schema that
// satisfies every panel's column references, renders the DashboardView, and
// asserts the DOM order of panel slots matches the config's panel order.
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

// Chart.js pulls `canvas` into jsdom, which isn't available. Stub the
// chart primitives with no-op components so the tree still renders
// deterministically. The mock factory is hoisted — it must avoid JSX and
// outer-scope references.
vi.mock("react-chartjs-2", () => {
  const stub = () => null;
  return { Doughnut: stub, Line: stub, Bar: stub };
});

/** Build a schema that covers every column referenced by any panel. */
function schemaFromConfig(cfg: DashboardConfig): ColumnSchema[] {
  const cols = new Set<string>();
  for (const p of cfg.panels) for (const c of requiredColumns(p)) cols.add(c);
  return Array.from(cols).map((name) => ({ name, type: "string" }));
}

function panelTitle(panel: Panel): string {
  return panel.title;
}

describe("Dashboard panels render in declared order", () => {
  it("renders one panel slot per config.panels entry, in order", () => {
    fc.assert(
      fc.property(arbDashboardConfig, (cfg) => {
        const schema = schemaFromConfig(cfg);
        const { container } = render(
          React.createElement(DashboardView, {
            config: cfg,
            rows: [],
            schema,
          }),
        );

        const slots = Array.from(
          container.querySelectorAll<HTMLElement>(
            '[data-testid="panel-slot"]',
          ),
        );

        expect(slots.length).toBe(cfg.panels.length);

        // Each slot's data-panel-index must match its document position,
        // and the declared title must match the config order. The index
        // check defends against e.g. reversed iteration.
        for (let i = 0; i < slots.length; i++) {
          const slot = slots[i];
          expect(slot.getAttribute("data-panel-index")).toBe(String(i));
          expect(slot.getAttribute("data-panel-title")).toBe(
            panelTitle(cfg.panels[i]),
          );
        }

        cleanup();
      }),
      { numRuns: 100 },
    );
  });
});
