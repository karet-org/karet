// Card, title and empty state shared by the Chart.js panels, and the click
// and hover options for panels that emit a filter value.

import type { ReactNode } from "react";
import type { PanelV2 } from "@/lib/types/dashboard-v2";
import { chartAreaProps, panelCardClass } from "./types";

export function ChartCard({
  testId,
  config,
  empty,
  children,
}: {
  testId: string;
  config: PanelV2;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <div data-testid={testId} className={panelCardClass()}>
      <h3 className="text-sm font-semibold text-[color:var(--color-leaf-deep)]">{config.title}</h3>
      <div {...chartAreaProps(config)}>
        {empty ? (
          <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-ink-3)]">
            No data
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/** Clicking a segment emits its label; the cursor shows it can be clicked. */
export function emitOptions(
  labels: string[],
  emit: { param: string } | undefined,
  onEmit: ((param: string, value: string) => void) | undefined,
) {
  return {
    onClick: (_e: unknown, elements: { index: number }[]) => {
      if (!emit || !onEmit || elements.length === 0) return;
      const label = labels[elements[0].index];
      if (label) onEmit(emit.param, label);
    },
    onHover: (event: { native: Event | null }, elements: unknown[]) => {
      const target = event.native?.target as HTMLElement | null;
      if (target && emit) target.style.cursor = elements.length > 0 ? "pointer" : "default";
    },
  };
}
