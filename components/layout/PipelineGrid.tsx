"use client";

// Card grid for the landing page. Sorting is client-side; starring
// round-trips through /api/settings and refreshes the server-rendered
// rail so the starred list stays in sync.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DagThumbnail, { EmptyThumb, type ThumbGraph } from "@/components/layout/DagThumbnail";
import { IconStar } from "@/components/icons";

export interface PipelineCardData {
  slug: string;
  name: string;
  tableCount: number;
  lastRunAt: string | null;
  lastRunLabel: string;
  status: "healthy" | "error" | "idle";
  graph: ThumbGraph;
}

type SortKey = "recent" | "alpha" | "failing";

const CHIPS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Recently run" },
  { key: "alpha", label: "Alphabetical" },
  { key: "failing", label: "Failing first" },
];

const DOT: Record<PipelineCardData["status"], string> = {
  healthy: "bg-[color:var(--color-leaf)]",
  error: "bg-[color:var(--color-rose-deep)]",
  idle: "bg-[color:var(--color-ink-4)]",
};

export default function PipelineGrid({
  pipelines,
  starred: initialStarred,
}: {
  pipelines: PipelineCardData[];
  starred: string[];
}) {
  const router = useRouter();
  const [sort, setSort] = useState<SortKey>("recent");
  const [starred, setStarred] = useState(new Set(initialStarred));

  const sorted = useMemo(() => {
    const list = [...pipelines];
    if (sort === "alpha") list.sort((a, b) => a.slug.localeCompare(b.slug));
    else if (sort === "failing")
      list.sort(
        (a, b) =>
          Number(b.status === "error") - Number(a.status === "error") ||
          a.slug.localeCompare(b.slug),
      );
    else
      list.sort(
        (a, b) => Date.parse(b.lastRunAt ?? "0") - Date.parse(a.lastRunAt ?? "0"),
      );
    return list;
  }, [pipelines, sort]);

  async function toggleStar(slug: string) {
    const next = new Set(starred);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setStarred(next);
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const settings = res.ok ? await res.json() : {};
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, starred: [...next] }),
      });
      router.refresh();
    } catch {
      setStarred(starred);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1 px-1">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setSort(c.key)}
            aria-pressed={sort === c.key}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition ${
              sort === c.key
                ? "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink)]"
                : "text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <section
        aria-label="pipelines"
        className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-5"
      >
        {sorted.map((p) => {
          const isStarred = starred.has(p.slug);
          const empty =
            p.graph.sources + p.graph.mappings + p.graph.tables === 0;
          return (
            <div
              key={p.slug}
              className="group relative overflow-hidden rounded-[13px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] transition-colors hover:border-[color:var(--color-carrot)]"
            >
              <Link href={`/p/${p.slug}/graph`} className="block">
                <div className="h-[150px] border-b border-[color:var(--color-rule-soft)] bg-[radial-gradient(circle_at_1px_1px,#35363c_1px,transparent_0)] bg-[length:16px_16px] bg-[#17171a]">
                  {empty ? <EmptyThumb /> : <DagThumbnail graph={p.graph} />}
                </div>
                <div className="flex items-center gap-2.5 px-3.5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-[color:var(--color-ink)]">
                      {p.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-[color:var(--color-ink-3)]">
                      {p.tableCount} table{p.tableCount === 1 ? "" : "s"}, ran{" "}
                      {p.lastRunLabel}
                    </span>
                  </span>
                  <span
                    className={`h-[7px] w-[7px] shrink-0 rounded-full ${DOT[p.status]}`}
                    title={p.status}
                  />
                </div>
              </Link>
              <button
                type="button"
                aria-label={isStarred ? `Unstar ${p.slug}` : `Star ${p.slug}`}
                aria-pressed={isStarred}
                onClick={() => toggleStar(p.slug)}
                className={`absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-lg bg-[rgba(0,0,0,0.45)] transition-opacity focus-visible:opacity-100 ${
                  isStarred
                    ? "text-[color:var(--color-amber-deep)] opacity-100"
                    : "text-[color:var(--color-ink-2)] opacity-0 group-hover:opacity-100"
                }`}
              >
                <IconStar size={14} filled={isStarred} />
              </button>
            </div>
          );
        })}
      </section>
    </>
  );
}
