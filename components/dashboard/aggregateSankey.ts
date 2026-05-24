// Group rows by (from, to) per flow, sum the value column, and return
// a flat link list plus column hints for the sankey layout.

import type { SankeyFlow } from "@/lib/types/dashboard";
import { toNum } from "@/lib/dashboard/format";
import { applyWhere } from "@/lib/dashboard/evalWhere";
import type { Row } from "@/components/dashboard/types";
import { toKey } from "./aggregate";

export interface SankeyLink {
  from: string;
  to: string;
  flow: number;
}

export interface SankeyAggregate {
  links: SankeyLink[];
  /**
   * Layout column index per node, derived from flow ordering: flow[i]'s
   * `from` lands in column i, `to` in column i+1. Larger assignment
   * wins for nodes appearing in multiple flows.
   */
  columns: Record<string, number>;
  /**
   * Source column name per node (flow.from or flow.to). The panel uses
   * this to emit cross-filter clicks. First assignment wins.
   */
  nodeColumns: Record<string, string>;
}

function reduceFlow(values: number[], agg: SankeyFlow["agg"]): number {
  if (values.length === 0) return 0;
  switch (agg) {
    case "count":
      return values.length;
    case "abs_sum":
      return values.reduce((a, b) => a + Math.abs(b), 0);
    case "sum":
    default:
      return values.reduce((a, b) => a + b, 0);
  }
}

/**
 * Aggregate rows into Sankey links. Each flow's `where` runs first;
 * remaining rows are bucketed by (from, to) and reduced via `agg`.
 * Non-positive sums are dropped (a sankey can't render a zero-or-
 * negative ribbon).
 */
export function aggregateSankey(
  rows: Row[],
  flows: SankeyFlow[],
): SankeyAggregate {
  const links: SankeyLink[] = [];
  const columns: Record<string, number> = {};
  const nodeColumns: Record<string, string> = {};
  const place = (key: string, col: number) => {
    columns[key] = Math.max(columns[key] ?? col, col);
  };
  const tagColumn = (key: string, col: string) => {
    if (!(key in nodeColumns)) nodeColumns[key] = col;
  };
  for (let i = 0; i < flows.length; i++) {
    const flow = flows[i];
    const filtered = applyWhere(rows, flow.where);
    const buckets = new Map<string, Map<string, number[]>>();
    for (const row of filtered) {
      const fromK = toKey(row[flow.from]);
      const toK = toKey(row[flow.to]);
      let inner = buckets.get(fromK);
      if (!inner) {
        inner = new Map();
        buckets.set(fromK, inner);
      }
      const arr = inner.get(toK);
      const num = toNum(row[flow.value]) ?? 0;
      if (arr) arr.push(num);
      else inner.set(toK, [num]);
    }
    for (const [from, inner] of buckets) {
      for (const [to, vs] of inner) {
        const flowVal = reduceFlow(vs, flow.agg);
        if (flowVal > 0) {
          links.push({ from, to, flow: flowVal });
          place(from, i);
          place(to, i + 1);
          tagColumn(from, flow.from);
          tagColumn(to, flow.to);
        }
      }
    }
  }
  // Shift columns so the lowest used hint is 0. d3-sankey's nodeAlign
  // must return values in [0, n-1] where n is the graph's actual
  // depth; if a flow produces no data the live hints can start above
  // zero (e.g. accounts→categories without income → hints {1, 2}).
  const minCol = Math.min(...Object.values(columns));
  if (minCol > 0) {
    for (const k of Object.keys(columns)) columns[k] -= minCol;
  }
  return { links, columns, nodeColumns };
}
