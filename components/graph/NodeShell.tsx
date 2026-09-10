// Shared node frame: kind-colored icon, bold name, kind tag pill,
// muted body rows.

const KIND_COLOR: Record<string, string> = {
  source: "var(--color-amber-deep)",
  mapping: "var(--color-carrot)",
  table: "var(--color-leaf)",
  dimension: "#6cb2ff",
  rollup: "var(--color-plum, #b98cff)",
};

const KIND_ICON: Record<string, React.ReactNode> = {
  source: <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h3l1.5 2h4.5A1.5 1.5 0 0 1 14 7.5v4A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-6Z" />,
  mapping: <path d="M3 3h10M3 8h10M3 13h6" />,
  table: (
    <>
      <ellipse cx="8" cy="4" rx="5.5" ry="2.2" />
      <path d="M2.5 4v8c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2V4" />
    </>
  ),
  dimension: (
    <>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M6.5 3v10M2 7h12" />
    </>
  ),
  // Bars collapsing into one: many rows in, few out.
  rollup: <path d="M2.5 13V8M6 13V5M9.5 13V9M13 13V3" />,
};

export default function NodeShell({
  kind,
  title,
  selected,
  testId,
  className = "",
  handles,
  children,
}: {
  kind: "source" | "mapping" | "table" | "dimension" | "rollup";
  title: string;
  selected?: boolean;
  testId: string;
  className?: string;
  /** React Flow handles, rendered outside the rounded clip. */
  handles?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className={`cursor-pointer rounded-[10px] border bg-[color:var(--color-surface)] shadow-[0_4px_16px_rgba(0,0,0,0.35)] ${
        selected
          ? "border-[color:var(--color-carrot)] ring-2 ring-[color:var(--color-carrot-soft)]"
          : "border-[color:var(--color-rule)]"
      } ${className}`}
    >
      {handles}
      <div className="drag-handle flex cursor-grab items-center gap-2 border-b border-[color:var(--color-rule-soft)] px-3 py-2">
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke={KIND_COLOR[kind]}
          strokeWidth="1.5"
          className="shrink-0"
          aria-hidden
        >
          {KIND_ICON[kind]}
        </svg>
        <span className="min-w-0 truncate text-[12.5px] font-semibold text-[color:var(--color-ink)]">
          {title}
        </span>
        <span className="ml-auto shrink-0 rounded-[5px] bg-[color:var(--color-surface-2)] px-1.5 py-[1px] text-[9.5px] font-semibold text-[color:var(--color-ink-2)]">
          {kind}
        </span>
      </div>
      <div className="px-3 py-2 text-xs leading-relaxed text-[color:var(--color-ink-3)]">
        {children}
      </div>
    </div>
  );
}
