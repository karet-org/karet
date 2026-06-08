// Group rows by (from, to) per flow, aggregate the value column, and
// return a link list plus column hints for the sankey layout.

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
  /** Layout column per node: flow[i].from = i, flow[i].to = i+1, max wins. */
  columns: Record<string, number>;
  /** Source column name (flow.from or flow.to) per node, for cross-filter clicks. */
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
          // Skip self-links and links that would close a cycle; d3-sankey
          // throws "circular link" on either.
          if (from === to || wouldCreateCycle(links, from, to)) continue;
          links.push({ from, to, flow: flowVal });
          place(from, i);
          place(to, i + 1);
          tagColumn(from, flow.from);
          tagColumn(to, flow.to);
        }
      }
    }
  }
  // Shift hints so the lowest used column is 0.
  const usedCols = Object.values(columns);
  const minCol = usedCols.length > 0 ? Math.min(...usedCols) : 0;
  if (minCol > 0) {
    for (const k of Object.keys(columns)) columns[k] -= minCol;
  }
  return { links, columns, nodeColumns };
}

/**
 * True if adding `from -> to` would close a directed cycle, i.e. `to` can
 * already reach `from` along existing links.
 */
function wouldCreateCycle(
  links: SankeyLink[],
  from: string,
  to: string,
): boolean {
  if (from === to) return true;
  // BFS from `to`, following edges; if we reach `from`, a cycle would form.
  const adjacency = new Map<string, string[]>();
  for (const l of links) {
    const outs = adjacency.get(l.from);
    if (outs) outs.push(l.to);
    else adjacency.set(l.from, [l.to]);
  }
  const queue = [to];
  const seen = new Set<string>([to]);
  while (queue.length > 0) {
    const node = queue.shift() as string;
    if (node === from) return true;
    for (const next of adjacency.get(node) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}
