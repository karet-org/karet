// Unit tests for the NodeDetailPanel drawer.

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { GraphNode } from "@/lib/graph/build";
import { NODE_TYPE } from "@/lib/graph/build";
import type { Mapping, SourceContainer } from "@/lib/types/config";
import NodeDetailPanel, {
  NODE_DETAIL_PANEL_WIDTH_PX,
} from "../NodeDetailPanel";

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

  it("is fixed 420px wide on the right edge", () => {
    const node = makeNode("sourceContainer", sourceContainer.id, sourceContainer);
    const { container } = render(
      React.createElement(NodeDetailPanel, { node }),
    );
    const panel = container.querySelector<HTMLElement>(
      '[data-testid="node-detail-panel"]',
    );
    expect(panel).not.toBeNull();
    expect(panel!.style.width).toBe(`${NODE_DETAIL_PANEL_WIDTH_PX}px`);
    expect(NODE_DETAIL_PANEL_WIDTH_PX).toBe(420);
    expect(panel!.className).toContain("fixed");
    expect(panel!.className).toContain("right-0");
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
});
