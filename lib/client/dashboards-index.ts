"use client";

// Change-aware dashboards index: mutations notify, subscribers refetch.

import { useEffect, useState } from "react";
import { cachedJson, invalidateCached } from "@/lib/client/fetch-cache";

export interface DashboardsIndex {
  listings: { id: string; name: string }[];
  drafts: string[];
}

const EMPTY: DashboardsIndex = { listings: [], drafts: [] };
const subscribers = new Set<() => void>();

export function notifyDashboardsChanged(pipeline: string): void {
  invalidateCached(`/api/p/${pipeline}/dashboards`);
  for (const fn of subscribers) fn();
}

export function useDashboardsIndex(pipeline: string): DashboardsIndex {
  const [index, setIndex] = useState<DashboardsIndex>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      cachedJson<Partial<DashboardsIndex>>(`/api/p/${pipeline}/dashboards`)
        .then((body) => {
          if (cancelled) return;
          setIndex({ listings: body.listings ?? [], drafts: body.drafts ?? [] });
        })
        .catch(() => {});
    };
    load();
    subscribers.add(load);
    return () => {
      cancelled = true;
      subscribers.delete(load);
    };
  }, [pipeline]);

  return index;
}
