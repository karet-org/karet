// A file-backed dimension has no patterns to preview, so the node shows where
// its rows come from instead of rendering an empty body.

import React from "react";
import { describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import type { Dimension } from "@/lib/types/config";
import DimensionNode from "../DimensionNode";

function renderNode(entity: Dimension) {
  return render(
    React.createElement(
      ReactFlowProvider,
      null,
      React.createElement(DimensionNode, {
        id: entity.id,
        data: { kind: "dimension", entity },
        selected: false,
        type: "dimension",
        dragging: false,
        zIndex: 0,
        isConnectable: true,
        positionAbsoluteX: 0,
        positionAbsoluteY: 0,
      } as never),
    ),
  );
}

describe("DimensionNode", () => {
  it("previews the lake folder and value columns for file-backed rows", () => {
    const { getByText } = renderNode({
      id: "countries",
      name: "Countries",
      match: "exact",
      rows: { path_prefix: "dim_countries/", key: "code", values: ["country_name", "region"] },
    });
    expect(getByText("dim_countries/")).toBeTruthy();
    expect(getByText("code → country_name, region")).toBeTruthy();
    cleanup();
  });

  it("previews patterns for inline rows", () => {
    const { getByText } = renderNode({
      id: "crawlers",
      name: "Crawlers",
      match: "keyword_substring",
      rows: { values: ["crawler"], rows: [{ patterns: ["googlebot"], values: ["Google"] }] },
    });
    expect(getByText("googlebot")).toBeTruthy();
    cleanup();
  });
});
