import { createElement, type ComponentType } from "react";
import { beforeAll, vi } from "vitest";

// next/dynamic defers loading, so in jsdom a dynamic component renders its
// fallback instead of the real component. PanelRenderer calls dynamic() at
// module load, so we kick off every loader immediately, flush them once
// before the suite, and then render the resolved component synchronously.
const pending: Promise<unknown>[] = [];

vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<{ default: ComponentType<unknown> }>) => {
    let Loaded: ComponentType<unknown> | null = null;
    pending.push(
      loader().then((mod) => {
        Loaded = mod.default;
      }),
    );
    return function Dynamic(props: Record<string, unknown>) {
      return Loaded ? createElement(Loaded, props) : null;
    };
  },
}));

beforeAll(async () => {
  await Promise.all(pending);
});

// Constraint: dynamic() calls must run at module-load (as PanelRenderer's do)
// to be flushed here. A dynamic() invoked after beforeAll resolves stays null.
