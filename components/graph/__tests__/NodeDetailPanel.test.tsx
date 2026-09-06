// Unit tests for the NodeDetailPanel drawer.

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import type { GraphNode } from "@/lib/graph/build";
import { NODE_TYPE } from "@/lib/graph/build";
import type { Mapping, SourceContainer } from "@/lib/types/config";
import NodeDetailPanel from "../NodeDetailPanel";

const sourceContainer: SourceContainer = {
  id: "src_visa",
  name: "VisaStatements",
  path_prefix: "raw/visa/",
  schema: [
    { name: "amount", type: "number", nullable: false },
    { name: "description", type: "string", nullable: true },
  ],
};

const mapping: Mapping = {
  id: "map_tx",
  name: "TX Mapping",
  source_container_id: "src_visa",
  analytic_table_id: "tbl_tx",
  columns: [{ name: "amt", expr: { kind: "col", name: "amount" } }],
};

const NODE_TYPE_TAG = {
  sourceContainer: NODE_TYPE.sourceContainer,
  lookupMapping: NODE_TYPE.lookupMapping,
  mapping: NODE_TYPE.mapping,
  analyticTable: NODE_TYPE.analyticTable,
} as const;

function makeNode(
  type: keyof typeof NODE_TYPE_TAG,
  id: string,
  entity: unknown,
): GraphNode {
  return {
    id,
    type: NODE_TYPE_TAG[type],
    position: { x: 0, y: 0 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { kind: NODE_TYPE_TAG[type], entity } as any,
  };
}

describe("NodeDetailPanel", () => {
  it("renders nothing when node is null", () => {
    const { container } = render(
      React.createElement(NodeDetailPanel, { node: null }),
    );
    expect(
      container.querySelector('[data-testid="node-detail-panel"]'),
    ).toBeNull();
    cleanup();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    const node = makeNode("mapping", mapping.id, mapping);
    const { container } = render(
      React.createElement(NodeDetailPanel, { node, onClose }),
    );
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="node-detail-panel-close"]',
    );
    expect(button).not.toBeNull();
    button!.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("does not call onEdit when an editor input is focused and blurred without changes", async () => {
    // Seed the store so the editor renders cleanly.
    const { useGraphStore } = await import("@/lib/graph/store");
    useGraphStore.setState({
      config: {
        version: 1,
        source_containers: [sourceContainer],
        lookup_mappings: [],
        mappings: [mapping],
        analytic_tables: [
          {
            id: "tbl_tx",
            name: "Transactions",
            schema: [{ name: "amt", type: "float64" }],
          },
        ],
      },
      etag: null,
    });

    const onEdit = vi.fn();
    const node = makeNode("mapping", mapping.id, mapping);
    const { container } = render(
      React.createElement(NodeDetailPanel, { node, onEdit }),
    );

    // Column rows render quietly; expand the first row to reach the input.
    const row = container.querySelector<HTMLButtonElement>(
      '[data-testid="mapping-column-editor"] button',
    );
    expect(row).not.toBeNull();
    fireEvent.click(row!);
    const exprInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="expression"]',
    );
    expect(exprInput).not.toBeNull();

    // The blur handler re-parses the unchanged text and emits onChange;
    // the panel's equality guard should keep onEdit silent.
    exprInput!.focus();
    exprInput!.blur();

    expect(onEdit).not.toHaveBeenCalled();
    cleanup();
  });
});
