// The row filter is opt-in: most mappings have none, so the panel shows a
// toggle rather than an always-present expression box. Turning it off must
// drop the predicate, since a filter that still ran while hidden would be
// worse than no toggle at all.

import React from "react";
import { describe, expect, it, beforeEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { Mapping, PipelineConfig } from "@/lib/types/config";
import { useGraphStore } from "@/lib/graph/store";
import MappingEditor from "../detail/MappingEditor";

const TABLE = {
  id: "t",
  name: "T",
  schema: [
    { name: "status", type: "int64" },
    { name: "path", type: "string" },
  ],
};

const CONFIG: PipelineConfig = {
  version: 1,
  name: "p",
  source_containers: [
    { id: "src", name: "Src", path_prefix: "src/", schema: [{ name: "a", type: "string" }] },
  ],
  dimensions: [],
  mappings: [],
  analytic_tables: [TABLE],
};

function mapping(where?: Mapping["where"]): Mapping {
  return {
    id: "m",
    name: "M",
    source_container_id: "src",
    analytic_table_id: "t",
    columns: [
      { name: "status", expr: { kind: "col", name: "a" } },
      { name: "path", expr: { kind: "col", name: "a" } },
    ],
    ...(where ? { where } : {}),
  };
}

function renderEditor(value: Mapping, onChange: (next: Mapping) => void = () => {}) {
  return render(React.createElement(MappingEditor, { value, onChange }));
}

describe("MappingEditor row filter", () => {
  beforeEach(() => {
    useGraphStore.setState({ config: CONFIG });
  });

  it("is off with no input shown when the mapping has no filter", () => {
    const { getByTestId, queryByLabelText } = renderEditor(mapping());
    expect(getByTestId("mapping-filter-toggle").getAttribute("aria-checked")).toBe("false");
    expect(queryByLabelText("row filter")).toBeNull();
    cleanup();
  });

  it("starts on when the mapping already filters", () => {
    const { getByTestId, getByLabelText } = renderEditor(
      mapping({
        kind: "ge",
        left: { kind: "col", name: "status" },
        right: { kind: "num", value: 500 },
      }),
    );
    expect(getByTestId("mapping-filter-toggle").getAttribute("aria-checked")).toBe("true");
    expect((getByLabelText("row filter") as HTMLInputElement).value).toContain("ge(");
    cleanup();
  });

  it("reveals the input when switched on, without touching the config", () => {
    let latest: Mapping | undefined;
    const { getByTestId, getByLabelText } = renderEditor(mapping(), (next) => {
      latest = next;
    });
    fireEvent.click(getByTestId("mapping-filter-toggle"));
    expect(getByLabelText("row filter")).toBeTruthy();
    // Revealing an empty box is not an edit.
    expect(latest).toBeUndefined();
    cleanup();
  });

  it("drops the predicate when switched off", () => {
    let latest: Mapping | undefined;
    const withFilter = mapping({
      kind: "ge",
      left: { kind: "col", name: "status" },
      right: { kind: "num", value: 500 },
    });
    const { getByTestId, queryByLabelText } = renderEditor(withFilter, (next) => {
      latest = next;
    });
    fireEvent.click(getByTestId("mapping-filter-toggle"));
    expect(queryByLabelText("row filter")).toBeNull();
    expect(latest).toBeDefined();
    expect("where" in (latest as Mapping)).toBe(false);
    cleanup();
  });
});
