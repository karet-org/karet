"use client";

// Persistent top bar for the dashboard routes (rendered by the shared
// layout). Pages portal their actions into the slot span.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { parse } from "yaml";
import { cachedJson, cachedText } from "@/lib/client/fetch-cache";

export const TOPBAR_ACTIONS_ID = "dashboard-topbar-actions";

export default function DashboardTopBar({
  pipeline,
  id,
}: {
  pipeline: string;
  id: string;
}) {
  const pathname = usePathname() ?? "";
  const [name, setName] = useState(id);
  const [isDraft, setIsDraft] = useState(false);

  // Identity from the shared caches: the drafts list marks draft state,
  // the config body carries the display name. Both dedupe with the
  // sidebar's and the page's own fetches.
  useEffect(() => {
    let cancelled = false;
    setName(id);
    setIsDraft(false);
    cachedJson<{ drafts?: string[] }>(`/api/p/${pipeline}/dashboards`)
      .then((body) => {
        if (!cancelled && body.drafts?.includes(id)) setIsDraft(true);
      })
      .catch(() => {});
    cachedText(`/api/p/${pipeline}/dashboards/${id}?draft=1`)
      .then((body) => {
        if (cancelled) return;
        try {
          const parsed = parse(body) as { name?: string };
          if (typeof parsed?.name === "string" && parsed.name.trim()) {
            setName(parsed.name.trim());
          }
        } catch {
          // Keep the id as the title.
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pipeline, id]);
  const editing = pathname.endsWith("/edit");
  const base = `/p/${pipeline}/dashboards/${id}`;

  return (
    <header
      className="sticky top-0 z-20 flex min-h-[46px] flex-wrap items-center gap-2.5 border-b border-[color:var(--color-rule-soft)] bg-[color:var(--color-bg)] px-4 py-1.5 sm:px-6"
      data-testid="dashboard-topbar"
    >
      {!isDraft && (
        <div className="flex items-center rounded-[9px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] p-[3px]">
          <Link
            href={base}
            aria-current={editing ? undefined : "page"}
            className={`rounded-md px-3.5 py-1 text-[12px] font-medium ${
              editing
                ? "text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
                : "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink)]"
            }`}
          >
            Preview
          </Link>
          <Link
            href={`${base}/edit`}
            aria-current={editing ? "page" : undefined}
            className={`rounded-md px-3.5 py-1 text-[12px] font-medium ${
              editing
                ? "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink)]"
                : "text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
            }`}
          >
            Edit
          </Link>
        </div>
      )}
      <h1 className="text-[15px] font-semibold text-[color:var(--color-ink)]">{name}</h1>
      {isDraft && (
        <span className="rounded-md bg-[color:var(--color-amber-soft)] px-2 py-[2px] text-[10px] font-semibold tracking-wide text-[color:var(--color-amber-deep)]">
          DRAFT
        </span>
      )}
      <span className="hidden text-[11.5px] text-[color:var(--color-ink-3)] sm:block">
        dashboards/{isDraft ? "drafts/" : ""}
        {id}.yaml
      </span>
      <span id={TOPBAR_ACTIONS_ID} className="ml-auto flex items-center gap-2" />
    </header>
  );
}
