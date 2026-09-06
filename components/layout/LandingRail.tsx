"use client";

// Left rail for the landing page: brand, primary nav, starred pipelines,
// and the user menu (Settings, Sign out) anchored at the bottom.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconGrid, IconMenu, IconStar, KaretLogo } from "@/components/icons";
import RailUserMenu from "@/components/layout/RailUserMenu";
import { SearchInput } from "@/components/layout/LandingSearch";

interface RailProps {
  displayName: string;
  workspaceName: string;
  starred: string[];
}

function RailContent({ displayName, workspaceName, starred }: RailProps) {
  const pathname = usePathname() ?? "/";
  const item = (active: boolean) =>
    `flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] ${
      active
        ? "bg-[color:var(--color-carrot-soft)] font-medium text-[color:var(--color-ink)]"
        : "text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]"
    }`;
  return (
    <div className="flex h-full w-full flex-col p-2.5">
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

      <SearchInput />

      <Link href="/" className={item(pathname === "/" || pathname === "/settings")}>
        <IconGrid
          size={15}
          className={pathname !== "/lake" ? "text-[color:var(--color-carrot)]" : "text-[color:var(--color-ink-3)]"}
        />
        Pipelines
      </Link>
      <Link href="/lake" className={item(pathname === "/lake")} data-testid="rail-lake">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={pathname === "/lake" ? "text-[color:var(--color-carrot)]" : "text-[color:var(--color-ink-3)]"} aria-hidden>
          <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h3l1.5 2h4.5A1.5 1.5 0 0 1 14 7.5v4A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-6Z" />
        </svg>
        Data lake
      </Link>

      {starred.length > 0 && (
        <>
          <div className="px-2.5 pb-1.5 pt-4 text-[10.5px] font-medium tracking-[0.06em] text-[color:var(--color-ink-3)]">
            Starred
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

      <div className="mt-auto border-t border-[color:var(--color-rule-soft)] pt-2">
        <RailUserMenu displayName={displayName} />
      </div>
    </div>
  );
}

export default function LandingRail(props: RailProps) {
  return (
    <nav className="hidden w-[240px] shrink-0 border-r border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] md:block">
      <RailContent {...props} />
    </nav>
  );
}

/** Hamburger for the landing pages' topbars; opens the rail as a drawer. */
export function MobileRailToggle(props: RailProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const wasPath = useRef(pathname);

  useEffect(() => {
    if (wasPath.current !== pathname) {
      wasPath.current = pathname;
      setOpen(false);
    }
  }, [pathname]);

  return (
    <span className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open menu"
        data-testid="landing-mobile-toggle"
        className="mr-1 rounded-md p-1.5 text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
      >
        <IconMenu size={17} />
      </button>
      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <nav
            data-testid="landing-drawer"
            className="absolute bottom-0 left-0 top-0 w-[260px] overflow-y-auto border-r border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)]"
          >
            <RailContent {...props} />
          </nav>
        </div>
      )}
    </span>
  );
}
