// Mini-DAG rendered from a pipeline's real structure: sources on the
// left, mappings in the middle, tables on the right, wires from the
// mapping edges. Pure SVG, server-renderable, no interactivity.

export interface ThumbGraph {
  sources: number;
  mappings: number;
  tables: number;
  /** [sourceIndex, mappingIndex] pairs. */
  sourceEdges: [number, number][];
  /** [mappingIndex, tableIndex] pairs. */
  tableEdges: [number, number][];
}

const W = 280;
const H = 150;
const NODE_W = 52;
const NODE_H = 16;
const COLS = [30, 114, 198];
const MAX_PER_COL = 5;

function rowYs(count: number): number[] {
  const n = Math.min(count, MAX_PER_COL);
  const gap = Math.min(30, (H - 24) / Math.max(n, 1));
  const top = (H - (n - 1) * gap) / 2 - NODE_H / 2;
  return Array.from({ length: n }, (_, i) => top + i * gap);
}

export default function DagThumbnail({ graph }: { graph: ThumbGraph }) {
  const cols = [rowYs(graph.sources), rowYs(graph.mappings), rowYs(graph.tables)];
  // Fit the viewBox to the content so sparse graphs don't render as a
  // tiny strip in the middle of the card.
  const usedCols = cols.map((ys, c) => ({ ys, c })).filter(({ ys }) => ys.length > 0);
  const allYs = usedCols.flatMap(({ ys }) => ys);
  const minX = usedCols.length ? COLS[usedCols[0].c] : 0;
  const maxX = usedCols.length ? COLS[usedCols[usedCols.length - 1].c] + NODE_W : W;
  const minY = allYs.length ? Math.min(...allYs) : 0;
  const maxY = allYs.length ? Math.max(...allYs) + NODE_H : H;
  const padX = 18;
  const contentH = Math.max(maxY - minY, 64);
  const padY = (contentH - (maxY - minY)) / 2 + 16;
  const viewBox = `${minX - padX} ${minY - padY} ${maxX - minX + padX * 2} ${maxY - minY + padY * 2}`;
  const wire = (c: number, a: number, b: number) => {
    const ya = cols[c][Math.min(a, MAX_PER_COL - 1)];
    const yb = cols[c + 1][Math.min(b, MAX_PER_COL - 1)];
    if (ya === undefined || yb === undefined) return null;
    const x1 = COLS[c] + NODE_W;
    const x2 = COLS[c + 1];
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${ya + NODE_H / 2} C ${mx} ${ya + NODE_H / 2}, ${mx} ${yb + NODE_H / 2}, ${x2} ${yb + NODE_H / 2}`;
  };
  const strokes = ["var(--color-amber-deep)", "var(--color-ink-4)", "var(--color-leaf)"];
  return (
    <svg
      viewBox={viewBox}
      className="h-full w-full"
      aria-hidden
      data-testid="dag-thumbnail"
    >
      {graph.sourceEdges.map(([a, b], i) => {
        const d = wire(0, a, b);
        return d && <path key={`s${i}`} d={d} fill="none" stroke="#4d4e55" strokeWidth="1.2" />;
      })}
      {graph.tableEdges.map(([a, b], i) => {
        const d = wire(1, a, b);
        return d && <path key={`t${i}`} d={d} fill="none" stroke="#4d4e55" strokeWidth="1.2" />;
      })}
      {cols.map((ys, c) =>
        ys.map((y, i) => (
          <rect
            key={`${c}-${i}`}
            x={COLS[c]}
            y={y}
            width={NODE_W}
            height={NODE_H}
            rx="4"
            fill="#26272d"
            stroke={strokes[c]}
            strokeOpacity={c === 1 ? 1 : 0.75}
            strokeWidth="1"
          />
        )),
      )}
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
