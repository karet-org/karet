// Pipeline sidebar: rail on desktop, drawer behind a top bar on mobile.

import { Link, usePathname, useRouter } from "@/lib/client/navigation";
import { useEffect, useRef, useState } from "react";
import {
  IconChevronDown,
  IconClose,
  IconDownload,
  IconMenu,
  IconTrash,
  KaretLogo,
} from "@/components/icons";
import { cachedJson } from "@/lib/client/fetch-cache";
import { notifyDashboardsChanged, useDashboardsIndex } from "@/lib/client/dashboards-index";
import { pipelineHue } from "@/lib/config/pipeline-hue";
import { formatRelative } from "@/lib/format/relative-time";
import { useCanHere } from "@/lib/client/use-current-user";
import { useDismiss } from "@/lib/client/use-dismiss";
import { DeletePipelineModal, RenamePipelineModal } from "./PipelineModals";

/** Mobile top bar height; pages offset content by this below md. */
const MOBILE_NAV_HEIGHT_PX = 48;

export default function SideNav({ pipeline }: { pipeline: string }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { listings: dashboards, drafts } = useDashboardsIndex(pipeline);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(pipeline);
  const [creating, setCreating] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  // Admin *here*: an owner holds admin on their pipeline and less elsewhere.
  const isAdmin = useCanHere(pipeline, "admin");
  const switcherRef = useRef<HTMLDivElement>(null);

  const base = `/p/${pipeline}`;

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // The `pipeline` prop is the immutable id; the name is cosmetic.
  useEffect(() => {
    let cancelled = false;
    setDisplayName(pipeline);
    (async () => {
      try {
        const body = await cachedJson<{ name?: string }>(`/api/p/${pipeline}/config`);
        if (!cancelled && body.name?.trim()) setDisplayName(body.name.trim());
      } catch {
        // Id stays as the label.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pipeline]);

  // Latest terminal run for the identity subline.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const body = await cachedJson<{
          jobs?: { status: string; startedAt?: string }[];
        }>(`/api/p/${pipeline}/jobs?page=1&pageSize=5`);
        if (cancelled || !Array.isArray(body.jobs)) return;
        const terminal = body.jobs.find(
          (j) => j.status === "completed" || j.status === "failed" || j.status === "abandoned",
        );
        if (!terminal) {
          setStatusLine("Never run");
          return;
        }
        const ago = formatRelative(terminal.startedAt).toLowerCase();
        setStatusLine(
          terminal.status === "completed" ? `Healthy, ran ${ago}` : `Last run failed ${ago}`,
        );
      } catch {
        // Subline stays hidden.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pipeline]);

  useDismiss(switcherRef, switcherOpen, () => setSwitcherOpen(false));

  const isActive = (href: string) => pathname.startsWith(href);
  const itemClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors ${
      active
        ? "bg-[color:var(--color-carrot-soft)] font-medium text-[color:var(--color-ink)]"
        : "text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]"
    }`;
  const iconClass = (active: boolean) =>
    active ? "text-[color:var(--color-carrot)]" : "text-[color:var(--color-ink-3)]";

  const rail = (
    <div className="flex h-full flex-col p-2.5">
      <Link
        href="/"
        className="flex items-center gap-1.5 px-2 pb-2 pt-1 text-[12px] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
      >
        <IconChevronDown size={12} className="rotate-90" />
        All pipelines
      </Link>

      <div ref={switcherRef} className="relative border-b border-[color:var(--color-rule-soft)] pb-2.5">
        <button
          type="button"
          onClick={() => setSwitcherOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={switcherOpen}
          data-testid="side-nav-pipeline-pill"
          title="Pipeline actions"
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-[color:var(--color-surface-2)]"
        >
          <span
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold text-[#1b1b1f]"
            style={{ background: `hsl(${pipelineHue(pipeline)} 72% 55%)` }}
            aria-hidden
          >
            {displayName[0]?.toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium leading-tight text-[color:var(--color-ink)]">
              {displayName}
            </span>
            {statusLine && (
              <span className="block truncate text-[10.5px] leading-tight text-[color:var(--color-ink-3)]">
                {statusLine}
              </span>
            )}
          </span>
          <IconChevronDown size={12} className="shrink-0 text-[color:var(--color-ink-4)]" />
        </button>
        {switcherOpen ? (
          <div
            role="menu"
            data-testid="side-nav-pipeline-menu"
            className="absolute left-1 right-1 top-full z-30 mt-1 rounded-lg border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface-2)] py-1 shadow-[0_8px_28px_rgba(0,0,0,0.45)]"
          >
            {/* Ordered by how often each is wanted and what it costs, which puts
                delete last. Rename and delete need admin on this pipeline. */}
            {isAdmin && (
              <button
                type="button"
                role="menuitem"
                data-testid="side-nav-rename-pipeline"
                disabled={dialog !== null}
                onClick={() => {
                  setSwitcherOpen(false);
                  setDialog("rename");
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-rule-soft)] hover:text-[color:var(--color-ink)] disabled:opacity-50"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <path d="M11.1 2.4a1.4 1.4 0 0 1 2 2L5.5 12l-2.8.8.8-2.8 7.6-7.6Z" />
                </svg>
                Rename pipeline
              </button>
            )}
            <a
              href={`/api/p/${pipeline}/export`}
              download
              role="menuitem"
              data-testid="side-nav-export"
              onClick={() => setSwitcherOpen(false)}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-rule-soft)] hover:text-[color:var(--color-ink)]"
            >
              <IconDownload size={14} className="text-[color:var(--color-ink-3)]" />
              Export .zip
            </a>
            {isAdmin && (
              <button
                type="button"
                role="menuitem"
                data-testid="side-nav-delete-pipeline"
                disabled={dialog !== null}
                onClick={() => {
                  setSwitcherOpen(false);
                  setDialog("delete");
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] text-[color:var(--color-rose-deep)] hover:bg-[color:var(--color-rose-soft)] disabled:opacity-50"
              >
                <IconTrash size={14} />
                Delete pipeline…
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-0.5 pt-2.5">
        <Link href={`${base}/graph`} className={itemClass(isActive(`${base}/graph`))}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={iconClass(isActive(`${base}/graph`))} aria-hidden>
            <circle cx="4" cy="4" r="2" /><circle cx="12" cy="8" r="2" /><circle cx="4" cy="12" r="2" />
            <path d="M6 4.7 10 7.3M6 11.3 10 8.7" />
          </svg>
          Graph
        </Link>
        <Link href={`${base}/jobs`} className={itemClass(isActive(`${base}/jobs`))}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={iconClass(isActive(`${base}/jobs`))} aria-hidden>
            <path d="M13 8A5 5 0 1 1 8 3" /><path d="M8 5.5V8l2 1.3" /><path d="M13 3v3h-3" />
          </svg>
          Jobs
        </Link>
        <Link href={`${base}/data`} className={itemClass(isActive(`${base}/data`))}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={iconClass(isActive(`${base}/data`))} aria-hidden>
            <ellipse cx="8" cy="4" rx="5.5" ry="2.2" />
            <path d="M2.5 4v8c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2V4" />
            <path d="M2.5 8c0 1.2 2.5 2.2 5.5 2.2S13.5 9.2 13.5 8" />
          </svg>
          Data
        </Link>
        {isAdmin && (
          <Link href={`${base}/access`} className={itemClass(isActive(`${base}/access`))}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={iconClass(isActive(`${base}/access`))} aria-hidden>
              <circle cx="6" cy="6" r="2.4" /><path d="M2.2 13.2c.5-2 2-3.2 3.8-3.2s3.3 1.2 3.8 3.2" />
              <path d="M11 5.5h3.2M11 8h3.2M11 10.5h2" />
            </svg>
            Access
          </Link>
        )}
        <Link href={`${base}/history`} className={itemClass(isActive(`${base}/history`))}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={iconClass(isActive(`${base}/history`))} aria-hidden>
            <path d="M3 8a5 5 0 1 0 5-5" /><path d="M3 3v3h3" /><path d="M8 5.5V8l2.2 1.4" />
          </svg>
          History
        </Link>
      </div>

      <div className="flex items-center justify-between px-2.5 pb-1 pt-4 text-[10.5px] font-medium tracking-[0.06em] text-[color:var(--color-ink-3)]">
        Dashboards
        <button
          type="button"
          aria-label="New dashboard"
          title="New dashboard"
          disabled={creating}
          data-testid="side-nav-new-dashboard"
          onClick={async () => {
            setCreating(true);
            try {
              const res = await fetch(`/api/p/${pipeline}/dashboards`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              });
              const body = (await res.json()) as { id?: string };
              if (res.ok && body.id) {
                notifyDashboardsChanged(pipeline);
                router.push(`${base}/dashboards/${body.id}/edit`);
              }
            } finally {
              setCreating(false);
            }
          }}
          className="rounded p-0.5 text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)] disabled:opacity-50"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      </div>
      <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto" data-testid="side-nav-dashboards">
        {dashboards.length === 0 ? (
          <div className="px-2.5 py-1 text-[12px] text-[color:var(--color-ink-4)]">
            No dashboards yet
          </div>
        ) : (
          dashboards.map(({ id, name }) => {
            const active = pathname.startsWith(`${base}/dashboards/${id}`);
            return (
              <Link key={id} href={`${base}/dashboards/${id}`} className={itemClass(active)}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={`shrink-0 ${iconClass(active)}`} aria-hidden>
                  <path d="M2 13.5h12M4 13V8m4 5V4.5m4 8.5V6.5" />
                </svg>
                <span className="truncate">{name}</span>
              </Link>
            );
          })
        )}
        {drafts.map((id) => {
          const active = pathname.startsWith(`${base}/dashboards/${id}/edit`);
          return (
            <Link key={id} href={`${base}/dashboards/${id}/edit`} className={itemClass(active)}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={`shrink-0 ${iconClass(active)}`} aria-hidden>
                <path d="M11.1 2.4a1.4 1.4 0 0 1 2 2L5.5 12l-2.8.8.8-2.8 7.6-7.6Z" />
              </svg>
              <span className="truncate">{id}</span>
              <span className="ml-auto shrink-0 rounded bg-[color:var(--color-amber-soft)] px-1 text-[9.5px] font-semibold text-[color:var(--color-amber-deep)]">
                Draft
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <div
        className="sticky top-0 z-20 flex items-center gap-2 border-b border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] px-3 md:hidden"
        style={{ height: MOBILE_NAV_HEIGHT_PX }}
        data-testid="side-nav-mobile-bar"
      >
        <button
          type="button"
          onClick={() => setDrawerOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={drawerOpen}
          aria-label={drawerOpen ? "Close menu" : "Open menu"}
          data-testid="side-nav-mobile-toggle"
          className="rounded-md p-1.5 text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
        >
          {drawerOpen ? <IconClose size={17} /> : <IconMenu size={17} />}
        </button>
        <Link href="/" className="flex items-center">
          <KaretLogo size={22} />
        </Link>
        <span className="truncate text-[12.5px] font-medium text-[color:var(--color-ink)]">
          {displayName}
        </span>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <nav
            data-testid="side-nav-drawer"
            className="absolute bottom-0 left-0 top-0 w-[260px] overflow-y-auto border-r border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)]"
          >
            {rail}
          </nav>
        </div>
      ) : null}

      <nav
        data-testid="side-nav"
        className="hidden h-full w-[220px] shrink-0 border-r border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] md:block"
      >
        {rail}
      </nav>

      {dialog === "delete" ? (
        <DeletePipelineModal pipeline={pipeline} displayName={displayName} onClose={() => setDialog(null)} />
      ) : dialog === "rename" ? (
        <RenamePipelineModal
          pipeline={pipeline}
          displayName={displayName}
          onClose={() => setDialog(null)}
          onRenamed={setDisplayName}
        />
      ) : null}
    </>
  );
}
