import {
  createS3Client,
  isNoSuchBucket,
  loadS3Config,
  pipelineS3Config,
  type S3Config,
} from "@/lib/config/s3-client";
import {
  getPipelineConfig,
  listPipelines,
} from "@/lib/services/config-service";
import { listAllObjectKeys, readBodyToBuffer } from "@/lib/services/s3-helpers";
import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { JobRecord } from "@/lib/types/jobs";
import ImportButton from "@/components/layout/ImportButton";
import CreatePipelineButton from "@/components/layout/CreatePipelineButton";
import LandingRail from "@/components/layout/LandingRail";
import { SearchProvider } from "@/components/layout/LandingSearch";
import PipelineGrid, { type PipelineCardData } from "@/components/layout/PipelineGrid";
import type { ThumbGraph, ThumbNode } from "@/components/layout/DagThumbnail";
import { buildGraph, NODE_TYPE } from "@/lib/graph/build";
import { getUiSettings } from "@/lib/services/ui-settings";
import { formatRelative } from "@/lib/format/relative-time";
import { KaretLogo } from "@/components/icons";

export const dynamic = "force-dynamic";

type StatusKind = "healthy" | "error" | "idle";

interface PipelineSummary {
  slug: string;
  tableCount: number;
  /** ISO timestamp of the most recent job, or null if the pipeline has never run. */
  lastRunAt: string | null;
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
    const cfg = loadS3Config();
    const client = createS3Client(cfg);
    const slugs = await listPipelines(client, cfg);
    const summaries = await Promise.all(
      slugs.map((slug) => loadSummary(client, cfg, slug)),
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
    // A transient S3/permission error must not masquerade as "no pipelines",
    // surface it so the user knows the list failed to load rather than being
    // genuinely empty.
    return {
      pipelines: [],
      loadError: err instanceof Error ? err.message : String(err),
    };
  }
}

async function loadSummary(
  client: S3Client,
  base: S3Config,
  slug: string,
): Promise<PipelineSummary> {
  const cfg = pipelineS3Config(base, slug);
  const [configResult, latestTerminalJob] = await Promise.all([
    getPipelineConfig(client, cfg).catch(() => null),
    loadLatestTerminalJob(
      client,
      base.pipelinesBucket,
      `${base.pipelinesPrefix}${slug}/jobs/`,
    ),
  ]);

  // The home-page status only reflects terminal runs. `scheduled` and
  // `running` jobs collapse into the previous terminal status (or
  // `idle` if none) so a webhook upload mid-debounce doesn't make the
  // pipeline flicker between states on the home page.
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
      [NODE_TYPE.lookupMapping]: "lookup",
      [NODE_TYPE.mapping]: "mapping",
      [NODE_TYPE.analyticTable]: "table",
    };
    const built = buildGraph(c);
    const index = new Map(built.nodes.map((n, i) => [n.id, i]));
    // Saved layout positions when stored, else a columnar flow.
    const laidOut = built.nodes.filter((n) => c.layout?.[n.id]).length;
    const useLayout = laidOut >= built.nodes.length / 2;
    const COL: Record<ThumbNode["kind"], number> = { source: 0, lookup: 0, mapping: 1, table: 2 };
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
    tableCount: c?.analytic_tables.length ?? 0,
    lastRunAt: latestTerminalJob?.startedAt ?? null,
    status,
    graph,
  };
}

/**
 * Walk newest-first through job records and return the first terminal
 * one (`completed` or `failed`). Caps at 5 reads, in practice the
 * latest job is almost always terminal, and we only fall through when
 * a webhook batch is in flight.
 */
async function loadLatestTerminalJob(
  client: S3Client,
  bucket: string,
  prefix: string,
): Promise<JobRecord | null> {
  let keys: string[];
  try {
    keys = await listAllObjectKeys(client, bucket, prefix);
  } catch {
    return null;
  }
  const jsonKeys = keys.filter((k) => k.endsWith(".json")).sort().reverse();
  if (jsonKeys.length === 0) return null;
  const limit = Math.min(jsonKeys.length, 5);
  for (let i = 0; i < limit; i++) {
    try {
      const r = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: jsonKeys[i] }),
      );
      const buf = await readBodyToBuffer(r.Body);
      const job = JSON.parse(buf.toString("utf-8")) as JobRecord;
      if (job.status === "completed" || job.status === "failed") return job;
    } catch {
      continue;
    }
  }
  return null;
}

function formatName(slug: string): string {
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}



export default async function Home() {
  const [{ pipelines, bucketError, loadError }, settings] = await Promise.all([
    getPipelines(),
    (async () => {
      try {
        return await getUiSettings(createS3Client(), loadS3Config());
      } catch {
        return { displayName: "", workspaceName: "", starred: [] };
      }
    })(),
  ]);

  const known = new Set(pipelines.map((p) => p.slug));
  const starred = settings.starred.filter((s) => known.has(s));
  const cards: PipelineCardData[] = pipelines.map((p) => ({
    slug: p.slug,
    name: formatName(p.slug),
    tableCount: p.tableCount,
    lastRunAt: p.lastRunAt,
    lastRunLabel: formatRelative(p.lastRunAt).toLowerCase(),
    status: p.status,
    graph: p.graph,
  }));

  return (
    <SearchProvider>
    <div className="flex min-h-screen">
      <LandingRail
        displayName={settings.displayName}
        workspaceName={settings.workspaceName}
        starred={starred}
      />
      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 flex h-[52px] items-center justify-between border-b border-[color:var(--color-rule-soft)] bg-[color:var(--color-bg)] px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="md:hidden">
              <KaretLogo size={24} />
            </span>
            <h1 className="text-[15px] font-semibold text-[color:var(--color-ink)]">
              Pipelines
            </h1>
          </div>
          <div className="flex items-center gap-2.5">
            <ImportButton />
            <CreatePipelineButton />
          </div>
        </div>

        <div className="px-4 py-5 sm:px-6">
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
              starred={starred}
              createSlot={<CreatePipelineButton variant="card" />}
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
