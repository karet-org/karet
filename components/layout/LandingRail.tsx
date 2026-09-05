"use client";

// Left rail for the landing page: brand, primary nav, starred pipelines,
// and the user menu (Settings, Sign out) anchored at the bottom.

import Link from "next/link";
import { IconGrid, IconStar, KaretLogo } from "@/components/icons";
import RailUserMenu from "@/components/layout/RailUserMenu";

export default function LandingRail({
  displayName,
  workspaceName,
  starred,
}: {
  displayName: string;
  workspaceName: string;
  starred: string[];
}) {
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

      <div className="mt-auto border-t border-[color:var(--color-rule-soft)] pt-2">
        <RailUserMenu displayName={displayName} />
      </div>
    </nav>
  );
}
