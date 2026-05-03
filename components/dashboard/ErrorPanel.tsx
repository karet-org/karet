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
      className="rounded-md border-2 border-red-500 bg-red-50 p-4"
    >
      <h3 className="text-sm font-semibold text-red-700">{title}</h3>
      <p className="mt-1 text-xs text-red-700">
        Missing columns: {missingColumns.join(", ")}
      </p>
    </div>
  );
}

export default ErrorPanel;
