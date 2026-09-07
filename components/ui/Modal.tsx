"use client";

import { useEffect, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  /** Dismiss request (backdrop, Escape); the parent decides whether to honor it. */
  onClose: () => void;
  children: ReactNode;
  /** `absolute` confines the backdrop to a container, e.g. the graph canvas. */
  position?: "fixed" | "absolute";
  /** Tailwind classes for the card wrapper. */
  cardClassName?: string;
}

const DEFAULT_CARD =
  "w-full max-w-md rounded-xl bg-[color:var(--color-surface)] p-6 text-[color:var(--color-ink)] shadow-xl";

/** Dimmed backdrop + centered card. Deliberately no focus trap or portal. */
function Modal({
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
