import { createS3Client, isNoSuchBucket, loadS3Config } from "@/lib/config/s3-client";

import ImportButton from "@/components/layout/ImportButton";
import CreatePipelineButton from "@/components/layout/CreatePipelineButton";
import LandingRail, { MobileRailToggle } from "@/components/layout/LandingRail";
import { SearchProvider } from "@/components/layout/LandingSearch";
import PipelineGrid, { type PipelineCardData } from "@/components/layout/PipelineGrid";
import type { ThumbGraph, ThumbNode } from "@/components/layout/DagThumbnail";
import { buildGraph, NODE_TYPE } from "@/lib/graph/build";
import { getUiSettings } from "@/lib/services/ui-settings";
import { formatRelative } from "@/lib/format/relative-time";
import { getLiveConfig, listPipelines } from "@/lib/services/pipeline-store";
import { latestTerminalJob as loadLatestTerminalJob } from "@/lib/services/job-store";
import { currentPrincipal } from "@/lib/auth/current-user";
import { visiblePipelineSlugs } from "@/lib/auth/pipeline-access";

export const dynamic = "force-dynamic";

type StatusKind = "healthy" | "error" | "idle";

interface PipelineSummary {
  slug: string;
  /** Display name from pipeline.json; the slug when the config is unreadable. */
  name: string;
  tableCount: number;
  /** ISO timestamp of the most recent job, or null if the pipeline has never run. */
  lastRunAt: string | null;
  /** "Recently run" sort key: last run, else the config's S3 LastModified. */
  activityAt: string | null;
  status: StatusKind;
  graph: ThumbGraph;
}

interface PipelineResult {
  pipelines: PipelineSummary[];
  bucketError?: string;
  loadError?: string;
}

async function getPipelines(): Promise<PipelineResult> {
  try {
    // The registry lists pipelines now, so one unparseable config can no
    // longer take the whole landing page down. Members-only pipelines are
    // filtered out here rather than rendering cards that 404 when clicked.
    const principal = await currentPrincipal();
    const visible = principal ? await visiblePipelineSlugs(principal) : ([] as string[]);
    const registered = await listPipelines(visible === "all" ? undefined : visible);
    const summaries = await Promise.all(
      registered.map((p) => loadSummary(p.slug)),
    );
    return { pipelines: summaries };
  } catch (err) {
    if (isNoSuchBucket(err)) {
      return {
        pipelines: [],
        bucketError:
          "S3 bucket does not exist. Create it first or check the S3_BUCKET_PIPELINES / S3_BUCKET_LAKE / S3_BUCKET_WAREHOUSE environment variables.",
      };
    }
    // Surface transient S3/permission errors instead of rendering them
    // as "no pipelines".
    return {
      pipelines: [],
      loadError: err instanceof Error ? err.message : String(err),
    };
  }
}

async function loadSummary(slug: string): Promise<PipelineSummary> {
  const [configResult, latestTerminalJob] = await Promise.all([
    getLiveConfig(slug).catch(() => null),
    // One indexed query instead of listing and reading job objects.
    loadLatestTerminalJob(slug).catch(() => null),
  ]);

  // Only terminal runs count: `scheduled`/`running` collapse into the
  // previous status so a mid-debounce webhook doesn't flicker the card.
  const status: StatusKind =
    latestTerminalJob === null
      ? "idle"
      : latestTerminalJob.status === "failed"
        ? "error"
        : "healthy";

  const c = configResult?.config;
  const graph: ThumbGraph = { nodes: [], edges: [] };
  if (c) {
    const KIND: Record<string, ThumbNode["kind"]> = {
      [NODE_TYPE.sourceContainer]: "source",
      [NODE_TYPE.dimension]: "dimension",
      [NODE_TYPE.mapping]: "mapping",
      [NODE_TYPE.analyticTable]: "table",
    };
    const built = buildGraph(c);
    const index = new Map(built.nodes.map((n, i) => [n.id, i]));
    // Saved layout positions when stored, else a columnar flow.
    const laidOut = built.nodes.filter((n) => c.layout?.[n.id]).length;
    const useLayout = laidOut >= built.nodes.length / 2;
    const COL: Record<ThumbNode["kind"], number> = { source: 0, dimension: 0, mapping: 1, table: 2 };
    const rowCounters = [0, 0, 0];
    graph.nodes = built.nodes.map((n) => {
      const kind = KIND[n.type ?? ""] ?? "mapping";
      if (useLayout) return { x: n.position.x, y: n.position.y, kind };
      const col = COL[kind];
      return { x: col * 100, y: rowCounters[col]++ * 40, kind };
    });
    graph.edges = built.edges.flatMap((e) => {
      const a = index.get(e.source);
      const b = index.get(e.target);
      return a === undefined || b === undefined ? [] : [[a, b] as [number, number]];
    });
  }

  return {
    slug,
    name: c?.name?.trim() || slug,
    tableCount: c?.analytic_tables.length ?? 0,
    lastRunAt: latestTerminalJob?.startedAt ?? null,
    // No runs yet: fall back to when the live config was saved.
    activityAt: latestTerminalJob?.startedAt ?? configResult?.createdAt ?? null,
    status,
    graph,
  };
}

/** Newest-first scan for the first `completed`/`failed` job, capped at 5 reads. */

export default async function Home() {
  const [{ pipelines, bucketError, loadError }, settings] = await Promise.all([
    getPipelines(),
    (async () => {
      try {
        return await getUiSettings(createS3Client(), loadS3Config());
      } catch {
        return { workspaceName: "", starred: [] };
      }
    })(),
  ]);

  const names = new Map(pipelines.map((p) => [p.slug, p.name]));
  const starred = settings.starred
    .filter((s) => names.has(s))
    .map((id) => ({ id, name: names.get(id)! }));
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
    <SearchProvider>
    <div className="flex h-screen overflow-hidden">
      <LandingRail
        workspaceName={settings.workspaceName}
        starred={starred}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-[color:var(--color-rule-soft)] bg-[color:var(--color-bg)] px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <MobileRailToggle
              workspaceName={settings.workspaceName}
              starred={starred}
            />
            <h1 className="text-[15px] font-semibold text-[color:var(--color-ink)]">
              Pipelines
            </h1>
          </div>
        </div>

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
      </main>
    </div>
    </SearchProvider>
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
