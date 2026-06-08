import type { ButtonHTMLAttributes } from "react";

/**
 * Trash-bin icon (lid + can + two strokes), drawn at the caller's pixel
 * size as an inline SVG so it stays crisp and inherits `currentColor`.
 */
export function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export interface DeleteButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /**
   * Accessible label. Defaults to "Delete" but callers should pass
   * something specific ("Remove row 2", "Delete column foo") so
   * screen-reader users know what's being removed.
   */
  label?: string;
}

/**
 * Icon-only delete control: a 16×16 trash bin, semi-transparent at rest and
 * subtle red on hover/focus. The trash glyph marks the action as destructive,
 * distinct from {@link CloseButton}'s dismiss ✕.
 */
export function DeleteButton({
  label = "Delete",
  className = "",
  type = "button",
  ...rest
}: DeleteButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={[
        "inline-flex h-6 w-6 items-center justify-center rounded",
        // Muted at rest; the destructive red only appears on intent.
        "text-[color:var(--color-ink-3)] opacity-50",
        "transition-[color,opacity,background-color]",
        "hover:bg-[color:var(--color-rose-soft)] hover:text-[color:var(--color-rose-deep)] hover:opacity-100",
        "focus-visible:opacity-100 focus-visible:text-[color:var(--color-rose-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-rose-deep)]/40",
        "disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[color:var(--color-ink-3)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      <TrashIcon size={16} />
    </button>
  );
}

export default DeleteButton;
