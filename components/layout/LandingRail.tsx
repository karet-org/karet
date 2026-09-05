"use client";

// Left rail for the landing page: brand, primary nav, starred pipelines,
// and the user menu (Settings, Sign out) anchored at the bottom.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconChevronDown,
  IconGrid,
  IconSettings,
  IconSignOut,
  IconStar,
  KaretLogo,
} from "@/components/icons";

export default function LandingRail({
  displayName,
  workspaceName,
  starred,
}: {
  displayName: string;
  workspaceName: string;
  starred: string[];
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const footerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!footerRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [menuOpen]);

  const name = displayName || "admin";

  return (
    <nav className="hidden w-[240px] shrink-0 flex-col border-r border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] p-2.5 md:flex">
      <Link href="/" className="flex items-center gap-2.5 px-2 pb-3 pt-1.5">
        <KaretLogo size={26} />
        <span className="min-w-0">
          <span className="block text-[13.5px] font-semibold leading-tight text-[color:var(--color-ink)]">
            Karet
          </span>
          {workspaceName && (
            <span className="block truncate text-[11px] leading-tight text-[color:var(--color-ink-3)]">
              {workspaceName}
            </span>
          )}
        </span>
      </Link>

      <Link
        href="/"
        className="flex items-center gap-2.5 rounded-lg bg-[color:var(--color-carrot-soft)] px-2.5 py-[7px] text-[13px] font-medium text-[color:var(--color-ink)]"
      >
        <IconGrid size={15} className="text-[color:var(--color-carrot)]" />
        Pipelines
      </Link>

      {starred.length > 0 && (
        <>
          <div className="px-2.5 pb-1.5 pt-4 text-[10.5px] font-medium tracking-[0.06em] text-[color:var(--color-ink-3)]">
            STARRED
          </div>
          {starred.map((slug) => (
            <Link
              key={slug}
              href={`/p/${slug}/graph`}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]"
            >
              <IconStar size={14} className="shrink-0 text-[color:var(--color-ink-3)]" />
              <span className="truncate">{slug}</span>
            </Link>
          ))}
        </>
      )}

      <div
        ref={footerRef}
        className="relative mt-auto border-t border-[color:var(--color-rule-soft)] pt-2"
      >
        {menuOpen && (
          <div
            role="menu"
            className="absolute bottom-[54px] left-1 right-1 z-10 rounded-lg border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface-2)] p-1 shadow-[0_8px_28px_rgba(0,0,0,0.45)]"
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
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-[color:var(--color-surface-2)]"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[color:var(--color-leaf)] text-[11px] font-semibold text-[#12210f]">
            {name[0].toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-[color:var(--color-ink)]">
              {name}
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
    </nav>
  );
}
