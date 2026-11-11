// Compact controls for the Data page toolbars, 28px high where the shared
// controls are 34px, so the grid gets the vertical space.

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-carrot-soft)]";

/** Text or icon-and-text action with no border. */
export function toolButton(extra = ""): string {
  return (
    `inline-flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-[12px] font-medium text-[color:var(--color-ink-3)] transition ` +
    `hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)] disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS} ${extra}`
  );
}

/** Square icon-only action. */
export function iconButton(extra = ""): string {
  return (
    `grid h-7 w-7 shrink-0 place-items-center rounded text-[color:var(--color-ink-3)] transition ` +
    `hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)] disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS} ${extra}`
  );
}

/** Bordered action, for the one that sits beside an input. */
export function toolSecondary(extra = ""): string {
  return (
    `inline-flex h-7 shrink-0 items-center gap-1.5 rounded border border-[color:var(--color-rule)] px-2.5 text-[12px] font-medium ` +
    `text-[color:var(--color-ink-2)] transition hover:border-[color:var(--color-ink-4)] hover:bg-[color:var(--color-surface-2)] ` +
    `hover:text-[color:var(--color-ink)] disabled:opacity-50 ${FOCUS} ${extra}`
  );
}

/** Filled action: Run. */
export function toolPrimary(extra = ""): string {
  return (
    `inline-flex h-7 shrink-0 items-center gap-1.5 rounded bg-[color:var(--color-carrot)] px-2.5 text-[12px] font-medium text-white ` +
    `transition hover:bg-[color:var(--color-carrot-deep)] disabled:bg-[color:var(--color-surface-2)] disabled:text-[color:var(--color-ink-4)] ${FOCUS} ${extra}`
  );
}

/** 28px text input. */
export function toolInput(extra = ""): string {
  return (
    `h-7 rounded border border-[color:var(--color-rule)] bg-transparent px-2 text-[12px] text-[color:var(--color-ink)] ` +
    `placeholder:text-[color:var(--color-ink-4)] focus:border-[color:var(--color-carrot)] focus:outline-none ${extra}`
  );
}
