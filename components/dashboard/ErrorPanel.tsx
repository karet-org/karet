// Rendered in place of any panel whose config references a column that
// does not exist in the Analytic_Table schema. The rest of the dashboard
// continues to render normally.

interface ErrorPanelProps {
  title: string;
  missingColumns: string[];
}

export function ErrorPanel({ title, missingColumns }: ErrorPanelProps) {
  return (
    <div
      role="alert"
      data-testid="error-panel"
      className="flex flex-1 flex-col rounded-md border-2 border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] p-4"
    >
      <h3 className="text-sm font-semibold text-[color:var(--color-rose-deep)]">{title}</h3>
      <p className="mt-1 text-xs text-[color:var(--color-rose-deep)]">
        Missing columns: {missingColumns.join(", ")}
      </p>
    </div>
  );
}

export default ErrorPanel;
