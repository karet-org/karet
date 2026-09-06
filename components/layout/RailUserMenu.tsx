"use client";

// Rail user row with a popover menu. displayName null fetches it from
// /api/settings.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconChevronDown,
  IconSettings,
  IconSignOut,
} from "@/components/icons";
import { cachedJson } from "@/lib/client/fetch-cache";

export default function RailUserMenu({
  displayName,
}: {
  displayName: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(displayName ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (displayName !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const body = await cachedJson<{ displayName?: string }>("/api/settings");
        if (!cancelled && body.displayName) setName(body.displayName);
      } catch {
        // The row falls back to "admin".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [displayName]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const shown = name || "admin";

  return (
    <div ref={ref} className="relative">
      {menuOpen && (
        <div
          role="menu"
          data-testid="rail-user-menu"
          className="absolute bottom-[50px] left-0 right-0 z-30 rounded-lg border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface-2)] p-1 shadow-[0_8px_28px_rgba(0,0,0,0.45)]"
        >
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-rule-soft)] hover:text-[color:var(--color-ink)]"
          >
            <IconSettings size={15} />
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            disabled={signingOut}
            data-testid="user-menu-logout"
            onClick={async () => {
              setSigningOut(true);
              try {
                await fetch("/api/auth/logout", { method: "POST" });
              } finally {
                router.push("/login");
                router.refresh();
              }
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-rule-soft)] hover:text-[color:var(--color-ink)] disabled:opacity-50"
          >
            <IconSignOut size={15} />
            Sign out
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-testid="rail-user-trigger"
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-[color:var(--color-surface-2)]"
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[color:var(--color-leaf)] text-[11px] font-semibold text-[#12210f]">
          {shown[0].toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-[color:var(--color-ink)]">
            {shown}
          </span>
          <span className="block text-[10.5px] text-[color:var(--color-ink-3)]">
            admin
          </span>
        </span>
        <IconChevronDown
          size={13}
          className={`shrink-0 text-[color:var(--color-ink-3)] transition-transform ${menuOpen ? "" : "rotate-180"}`}
        />
      </button>
    </div>
  );
}
