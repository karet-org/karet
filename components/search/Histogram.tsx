"use client";

// Matches per time bar. Hover a bar to see its count; click a bar, or drag
// across several, to search that span.

import { useRef, useState } from "react";
import { formatAxisTime, formatSpan } from "@/lib/search/format";
import { intervalLabel } from "@/lib/search/time";

export interface HistogramData {
  start: number;
  interval: number;
  counts: number[];
}

export default function Histogram({
  data,
  onSelect,
}: {
  data: HistogramData;
  onSelect: (from: number, to: number) => void;
}) {
  const { start, interval, counts } = data;
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const max = Math.max(1, ...counts);

  const barAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const i = Math.floor(((clientX - r.left) / r.width) * counts.length);
    return Math.min(counts.length - 1, Math.max(0, i));
  };
  const lo = drag ? Math.min(drag.from, drag.to) : null;
  const hi = drag ? Math.max(drag.from, drag.to) : null;

  const shown = drag ? { a: lo!, b: hi! } : hover !== null ? { a: hover, b: hover } : null;
  const shownCount = shown ? counts.slice(shown.a, shown.b + 1).reduce((s, n) => s + n, 0) : 0;
  const ticks = [0, Math.floor(counts.length / 2), counts.length];

  return (
    <div className="px-3 pb-1.5 pt-1" data-testid="search-histogram">
      <div className="flex h-5 items-center justify-between text-[11px] text-[color:var(--color-ink-4)]">
        <span className="text-[color:var(--color-ink-3)]" data-testid="histogram-label">
          {shown
            ? `${formatSpan(start + shown.a * interval, start + (shown.b + 1) * interval)}: ${shownCount.toLocaleString()} event${shownCount === 1 ? "" : "s"}`
            : ""}
        </span>
        <span>1 bar = {intervalLabel(interval)}</span>
      </div>
      <div
        ref={ref}
        role="img"
        aria-label="Matching events over time"
        className="flex h-16 cursor-crosshair touch-none select-none items-end gap-px"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const i = barAt(e.clientX);
          setDrag({ from: i, to: i });
        }}
        onPointerMove={(e) => {
          const i = barAt(e.clientX);
          setHover(i);
          if (drag) setDrag({ ...drag, to: i });
        }}
        onPointerUp={() => {
          if (drag) onSelect(start + lo! * interval, start + (hi! + 1) * interval);
          setDrag(null);
        }}
        onPointerLeave={() => !drag && setHover(null)}
      >
        {counts.map((n, i) => {
          const picked = lo !== null && i >= lo && i <= hi!;
          return (
            <div key={i} className="flex h-full min-w-0 flex-1 items-end">
              <div
                className={`w-full rounded-t-[1px] ${
                  picked || hover === i ? "bg-[color:var(--color-carrot)]" : "bg-[color:var(--color-carrot)]/55"
                }`}
                style={{ height: n === 0 ? 0 : `${Math.max(4, (n / max) * 100)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="relative mt-0.5 h-4 text-[10.5px] tabular-nums text-[color:var(--color-ink-4)]">
        {ticks.map((t, i) => (
          <span
            key={t}
            className="absolute top-0 whitespace-nowrap"
            style={{ left: `${(t / counts.length) * 100}%`, transform: i === 0 ? "none" : i === 2 ? "translateX(-100%)" : "translateX(-50%)" }}
          >
            {formatAxisTime(start + t * interval, interval)}
          </span>
        ))}
      </div>
    </div>
  );
}
