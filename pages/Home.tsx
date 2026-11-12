import { useLoaderData } from "react-router";
import ImportButton from "@/components/layout/ImportButton";
import CreatePipelineButton from "@/components/layout/CreatePipelineButton";
import PipelineGrid, { type PipelineCardData } from "@/components/layout/PipelineGrid";
import { formatRelative } from "@/lib/format/relative-time";
import type { PipelineOverview } from "@/lib/services/pipeline-overview";
import { LandingShell, type RailData } from "./Landing";

interface HomeData extends PipelineOverview {
  workspaceName: string;
  /** Starred pipeline ids. */
  starredIds: string[];
}

export async function homeLoader(): Promise<HomeData> {
  const [overviewRes, settingsRes] = await Promise.all([
    fetch("/api/pipelines/overview"),
    fetch("/api/settings").catch(() => null),
  ]);
  const overview: PipelineOverview = overviewRes.ok
    ? await overviewRes.json()
    : { pipelines: [], loadError: `HTTP ${overviewRes.status}` };
  const settings = settingsRes?.ok
    ? ((await settingsRes.json()) as { workspaceName: string; starred: string[] })
    : { workspaceName: "", starred: [] };
  return { ...overview, workspaceName: settings.workspaceName, starredIds: settings.starred };
}

export default function Home() {
  const { pipelines, bucketError, loadError, workspaceName, starredIds } = useLoaderData<HomeData>();

  const names = new Map(pipelines.map((p) => [p.slug, p.name]));
  const starred = starredIds.filter((s) => names.has(s)).map((id) => ({ id, name: names.get(id)! }));
  const rail: RailData = { workspaceName, starred };
  const cards: PipelineCardData[] = pipelines.map((p) => ({
    slug: p.slug,
    name: p.name,
    tableCount: p.tableCount,
    lastRunAt: p.lastRunAt,
    activityAt: p.activityAt,
    lastRunLabel: formatRelative(p.lastRunAt).toLowerCase(),
    status: p.status,
    graph: p.graph,
  }));

  return (
    <LandingShell rail={rail} title="Pipelines">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {bucketError ? (
          <div
            className="rounded-md border border-[color:var(--color-rose-soft)] bg-[color:var(--color-rose-soft)] px-4 py-3 text-sm text-[color:var(--color-rose-deep)]"
            role="alert"
          >
            <strong className="font-semibold">S3 bucket not found.</strong>{" "}
            {bucketError}
          </div>
        ) : loadError ? (
          <div
            className="rounded-md border border-[color:var(--color-rose-soft)] bg-[color:var(--color-rose-soft)] px-4 py-3 text-sm text-[color:var(--color-rose-deep)]"
            role="alert"
          >
            <strong className="font-semibold">Couldn&apos;t load pipelines.</strong>{" "}
            {loadError}
          </div>
        ) : pipelines.length === 0 ? (
          <EmptyState />
        ) : (
          <PipelineGrid
            pipelines={cards}
            starred={starred.map((s) => s.id)}
            createSlot={<CreatePipelineButton variant="card" />}
            actions={
              <>
                <ImportButton />
                <CreatePipelineButton />
              </>
            }
          />
        )}
      </div>
    </LandingShell>
  );
}

function EmptyState() {
  return (
    <div className="mt-8 rounded-[10px] border border-dashed border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-8 py-14 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-[14px] bg-[color:var(--color-carrot-soft)] text-[color:var(--color-carrot-deep)]">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 3v12m-5-5 5 5 5-5" />
          <path d="M3 21h18" />
        </svg>
      </div>
      <h2 className="mt-4 text-[18px] font-semibold text-[color:var(--color-ink)]">
        Start with a template
      </h2>
      <p className="mx-auto mt-1.5 max-w-[52ch] text-[14px] text-[color:var(--color-ink-3)]">
        The Spending Tracker template ships with seed data, so you can see the
        full Source → Mapping → Table → Dashboard flow in one click.{" "}
        <a
          href="https://karet.joeyshi.xyz/guide/getting-started"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-[color:var(--color-carrot-deep)] underline-offset-2 hover:underline"
        >
          How it works ↗
        </a>
      </p>
    </div>
  );
}
