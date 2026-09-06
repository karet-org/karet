import type { ButtonHTMLAttributes } from "react";

/**
 * The dismiss glyph as an SVG (two strokes), crisper than a "×" character.
 * Inherits `currentColor` and size from the parent.
 */
function CloseIcon({ size = 16 }: { size?: number }) {
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
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

export interface CloseButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /**
   * Accessible label. Defaults to "Close" but callers should pass something
   * specific ("Remove row 2", "Close detail panel") so screen-reader users
   * know what's being dismissed.
   */
  label?: string;
  /**
   * Visual size. `sm` matches the inline remove-buttons in list editors;
   * `md` matches panel/dialog close buttons.
   */
  size?: "sm" | "md";
}

const SIZES: Record<NonNullable<CloseButtonProps["size"]>, { box: string; icon: number }> = {
  sm: { box: "h-5 w-5", icon: 14 },
  md: { box: "h-7 w-7", icon: 16 },
};

/**
 * Icon-only dismiss control with an SVG "✕". Used to close panels/dialogs.
 * Shared styling: bordered surface, hover darken, focus ring.
 */
export function CloseButton({
  label = "Close",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: CloseButtonProps) {
  const { box, icon } = SIZES[size];
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={[
        "inline-flex items-center justify-center rounded-md",
        "border border-[color:var(--color-rule)] bg-[color:var(--color-surface)]",
        "text-[color:var(--color-ink-3)]",
        "transition-colors hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-carrot)]/50",
        "disabled:opacity-50",
        box,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      <CloseIcon size={icon} />
    </button>
  );
}

export default CloseButton;
