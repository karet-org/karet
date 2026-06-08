import Link from "next/link";
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
import UserMenu from "@/components/layout/UserMenu";
import { KaretLogo } from "@/components/icons";

export const dynamic = "force-dynamic";

type StatusKind = "healthy" | "error" | "idle";

interface PipelineSummary {
  slug: string;
  tableCount: number;
  /** ISO timestamp of the most recent job, or null if the pipeline has never run. */
  lastRunAt: string | null;
  status: StatusKind;
}

interface PipelineResult {
  pipelines: PipelineSummary[];
  bucketError?: string;
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
          "S3 bucket does not exist. Create it first or check the S3_BUCKET environment variable.",
      };
    }
    return { pipelines: [] };
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
      base.bucket,
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

  return {
    slug,
    tableCount: configResult?.config.analytic_tables.length ?? 0,
    lastRunAt: latestTerminalJob?.startedAt ?? null,
    status,
  };
}

/**
 * Walk newest-first through job records and return the first terminal
 * one (`completed` or `failed`). Caps at 5 reads -- in practice the
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

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "Never";
  const seconds = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} mo ago`;
  const years = Math.round(months / 12);
  return `${years} yr ago`;
}

export default async function Home() {
  const { pipelines, bucketError } = await getPipelines();

  return (
    <>
      <nav
        className="sticky top-0 z-20 flex h-[52px] items-center gap-1 border-b border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-3 sm:px-5"
      >
        <Link
          href="/"
          className="mr-3 flex items-center gap-2 text-[15px] font-semibold tracking-[-0.005em] text-[color:var(--color-ink)]"
        >
          <KaretLogo size={20} />
          Karet
        </Link>
        <Link
          href="/"
          className="rounded-md bg-[color:var(--color-carrot-soft)] px-3 py-1.5 text-[13.5px] text-[color:var(--color-carrot-deep)]"
        >
          Home
        </Link>
        <a
          href="https://karet.joeyshi.xyz"
          target="_blank"
          rel="noreferrer"
          className="rounded-md px-3 py-1.5 text-[13.5px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]"
        >
          Docs
        </a>
        <div className="ml-auto">
          <UserMenu />
        </div>
      </nav>

      <main className="mx-auto max-w-[1080px] px-4 py-9 sm:px-6 lg:py-12">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.015em] text-[color:var(--color-ink)]">
              Your pipelines
            </h1>
            <p className="mt-1 max-w-[56ch] text-[14px] text-[color:var(--color-ink-3)]">
              Wire CSVs in S3 to clean Parquet tables, then chart them.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <ImportButton />
            <CreatePipelineButton />
          </div>
        </header>

        {bucketError ? (
          <div
            className="mt-8 rounded-md border border-[color:var(--color-rose-soft)] bg-[color:var(--color-rose-soft)] px-4 py-3 text-sm text-[color:var(--color-rose-deep)]"
            role="alert"
          >
            <strong className="font-semibold">S3 bucket not found.</strong>{" "}
            {bucketError}
          </div>
        ) : pipelines.length === 0 ? (
          <EmptyState />
        ) : (
          <PipelineList pipelines={pipelines} />
        )}
      </main>
    </>
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

function PipelineList({ pipelines }: { pipelines: PipelineSummary[] }) {
  return (
    <section
      aria-label="pipelines"
      className="mt-8 overflow-hidden rounded-[10px] border border-[color:var(--color-rule)] bg-[color:var(--color-surface)]"
    >
      <div className="hidden grid-cols-[minmax(0,1fr)_90px_120px_110px] items-center gap-4 border-b border-[color:var(--color-rule)] bg-[color:var(--color-surface-2)] px-5 py-3 text-[11px] font-medium uppercase tracking-[0.06em] text-[color:var(--color-ink-3)] sm:grid">
        <div>Name</div>
        <div className="text-right">Tables</div>
        <div className="text-right">Last run</div>
        <div className="text-right">Status</div>
      </div>
      {pipelines.map((p) => (
        <Link
          key={p.slug}
          href={`/p/${p.slug}/graph`}
          className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-[color:var(--color-rule-soft)] px-4 py-4 last:border-b-0 hover:bg-[color:var(--color-surface-2)] sm:grid-cols-[minmax(0,1fr)_90px_120px_110px] sm:px-5"
        >
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold text-[color:var(--color-ink)] group-hover:text-[color:var(--color-carrot-deep)]">
              {formatName(p.slug)}
            </div>
            <div className="mt-0.5 truncate font-mono text-[12px] text-[color:var(--color-ink-3)]">
              {p.slug}
            </div>
          </div>
          <div className="hidden text-right font-mono text-[13px] tabular-nums text-[color:var(--color-ink)] sm:block">
            {p.tableCount}
          </div>
          <div className="hidden text-right font-mono text-[12.5px] tabular-nums text-[color:var(--color-ink-2)] sm:block">
            {formatRelative(p.lastRunAt)}
          </div>
          <div className="text-right">
            <StatusPill status={p.status} />
          </div>
        </Link>
      ))}
    </section>
  );
}

function StatusPill({ status }: { status: StatusKind }) {
  const cls =
    status === "healthy"
      ? "bg-[color:var(--color-leaf-soft)] text-[color:var(--color-leaf-deep)]"
      : status === "error"
        ? "bg-[color:var(--color-rose-soft)] text-[color:var(--color-rose-deep)]"
        : "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-3)]";
  const label =
    status === "healthy" ? "Healthy" : status === "error" ? "Error" : "Idle";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[11.5px] font-medium ${cls}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

