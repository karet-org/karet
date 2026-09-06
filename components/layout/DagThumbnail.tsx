// Mini-DAG from the pipeline's real graph (same builder as the canvas),
// at saved layout positions when present, else a columnar flow.

export interface ThumbNode {
  x: number;
  y: number;
  kind: "source" | "lookup" | "mapping" | "table";
}

export interface ThumbGraph {
  nodes: ThumbNode[];
  /** Index pairs into nodes. */
  edges: [number, number][];
}

const W = 280;
const H = 150;
const NODE_W = 46;
const NODE_H = 14;
const PAD = 26;

const STROKE: Record<ThumbNode["kind"], string> = {
  source: "var(--color-amber-deep)",
  lookup: "#6cb2ff",
  mapping: "var(--color-carrot)",
  table: "var(--color-leaf)",
};

export default function DagThumbnail({ graph }: { graph: ThumbGraph }) {
  if (graph.nodes.length === 0) return <EmptyThumb />;
  const xs = graph.nodes.map((n) => n.x);
  const ys = graph.nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const px = (x: number) => PAD + ((x - minX) / spanX) * (W - PAD * 2);
  const py = (y: number) =>
    spanY === 1 ? H / 2 : PAD + ((y - minY) / spanY) * (H - PAD * 2);

  const pts = graph.nodes.map((n) => ({ cx: px(n.x), cy: py(n.y), kind: n.kind }));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-full w-full"
      aria-hidden
      data-testid="dag-thumbnail"
    >
      {graph.edges.map(([a, b], i) => {
        const p1 = pts[a];
        const p2 = pts[b];
        if (!p1 || !p2) return null;
        const x1 = p1.cx + NODE_W / 2;
        const x2 = p2.cx - NODE_W / 2;
        const mx = (x1 + x2) / 2;
        return (
          <path
            key={i}
            d={`M ${x1} ${p1.cy} C ${mx} ${p1.cy}, ${mx} ${p2.cy}, ${x2} ${p2.cy}`}
            fill="none"
            stroke="#4d4e55"
            strokeWidth="1.2"
          />
        );
      })}
      {pts.map((p, i) => (
        <rect
          key={i}
          x={p.cx - NODE_W / 2}
          y={p.cy - NODE_H / 2}
          width={NODE_W}
          height={NODE_H}
          rx="4"
          fill="#26272d"
          stroke={STROKE[p.kind]}
          strokeOpacity="0.85"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

/** Empty-pipeline placeholder used when the config has no nodes yet. */
export function EmptyThumb() {
  return (
    <div className="grid h-full w-full place-items-center text-[12px] text-[color:var(--color-ink-4)]">
      Empty pipeline
    </div>
  );
}
