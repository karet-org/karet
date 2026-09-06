"use client";

import { useEffect, type ReactNode } from "react";

export interface ModalProps {
  /** Whether the modal is visible. When false the component renders nothing. */
  open: boolean;
  /**
   * Called when the user asks to dismiss: click outside the card, press
   * Escape, or click a Cancel control inside `children` that calls this.
   * Parent decides whether to honor the request (e.g. reject while an
   * async action is in flight).
   */
  onClose: () => void;
  /** Card contents. Opt in to the card chrome by passing any JSX. */
  children: ReactNode;
  /**
   * Backdrop position style. Defaults to `fixed` (viewport-anchored),
   * which is what global modals want. Pass `"absolute"` for modals
   * confined to a container like the graph canvas overlay.
   */
  position?: "fixed" | "absolute";
  /**
   * Tailwind class applied to the card wrapper. Defaults to a standard
   * centered card with ~28rem max width and padding.
   */
  cardClassName?: string;
}

const DEFAULT_CARD =
  "w-full max-w-md rounded-xl bg-[color:var(--color-surface)] p-6 text-[color:var(--color-ink)] shadow-xl";

/**
 * Simple modal primitive: dimmed backdrop + centered card. No focus trap
 * or portal (the app's existing modals didn't use either and the tree
 * structure didn't require it). Clicking the backdrop or pressing Escape
 * invokes `onClose`; clicks inside the card don't propagate, so the same
 * markup handles dismiss-outside correctly.
 */
export function Modal({
  open,
  onClose,
  children,
  position = "fixed",
  cardClassName = DEFAULT_CARD,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const backdrop =
    position === "fixed"
      ? "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      : "absolute inset-0 z-30 flex items-center justify-center bg-black/20";

  return (
    <div className={backdrop} onClick={onClose}>
      <div className={cardClassName} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export default Modal;
