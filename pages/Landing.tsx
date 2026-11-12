// The frame of the pages outside a pipeline (Pipelines, Data lake, Settings):
// the left rail with the workspace name and starred pipelines, and a title bar.

import type { ReactNode } from "react";
import LandingRail, { MobileRailToggle } from "@/components/layout/LandingRail";
import { SearchProvider } from "@/components/layout/LandingSearch";

export interface RailData {
  workspaceName: string;
  starred: { id: string; name: string }[];
}

const NO_SETTINGS: RailData = { workspaceName: "", starred: [] };

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** The workspace name and starred pipelines. A failed read shows an empty rail. */
export async function railLoader(): Promise<RailData> {
  const [settings, starred] = await Promise.all([
    json<{ workspaceName: string }>("/api/settings"),
    json<{ starred: RailData["starred"] }>("/api/settings/starred"),
  ]);
  return { workspaceName: settings?.workspaceName ?? NO_SETTINGS.workspaceName, starred: starred?.starred ?? [] };
}

export function LandingShell({
  rail,
  title,
  children,
}: {
  rail: RailData;
  title: string;
  children: ReactNode;
}) {
  return (
    <SearchProvider>
      <div className="flex h-screen overflow-hidden">
        <LandingRail workspaceName={rail.workspaceName} starred={rail.starred} />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-[color:var(--color-rule-soft)] bg-[color:var(--color-bg)] px-4 sm:px-6">
            <MobileRailToggle workspaceName={rail.workspaceName} starred={rail.starred} />
            <h1 className="text-[15px] font-semibold text-[color:var(--color-ink)]">{title}</h1>
          </div>
          {children}
        </main>
      </div>
    </SearchProvider>
  );
}
