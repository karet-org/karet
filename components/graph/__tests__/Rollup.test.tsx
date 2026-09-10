// Rollup: graph wiring, validation rules, and the inspector's error surface.
//
// The rules under test are the ones that make incremental recompute sound:
// the grain must cover the target's partition keys, and the source must
// partition on those keys too.

import React from "react";
import { describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { AnalyticTable, PipelineConfig, Rollup } from "@/lib/types/config";
import { aggregateOutputs, isGrainLocked } from "@/lib/types/config";
import { buildGraph, findNode, NODE_TYPE } from "@/lib/graph/build";
import { addNodeToConfig } from "@/lib/graph/nodeDefaults";
import { validateRollup } from "@/components/graph/detail/validation";
import RollupEditor, {
  ROLLUP_EDITOR_ERROR_TESTID,
} from "@/components/graph/detail/RollupEditor";

function table(
  id: string,
  columns: string[],
  partition_keys: string[] = [],
): AnalyticTable {
  return {
    id,
    name: id,
    schema: columns.map((name) => ({ name, type: "string" })),
    partition_keys,
  };
}

const ROLLUP: Rollup = {
  id: "daily",
  name: "Daily",
  source_table_id: "traffic",
  analytic_table_id: "traffic_daily",
  group_by: ["date", "host"],
  aggregates: [
    { name: "requests", fn: "count" },
    { name: "bytes", fn: "sum", column: "bytes" },
  ],
};

const SOURCE = table("traffic", ["date", "host", "bytes"], ["date"]);
const TARGET = table("traffic_daily", ["date", "host", "requests", "bytes"], ["date"]);

function config(rollups: Rollup[]): PipelineConfig {
  return {
    version: 1,
    name: "p",
    source_containers: [],
    dimensions: [],
    mappings: [],
    analytic_tables: [SOURCE, TARGET],
    rollups,
  };
}

describe("rollup graph model", () => {
  it("renders a node and edges from the source table through to the target", () => {
    const { nodes, edges } = buildGraph(config([ROLLUP]));
    const node = nodes.find((n) => n.id === "daily");
    expect(node?.type).toBe(NODE_TYPE.rollup);
    expect(edges.map((e) => e.id)).toEqual(
      expect.arrayContaining(["traffic->daily", "daily->traffic_daily"]),
    );
  });

  it("finds a rollup node by id", () => {
    expect(findNode(config([ROLLUP]), "daily")?.type).toBe(NODE_TYPE.rollup);
  });

  it("adds a rollup with a count aggregate and no grain yet", () => {
    const next = addNodeToConfig(config([]), "rollup");
    expect(next.rollups).toHaveLength(1);
    expect(next.rollups?.[0].aggregates[0].fn).toBe("count");
    expect(next.rollups?.[0].group_by).toEqual([]);
  });
});

describe("rollup output columns", () => {
  it("stores avg as a sum/count pair and marks it re-aggregatable", () => {
    expect(aggregateOutputs({ name: "size", fn: "avg", column: "bytes" })).toEqual([
      "size_sum",
      "size_count",
    ]);
    expect(isGrainLocked({ name: "size", fn: "avg", column: "bytes" })).toBe(false);
  });

  it("marks count_distinct and median grain-locked", () => {
    expect(isGrainLocked({ name: "v", fn: "count_distinct", column: "ip" })).toBe(true);
    expect(isGrainLocked({ name: "p50", fn: "median", column: "ms" })).toBe(true);
  });
});

describe("validateRollup", () => {
  it("accepts a rollup whose grain covers the target's partition key", () => {
    expect(validateRollup(ROLLUP, SOURCE, TARGET).errors).toEqual([]);
  });

  it("rejects a grain that omits the target's partition key", () => {
    const r = { ...ROLLUP, group_by: ["host"] };
    const errors = validateRollup(r, SOURCE, TARGET).errors;
    expect(errors.some((e) => e.includes('partition key "date"'))).toBe(true);
  });

  it("rejects a target partitioned on a key the source does not partition on", () => {
    const source = table("traffic", ["date", "host", "bytes"]);
    const errors = validateRollup(ROLLUP, source, TARGET).errors;
    expect(errors.some((e) => e.includes("recompute one partition at a time"))).toBe(true);
  });

  it("requires a column for everything but count, and flags undeclared outputs", () => {
    const r: Rollup = {
      ...ROLLUP,
      aggregates: [
        { name: "bytes", fn: "sum" },
        { name: "unknown_out", fn: "count" },
      ],
    };
    const errors = validateRollup(r, SOURCE, TARGET).errors;
    expect(errors.some((e) => e.includes("needs a column"))).toBe(true);
    expect(errors.some((e) => e.includes('"unknown_out" is not declared'))).toBe(true);
  });

  it("rejects reading and writing the same table", () => {
    const r = { ...ROLLUP, analytic_table_id: "traffic" };
    const errors = validateRollup(r, SOURCE, SOURCE).errors;
    expect(errors.some((e) => e.includes("read and write the same table"))).toBe(true);
  });
});

describe("RollupEditor", () => {
  function renderEditor(value: Rollup) {
    return render(
      React.createElement(RollupEditor, {
        value,
        onChange: () => {},
        tables: [SOURCE, TARGET],
      }),
    );
  }

  it("shows no error for a valid rollup", () => {
    const { container } = renderEditor(ROLLUP);
    expect(
      container.querySelector(`[data-testid="${ROLLUP_EDITOR_ERROR_TESTID}"]`),
    ).toBeNull();
    cleanup();
  });

  it("surfaces the partition-key rule when the grain is wrong", () => {
    const { container } = renderEditor({ ...ROLLUP, group_by: ["host"] });
    expect(
      container.querySelector(`[data-testid="${ROLLUP_EDITOR_ERROR_TESTID}"]`),
    ).not.toBeNull();
    cleanup();
  });

  it("drops the column when an aggregate switches to count", () => {
    let latest: Rollup | undefined;
    const { getAllByTestId, getByLabelText } = render(
      React.createElement(RollupEditor, {
        value: ROLLUP,
        onChange: (next: Rollup) => {
          latest = next;
        },
        tables: [SOURCE, TARGET],
      }),
    );
    fireEvent.click(getAllByTestId("rollup-editor-agg")[1]);
    fireEvent.change(getByLabelText("aggregate 1 fn"), { target: { value: "count" } });
    expect(latest?.aggregates[1]).toEqual({ name: "bytes", fn: "count" });
    cleanup();
  });
});
