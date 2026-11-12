// What the landing page shows for each pipeline: name, table count, the last
// run's status and time, and a thumbnail of its graph.

import { isNoSuchBucket } from "@/lib/config/s3-client";
import type { ThumbGraph, ThumbNode } from "@/components/layout/DagThumbnail";
import { buildGraph, NODE_TYPE } from "@/lib/graph/build";
import { getLiveConfig, listPipelines } from "@/lib/services/pipeline-store";
import { latestTerminalJob as loadLatestTerminalJob } from "@/lib/services/job-store";
import { visiblePipelineSlugs } from "@/lib/auth/pipeline-access";
import type { Principal } from "@/lib/auth/service-token";

export type StatusKind = "healthy" | "error" | "idle";

export interface PipelineSummary {
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

export interface PipelineOverview {
  pipelines: PipelineSummary[];
  bucketError?: string;
  loadError?: string;
}

/** The pipelines `principal` can see, with what the landing page shows for each. */
export async function pipelineOverview(principal: Principal | null): Promise<PipelineOverview> {
  try {
    // The registry lists pipelines now, so one unparseable config can no
    // longer take the whole landing page down. Members-only pipelines are
    // filtered out here rather than rendering cards that 404 when clicked.
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
