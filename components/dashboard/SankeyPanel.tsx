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
import type { PanelV2 } from "@/lib/types/dashboard-v2";
import { CHART_PALETTE } from "@/lib/dashboard/palette";
import { toNum } from "@/lib/dashboard/format";
import type { PanelProps } from "./types";

type SankeyPanelConfig = Extract<PanelV2, { kind: "sankey" }>;

/** Declared layers, rank-normalized to 0..k-1 so gaps in the authored
 * numbers don't push nodes past d3's topological layer count (d3 clamps
 * the align result to it). First declaration per node wins. */
export function normalizeLayers(declared: Map<string, number>): Map<string, number> {
  const ranks = [...new Set(declared.values())].sort((a, b) => a - b);
  const rankOf = new Map(ranks.map((v, i) => [v, i]));
  return new Map([...declared].map(([name, v]) => [name, rankOf.get(v) ?? 0]));
}

/** Would adding from->to close a cycle? d3-sankey requires a DAG. */
function wouldCreateCycle(
  links: { from: string; to: string }[],
  from: string,
  to: string,
): boolean {
  const reachable = new Set([to]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of links) {
      if (reachable.has(l.from) && !reachable.has(l.to)) {
        reachable.add(l.to);
        grew = true;
      }
    }
  }
  return reachable.has(from);
}

interface NodeDatum {
  name: string;
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

function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return CHART_PALETTE[Math.abs(h) % CHART_PALETTE.length];
}

export type Hover =
  | { kind: "node"; name: string; value: number; x: number; y: number }
  | { kind: "link"; from: string; to: string; value: number; x: number; y: number };

// Labels shorter than the node is tall collide with their neighbors;
// suppress them and let the tooltip carry the name.
const LABEL_MIN_NODE_HEIGHT = 9;
const LABEL_MAX_CHARS = 30;

export function truncate(name: string): string {
  return name.length > LABEL_MAX_CHARS ? `${name.slice(0, LABEL_MAX_CHARS - 1)}\u2026` : name;
}

export function linkOpacity(hover: Hover | null, from: string, to: string): number {
  if (!hover) return 0.3;
  if (hover.kind === "node") return hover.name === from || hover.name === to ? 0.55 : 0.08;
  return hover.from === from && hover.to === to ? 0.55 : 0.08;
}

export function SankeyPanel({ config, data }: PanelProps<SankeyPanelConfig>) {
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
    // One link per result row: source/target/value bound columns.
    // Duplicate edges sum; self-links and cycle-closers are skipped.
    const sums = new Map<string, { from: string; to: string; flow: number }>();
    const declared = new Map<string, number>();
    for (const row of data.rows) {
      const from = String(row[config.source] ?? "");
      const to = String(row[config.target] ?? "");
      const flow = toNum(row[config.value]);
      const fromLayer = toNum(row[config.source_layer]);
      const toLayer = toNum(row[config.target_layer]);
      if (!from || !to || flow === null || flow <= 0) continue;
      if (fromLayer === null || toLayer === null) continue;
      if (!declared.has(from)) declared.set(from, fromLayer);
      if (!declared.has(to)) declared.set(to, toLayer);
      const key = `${from}\u0000${to}`;
      const cur = sums.get(key);
      if (cur) cur.flow += flow;
      else sums.set(key, { from, to, flow });
    }
    const links: { from: string; to: string; flow: number }[] = [];
    for (const l of sums.values()) {
      if (l.from === l.to || wouldCreateCycle(links, l.from, l.to)) continue;
      links.push(l);
    }
    if (links.length === 0) return null;

    const indexByName = new Map<string, number>();
    const nodes: NodeDatum[] = [];
    const ensure = (name: string) => {
      let i = indexByName.get(name);
      if (i === undefined) {
        i = nodes.length;
        indexByName.set(name, i);
        nodes.push({ name });
      }
      return i;
    };

    const linkData: LinkDatum[] = links.map((l) => ({
      source: ensure(l.from),
      target: ensure(l.to),
      value: l.flow,
    }));

    // Column placement follows flow topology: sources left, sinks right.
    const layers = normalizeLayers(declared);
    const sankeyGen = d3Sankey<NodeDatum, LinkDatum>()
      .nodeWidth(NODE_WIDTH)
      .nodePadding(NODE_PADDING)
      .nodeAlign((node) => layers.get(node.name) ?? 0)
      .extent([
        [LABEL_PAD_LEFT, PADDING],
        [Math.max(renderWidth - LABEL_PAD_RIGHT, LABEL_PAD_LEFT + 100), height - PADDING],
      ]);

    // Guard the layout: d3-sankey throws "circular link" on any cycle.
    try {
      const graph: SankeyGraph<NodeDatum, LinkDatum> = sankeyGen({
        nodes: nodes.map((n) => ({ ...n })),
        links: linkData.map((l) => ({ ...l })),
      });
      return { graph };
    } catch (err) {
      console.warn("Sankey layout failed; rendering empty panel:", err);
      return null;
    }
  }, [data.rows, config.source, config.target, config.value, config.source_layer, config.target_layer, renderWidth, height]);

  return (
    <div
      data-testid="sankey-panel"
      className="flex flex-1 flex-col min-w-0 rounded-[13px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-[color:var(--color-leaf-deep)]">{config.title}</h3>
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
              width={renderWidth}
              height={height}
              hover={hover}
              onHover={setHover}
            />
            {hover ? (
              <SankeyTooltip hover={hover} containerWidth={renderWidth} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function SankeySvg({
  layout,
  width,
  height,
  hover,
  onHover,
}: {
  layout: SankeyGraph<NodeDatum, LinkDatum>;
  width: number;
  height: number;
  hover: Hover | null;
  onHover: (h: Hover | null) => void;
}) {
  const linkPath = sankeyLinkHorizontal<NodeDatum, LinkDatum>();
  const midX = width / 2;

  return (
    <svg
      width={width}
      height={height}
      className="block"
      onMouseLeave={() => onHover(null)}
    >
      {/* Links first; nodes paint over them. Ribbons take the source
          node's color: flows fan out in one hue per origin instead of
          blending two palette colors into mud mid-ribbon. */}
      <g fill="none">
        {layout.links.map((l, i) => {
          const d = linkPath(l as D3Link<NodeDatum, LinkDatum>);
          if (!d) return null;
          const src = l.source as D3Node<NodeDatum, LinkDatum>;
          const tgt = l.target as D3Node<NodeDatum, LinkDatum>;
          return (
            <path
              key={`link-${i}`}
              d={d}
              stroke={colorFor(src.name)}
              strokeOpacity={linkOpacity(hover, src.name, tgt.name)}
              strokeWidth={Math.max(1, l.width ?? 1)}
              style={{ transition: "stroke-opacity 120ms" }}
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
          const showLabel = y1 - y0 >= LABEL_MIN_NODE_HEIGHT;
          return (
            <g key={`node-${i}`}>
              <rect
                x={x0}
                y={y0}
                width={Math.max(0, x1 - x0)}
                height={Math.max(0, y1 - y0)}
                rx={2}
                fill={colorFor(n.name)}
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
              {showLabel ? (
                <text
                  x={labelOnRight ? x1 + 6 : x0 - 6}
                  y={(y0 + y1) / 2}
                  dy="0.35em"
                  textAnchor={labelOnRight ? "start" : "end"}
                  fontSize={11}
                  fill="var(--color-ink-2)"
                  style={{ pointerEvents: "none" }}
                >
                  {truncate(n.name)}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function SankeyTooltip({
  hover,
  containerWidth,
}: {
  hover: Hover;
  containerWidth: number;
}) {
  const text =
    hover.kind === "node"
      ? `${hover.name}: ${hover.value.toLocaleString()}`
      : `${hover.from} to ${hover.to}: ${hover.value.toLocaleString()}`;

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
