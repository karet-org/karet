"use client";

// Sankey panel: d3-sankey layout + SVG render. Click a node to emit a
// cross-filter on its source column; ribbons are hover-only.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  sankey as d3Sankey,
  sankeyLinkHorizontal,
  type SankeyGraph,
  type SankeyLink as D3Link,
  type SankeyNode as D3Node,
} from "d3-sankey";
import type { Panel } from "@/lib/types/dashboard";
import { CHART_ACCENT, CHART_PALETTE } from "@/lib/dashboard/palette";
import { aggregateSankey } from "./aggregateSankey";
import type { CrossFilterProps, PanelProps } from "./types";

type SankeyPanelConfig = Extract<Panel, { kind: "sankey" }>;

interface NodeDatum {
  name: string;
  columnHint?: number;
}

interface LinkDatum {
  source: number;
  target: number;
  value: number;
}

const NODE_WIDTH = 16;
const NODE_PADDING = 10;
const MIN_HEIGHT = 320;
// Below this the label gutters crowd out the flows, so we render at this
// width and let the container scroll horizontally.
const MIN_RENDER_WIDTH = 560;
const PADDING = 8;
// Node labels anchor inward (toward center), so these side gutters are just
// breathing room that keeps the outermost nodes off the panel edge.
const LABEL_PAD_LEFT = 80;
const LABEL_PAD_RIGHT = 80;
const DIM_OPACITY = 0.2;

function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return CHART_PALETTE[Math.abs(h) % CHART_PALETTE.length];
}

function displayName(
  name: string,
  labels: Record<string, string> | undefined,
): string {
  return labels?.[name] ?? name;
}

type Hover =
  | { kind: "node"; name: string; value: number; x: number; y: number }
  | { kind: "link"; from: string; to: string; value: number; x: number; y: number };

export function SankeyPanel({
  config,
  rows,
  onFilter,
  activeFilter,
}: PanelProps<SankeyPanelConfig> & CrossFilterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<Hover | null>(null);
  const height = parseSize(config.grid?.maxHeight) ?? MIN_HEIGHT;
  // Draw at least MIN_RENDER_WIDTH; the container scrolls when narrower.
  const renderWidth = Math.max(width, MIN_RENDER_WIDTH);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // d3-sankey mutates its input; recompute every render.
  const computed = useMemo(() => {
    const { links, columns, nodeColumns } = aggregateSankey(rows, config.flows);
    if (links.length === 0) return null;

    const indexByName = new Map<string, number>();
    const nodes: NodeDatum[] = [];
    const ensure = (name: string) => {
      let i = indexByName.get(name);
      if (i === undefined) {
        i = nodes.length;
        indexByName.set(name, i);
        nodes.push({ name, columnHint: columns[name] });
      }
      return i;
    };

    const linkData: LinkDatum[] = links.map((l) => ({
      source: ensure(l.from),
      target: ensure(l.to),
      value: l.flow,
    }));

    const columnByIndex = nodes.map((n) => n.columnHint ?? -1);
    const maxCol = Math.max(0, ...columnByIndex);

    const sankeyGen = d3Sankey<NodeDatum, LinkDatum>()
      .nodeWidth(NODE_WIDTH)
      .nodePadding(NODE_PADDING)
      .extent([
        [LABEL_PAD_LEFT, PADDING],
        [Math.max(renderWidth - LABEL_PAD_RIGHT, LABEL_PAD_LEFT + 100), height - PADDING],
      ])
      .nodeAlign((node) => {
        const idx = (node as D3Node<NodeDatum, LinkDatum>).index;
        const hint = idx !== undefined ? columnByIndex[idx] : -1;
        if (hint >= 0) return hint;
        const n = node as D3Node<NodeDatum, LinkDatum>;
        const hasInflow = (n.targetLinks?.length ?? 0) > 0;
        const hasOutflow = (n.sourceLinks?.length ?? 0) > 0;
        if (!hasInflow) return 0;
        if (!hasOutflow) return maxCol;
        return Math.floor(maxCol / 2);
      });

    // Guard the layout: d3-sankey throws "circular link" on any cycle.
    try {
      const graph: SankeyGraph<NodeDatum, LinkDatum> = sankeyGen({
        nodes: nodes.map((n) => ({ ...n })),
        links: linkData.map((l) => ({ ...l })),
      });
      // Re-pin each node's x to its declared column. d3-sankey collapses
      // disjoint chains into too few columns, stacking nodes vertically.
      const left = LABEL_PAD_LEFT;
      const right = Math.max(renderWidth - LABEL_PAD_RIGHT, LABEL_PAD_LEFT + 100);
      const colSpacing = maxCol > 0 ? (right - left - NODE_WIDTH) / maxCol : 0;
      for (const node of graph.nodes) {
        const col = node.columnHint ?? 0;
        node.x0 = left + col * colSpacing;
        node.x1 = node.x0 + NODE_WIDTH;
      }
      return { graph, nodeColumns };
    } catch (err) {
      console.warn("Sankey layout failed; rendering empty panel:", err);
      return null;
    }
  }, [rows, config.flows, renderWidth, height]);

  return (
    <div
      data-testid="sankey-panel"
      className="flex flex-1 flex-col min-w-0 rounded-lg border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-emerald-600">{config.title}</h3>
      <div
        ref={containerRef}
        className="relative mt-3 overflow-x-auto overflow-y-hidden"
        style={{ height }}
      >
        {width === 0 ? null : !computed ? (
          <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-ink-3)]">
            No data
          </div>
        ) : (
          <>
            <SankeySvg
              layout={computed.graph}
              nodeColumns={computed.nodeColumns}
              width={renderWidth}
              height={height}
              labels={config.labels}
              activeFilter={activeFilter ?? null}
              onFilter={onFilter}
              onHover={setHover}
            />
            {hover ? (
              <SankeyTooltip hover={hover} labels={config.labels} containerWidth={renderWidth} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function SankeySvg({
  layout,
  nodeColumns,
  width,
  height,
  labels,
  activeFilter,
  onFilter,
  onHover,
}: {
  layout: SankeyGraph<NodeDatum, LinkDatum>;
  nodeColumns: Record<string, string>;
  width: number;
  height: number;
  labels: Record<string, string> | undefined;
  activeFilter: { column: string; value: string } | null;
  onFilter?: (column: string, value: string) => void;
  onHover: (h: Hover | null) => void;
}) {
  const linkPath = sankeyLinkHorizontal<NodeDatum, LinkDatum>();
  const midX = width / 2;

  const filterColumns = new Set(Object.values(nodeColumns));
  const isFiltered =
    activeFilter !== null && filterColumns.has(activeFilter.column);

  let activeIdx = -1;
  const litNodes = new Set<number>();
  const litLinks = new Set<number>();
  if (isFiltered) {
    for (const n of layout.nodes) {
      if (
        n.name === activeFilter.value &&
        nodeColumns[n.name] === activeFilter.column
      ) {
        activeIdx = n.index ?? -1;
        break;
      }
    }
    if (activeIdx >= 0) {
      litNodes.add(activeIdx);
      layout.links.forEach((l, i) => {
        const src = (l.source as D3Node<NodeDatum, LinkDatum>).index ?? -1;
        const tgt = (l.target as D3Node<NodeDatum, LinkDatum>).index ?? -1;
        if (src === activeIdx || tgt === activeIdx) {
          litLinks.add(i);
          litNodes.add(src);
          litNodes.add(tgt);
        }
      });
    }
  }

  const handleNodeClick = (name: string) => {
    if (!onFilter) return;
    const col = nodeColumns[name];
    if (col) onFilter(col, name);
  };

  return (
    <svg
      width={width}
      height={height}
      className="block"
      onMouseLeave={() => onHover(null)}
    >
      <defs>
        {layout.links.map((l, i) => {
          const src = l.source as D3Node<NodeDatum, LinkDatum>;
          const tgt = l.target as D3Node<NodeDatum, LinkDatum>;
          return (
            <linearGradient
              key={`grad-${i}`}
              id={`sankey-grad-${i}`}
              gradientUnits="userSpaceOnUse"
              x1={src.x1 ?? 0}
              x2={tgt.x0 ?? 0}
            >
              <stop offset="0%" stopColor={colorFor(src.name)} stopOpacity={0.5} />
              <stop offset="100%" stopColor={colorFor(tgt.name)} stopOpacity={0.5} />
            </linearGradient>
          );
        })}
      </defs>

      {/* Links first; nodes paint over them. */}
      <g fill="none">
        {layout.links.map((l, i) => {
          const d = linkPath(l as D3Link<NodeDatum, LinkDatum>);
          if (!d) return null;
          const src = l.source as D3Node<NodeDatum, LinkDatum>;
          const tgt = l.target as D3Node<NodeDatum, LinkDatum>;
          const lit = !isFiltered || litLinks.has(i);
          return (
            <path
              key={`link-${i}`}
              d={d}
              stroke={`url(#sankey-grad-${i})`}
              strokeWidth={Math.max(1, l.width ?? 1)}
              opacity={lit ? 1 : DIM_OPACITY}
              onMouseMove={(e) =>
                onHover({
                  kind: "link",
                  from: src.name,
                  to: tgt.name,
                  value: l.value ?? 0,
                  x: e.nativeEvent.offsetX,
                  y: e.nativeEvent.offsetY,
                })
              }
            />
          );
        })}
      </g>

      <g>
        {layout.nodes.map((n, i) => {
          const x0 = n.x0 ?? 0;
          const x1 = n.x1 ?? 0;
          const y0 = n.y0 ?? 0;
          const y1 = n.y1 ?? 0;
          const labelOnRight = (x0 + x1) / 2 < midX;
          const lit = !isFiltered || litNodes.has(i);
          const isActive = i === activeIdx;
          const clickable = onFilter !== undefined && nodeColumns[n.name] !== undefined;
          return (
            <g key={`node-${i}`}>
              <rect
                x={x0}
                y={y0}
                width={Math.max(0, x1 - x0)}
                height={Math.max(0, y1 - y0)}
                fill={colorFor(n.name)}
                stroke={isActive ? CHART_ACCENT : "rgba(0,0,0,0.2)"}
                strokeWidth={isActive ? 2 : 1}
                opacity={lit ? 1 : DIM_OPACITY}
                style={{ cursor: clickable ? "pointer" : "default" }}
                onClick={() => handleNodeClick(n.name)}
                onMouseMove={(e) =>
                  onHover({
                    kind: "node",
                    name: n.name,
                    value: n.value ?? 0,
                    x: e.nativeEvent.offsetX,
                    y: e.nativeEvent.offsetY,
                  })
                }
              />
              <text
                x={labelOnRight ? x1 + 6 : x0 - 6}
                y={(y0 + y1) / 2}
                dy="0.35em"
                textAnchor={labelOnRight ? "start" : "end"}
                fontSize={11}
                fill="#374151"
                opacity={lit ? 1 : DIM_OPACITY}
                style={{ pointerEvents: "none" }}
              >
                {displayName(n.name, labels)}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function SankeyTooltip({
  hover,
  labels,
  containerWidth,
}: {
  hover: Hover;
  labels: Record<string, string> | undefined;
  containerWidth: number;
}) {
  const text =
    hover.kind === "node"
      ? `${displayName(hover.name, labels)}: ${hover.value.toLocaleString()}`
      : `${displayName(hover.from, labels)} → ${displayName(hover.to, labels)}: ${hover.value.toLocaleString()}`;

  const flip = hover.x > containerWidth - 200;
  const style: React.CSSProperties = flip
    ? { right: containerWidth - hover.x + 8, top: hover.y + 8 }
    : { left: hover.x + 12, top: hover.y + 8 };

  return (
    <div
      className="pointer-events-none absolute z-10 rounded border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] px-2 py-1 text-xs text-[color:var(--color-ink-2)] shadow-md"
      style={style}
    >
      {text}
    </div>
  );
}

function parseSize(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/^([\d.]+)(rem|px)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  return m[2] === "rem" || !m[2] ? n * 16 : n;
}

export default SankeyPanel;
