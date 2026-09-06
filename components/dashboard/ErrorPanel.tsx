// Rendered in place of a panel whose query failed. The rest of the
// dashboard continues to render normally.

interface ErrorPanelProps {
  title: string;
  message: string;
}

export function ErrorPanel({ title, message }: ErrorPanelProps) {
  return (
    <div
      role="alert"
      data-testid="error-panel"
      className="flex flex-1 flex-col rounded-[13px] border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] p-4"
    >
      <h3 className="text-sm font-semibold text-[color:var(--color-rose-deep)]">{title}</h3>
      <p className="mt-1 break-words font-mono text-xs text-[color:var(--color-rose-deep)]">{message}</p>
    </div>
  );
}

export default ErrorPanel;
