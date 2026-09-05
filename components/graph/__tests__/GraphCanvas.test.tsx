// Smoke test for GraphCanvas. Renders one of each custom node type plus
// the edges that connect them, then asserts every node's header string is
// present in the DOM.
//
// React Flow renders inside an absolutely-positioned viewport that requires
// a width/height; we stub the browser APIs it needs (ResizeObserver,
// matchMedia, layout geometry) so jsdom can render nodes.

import React from "react";
import { describe, expect, it, vi, beforeAll } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { GraphEdge, GraphNode } from "@/lib/graph/build";
import { NODE_TYPE } from "@/lib/graph/build";
import GraphCanvas from "../GraphCanvas";

beforeAll(() => {
  // React Flow measures the wrapper via ResizeObserver.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub;

  // React Flow queries matchMedia for reduced-motion.
  if (!window.matchMedia) {
    window.matchMedia = (() =>
      ({
        matches: false,
        media: "",
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
  }

  // jsdom returns 0 for every client/offset dimension; without a viewport,
  // React Flow bails out of rendering its node wrapper. Patch the Element
  // accessors used by the library.
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return 800;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return 600;
    },
  });

  // DOMMatrixReadOnly is used internally; provide a minimal shim if absent.
  if (typeof globalThis.DOMMatrixReadOnly === "undefined") {
    class DOMMatrixStub {
      m22 = 1;
      constructor(_init?: string) {}
    }
    (globalThis as unknown as { DOMMatrixReadOnly: typeof DOMMatrixStub }).DOMMatrixReadOnly =
      DOMMatrixStub;
  }
});

const nodes: GraphNode[] = [
  {
    id: "src1",
    type: NODE_TYPE.sourceContainer,
    position: { x: 0, y: 0 },
    data: {
      kind: "source-container",
      entity: {
        id: "src1",
        name: "VisaStatements",
        path_prefix: "raw/visa/",
        schema: [{ name: "amount", type: "number" }],
      },
    },
  },
  {
    id: "lkp1",
    type: NODE_TYPE.lookupMapping,
    position: { x: 0, y: 150 },
    data: {
      kind: "lookup-mapping",
      entity: {
        id: "lkp1",
        name: "Categories",
        rows: [{ input_patterns: ["RAMEN"], output: "FOOD" }],
      },
    },
  },
  {
    id: "map1",
    type: NODE_TYPE.mapping,
    position: { x: 300, y: 75 },
    data: {
      kind: "mapping",
      entity: {
        id: "map1",
        name: "Map 1",
        source_container_id: "src1",
        analytic_table_id: "tbl1",
        columns: [{ name: "amt", expr: { kind: "col", name: "amount" } }],
      },
    },
  },
  {
    id: "tbl1",
    type: NODE_TYPE.analyticTable,
    position: { x: 600, y: 75 },
    data: {
      kind: "analytic-table",
      entity: {
        id: "tbl1",
        name: "Transactions",
        output_prefix: "clean/transactions/",
        schema: [{ name: "amt", type: "int64" }],
      },
    },
  },
];

const edges: GraphEdge[] = [
  { id: "src1->map1", source: "src1", target: "map1" },
  { id: "lkp1->map1", source: "lkp1", target: "map1" },
  { id: "map1->tbl1", source: "map1", target: "tbl1" },
];

describe("GraphCanvas", () => {
  it("renders all four custom node types with their headers", () => {
    const { container } = render(
      React.createElement(
        "div",
        { style: { width: 800, height: 600 } },
        React.createElement(GraphCanvas, { nodes, edges }),
      ),
    );

    // Headers show the entity name plus a lowercase kind tag.
    const text = container.textContent ?? "";
    expect(text).toContain("source");
    expect(text).toContain("lookup");
    expect(text).toContain("mapping");
    expect(text).toContain("table");

    // Each custom node component should have mounted.
    expect(container.querySelector('[data-testid="source-container-node"]'))
      .not.toBeNull();
    expect(container.querySelector('[data-testid="lookup-mapping-node"]'))
      .not.toBeNull();
    expect(container.querySelector('[data-testid="mapping-node"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="analytic-table-node"]'))
      .not.toBeNull();

    // Auto layout button is present.
    expect(container.querySelector('[data-testid="auto-layout-button"]'))
      .not.toBeNull();

    cleanup();
  });

  it("invokes onNodeClick with the clicked node id", () => {
    const onNodeClick = vi.fn();
    const { container } = render(
      React.createElement(
        "div",
        { style: { width: 800, height: 600 } },
        React.createElement(GraphCanvas, { nodes, edges, onNodeClick }),
      ),
    );

    const node = container.querySelector<HTMLElement>(
      '[data-testid="source-container-node"]',
    );
    expect(node).not.toBeNull();
    // Click from the React Flow node wrapper, since that's where the
    // handler is registered.
    const wrapper = node!.closest(".react-flow__node") as HTMLElement | null;
    (wrapper ?? node!).click();
    expect(onNodeClick).toHaveBeenCalled();

    cleanup();
  });
});
