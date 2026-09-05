// Shared frame for graph nodes, following the mock: a header row with a
// kind-colored icon, the entity name in bold, and a kind tag pill on the
// right; muted detail rows in the body.

const KIND_COLOR: Record<string, string> = {
  source: "var(--color-amber-deep)",
  mapping: "var(--color-carrot)",
  table: "var(--color-leaf)",
  lookup: "#6cb2ff",
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
  lookup: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m13.5 13.5-3-3" />
    </>
  ),
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
  kind: "source" | "mapping" | "table" | "lookup";
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
