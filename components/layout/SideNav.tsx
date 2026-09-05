"use client";

// Left sidebar shown on every pipeline page, replacing the old TopNav.
//
// Desktop (md+): a fixed 220px rail. Mobile: a 48px top bar whose
// hamburger opens the same rail as an off-canvas drawer.
//
// Contents: back link, pipeline switcher, primary tabs (Graph, Jobs,
// Data), the live dashboards list, pipeline actions (Export, Rename,
// S3 console, Delete), and the user menu. Rename and Delete keep their
// confirmation modals from the TopNav implementation.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  IconChevronDown,
  IconClose,
  IconDownload,
  IconExternal,
  IconMenu,
  IconTrash,
  KaretLogo,
} from "@/components/icons";
import { sanitizeSlug } from "@/lib/config/slug";
import Modal from "@/components/ui/Modal";
import RailUserMenu from "@/components/layout/RailUserMenu";

/** Height of the mobile top bar; pipeline pages offset content by this below md. */
export const MOBILE_NAV_HEIGHT_PX = 48;

const AVATAR_HUES = [16, 42, 122, 200, 268, 330];

function avatarHue(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

export default function SideNav({
  pipeline,
  s3ConsoleUrl,
}: {
  pipeline: string;
  s3ConsoleUrl?: string | null;
}) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [dashboards, setDashboards] = useState<{ id: string; name: string }[]>([]);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [pipelines, setPipelines] = useState<string[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const switcherRef = useRef<HTMLDivElement>(null);

  const base = `/p/${pipeline}`;

  // Close the drawer on navigation.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Load dashboards for the current pipeline.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/p/${pipeline}/dashboards`);
        if (!res.ok) return;
        const body = (await res.json()) as {
          dashboards?: string[];
          listings?: { id: string; name: string }[];
          drafts?: string[];
        };
        if (cancelled) return;
        if (Array.isArray(body.listings)) setDashboards(body.listings);
        else if (Array.isArray(body.dashboards))
          setDashboards(body.dashboards.map((id) => ({ id, name: id })));
        if (Array.isArray(body.drafts)) setDrafts(body.drafts);
      } catch {
        // Nav stays usable if the list can't load.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pipeline]);

  // Load the pipeline list lazily when the switcher opens.
  useEffect(() => {
    if (!switcherOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/pipelines");
        if (!res.ok) return;
        const body = (await res.json()) as { pipelines?: string[] };
        if (!cancelled && Array.isArray(body.pipelines))
          setPipelines(body.pipelines);
      } catch {
        // Silent.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [switcherOpen]);

  useEffect(() => {
    if (!switcherOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!switcherRef.current?.contains(e.target as Node)) setSwitcherOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSwitcherOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [switcherOpen]);

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

      {/* Pipeline identity + switcher */}
      <div ref={switcherRef} className="relative border-b border-[color:var(--color-rule-soft)] pb-2.5">
        <button
          type="button"
          onClick={() => setSwitcherOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={switcherOpen}
          data-testid="side-nav-pipeline-pill"
          title="Switch pipeline"
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-[color:var(--color-surface-2)]"
        >
          <span
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold text-[#1b1b1f]"
            style={{ background: `hsl(${avatarHue(pipeline)} 72% 55%)` }}
            aria-hidden
          >
            {pipeline[0]?.toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-[color:var(--color-ink)]">
            {pipeline}
          </span>
          <IconChevronDown size={12} className="shrink-0 text-[color:var(--color-ink-4)]" />
        </button>
        {switcherOpen ? (
          <div
            role="menu"
            data-testid="side-nav-pipeline-menu"
            className="absolute left-1 right-1 top-full z-30 mt-1 rounded-lg border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface-2)] py-1 shadow-[0_8px_28px_rgba(0,0,0,0.45)]"
          >
            {pipelines.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[color:var(--color-ink-3)]">Loading…</div>
            ) : (
              pipelines.map((slug) => (
                <Link
                  key={slug}
                  href={`/p/${slug}/graph`}
                  onClick={() => setSwitcherOpen(false)}
                  role="menuitem"
                  className={`block px-3 py-1.5 font-mono text-[12px] ${
                    slug === pipeline
                      ? "bg-[color:var(--color-carrot-soft)] text-[color:var(--color-carrot-deep)]"
                      : "text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-rule-soft)]"
                  }`}
                >
                  {slug}
                </Link>
              ))
            )}
          </div>
        ) : null}
      </div>

      {/* Primary tabs */}
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
      </div>

      {/* Dashboards */}
      <div className="flex items-center justify-between px-2.5 pb-1 pt-4 text-[10.5px] font-medium tracking-[0.06em] text-[color:var(--color-ink-3)]">
        DASHBOARDS
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
              <span className="ml-auto shrink-0 rounded bg-[color:var(--color-amber-soft)] px-1 text-[9px] font-semibold text-[color:var(--color-amber-deep)]">
                DRAFT
              </span>
            </Link>
          );
        })}
      </div>

      {/* Pipeline actions */}
      <div className="mt-auto flex flex-col gap-0.5 border-t border-[color:var(--color-rule-soft)] pt-2">
        <a href={`/api/p/${pipeline}/export`} download className={itemClass(false)}>
          <IconDownload size={15} className="text-[color:var(--color-ink-3)]" />
          Export .zip
        </a>
        <button
          type="button"
          data-testid="side-nav-rename-pipeline"
          onClick={() => {
            setRenameValue(pipeline);
            setRenameError(null);
            setRenameOpen(true);
          }}
          className={`${itemClass(false)} w-full text-left`}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[color:var(--color-ink-3)]" aria-hidden>
            <path d="M11.1 2.4a1.4 1.4 0 0 1 2 2L5.5 12l-2.8.8.8-2.8 7.6-7.6Z" />
          </svg>
          Rename
        </button>
        {s3ConsoleUrl ? (
          <a href={s3ConsoleUrl} target="_blank" rel="noreferrer" className={itemClass(false)} title="Open the S3 admin console">
            <IconExternal size={15} className="text-[color:var(--color-ink-3)]" />
            S3 console
          </a>
        ) : null}
        <button
          type="button"
          data-testid="side-nav-delete-pipeline"
          disabled={deleting}
          onClick={() => {
            setDeleteConfirm("");
            setDeleteError(null);
            setDeleteOpen(true);
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] text-[color:var(--color-rose-deep)] hover:bg-[color:var(--color-rose-soft)] disabled:opacity-50"
        >
          <IconTrash size={15} />
          Delete pipeline…
        </button>
        <RailUserMenu displayName={null} />
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
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
        <span className="truncate font-mono text-[12.5px] text-[color:var(--color-ink)]">
          {pipeline}
        </span>
      </div>

      {/* Mobile drawer */}
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

      {/* Desktop rail */}
      <nav
        data-testid="side-nav"
        className="sticky top-0 hidden h-screen w-[220px] shrink-0 border-r border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] md:block"
      >
        {rail}
      </nav>

      {deleteOpen ? (
        <Modal
          open={deleteOpen}
          onClose={() => {
            if (!deleting) setDeleteOpen(false);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (sanitizeSlug(deleteConfirm) !== pipeline) {
                setDeleteError(`Type "${pipeline}" exactly to confirm deletion.`);
                return;
              }
              setDeleting(true);
              setDeleteError(null);
              try {
                const res = await fetch(`/api/pipelines/${encodeURIComponent(pipeline)}`, {
                  method: "DELETE",
                });
                if (!res.ok) {
                  const body = await res.json().catch(() => ({}));
                  setDeleteError(
                    `Delete failed: ${body.message ?? body.error ?? res.statusText}`,
                  );
                  return;
                }
                setDeleteOpen(false);
                router.push("/");
                router.refresh();
              } catch (err) {
                setDeleteError((err as Error).message);
              } finally {
                setDeleting(false);
              }
            }}
          >
            <h2 className="text-lg font-semibold text-[color:var(--color-rose-deep)]">
              Delete pipeline
            </h2>
            <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
              This permanently removes the config, dashboards, raw CSVs, Parquet
              output, and job history for{" "}
              <code className="rounded bg-[color:var(--color-surface-2)] px-1 font-mono text-[11px]">
                {pipeline}
              </code>
              . Cannot be undone.
            </p>

            <div className="mt-4 rounded-md border border-[color:var(--color-amber-soft)] bg-[color:var(--color-amber-soft)] px-3 py-2 text-xs text-[color:var(--color-amber-deep)]">
              Want a backup first?{" "}
              <a href={`/api/p/${pipeline}/export`} download className="font-medium underline">
                Download a .zip
              </a>{" "}
              of this pipeline before deleting.
            </div>

            <label className="mt-4 block text-sm font-medium text-[color:var(--color-ink-2)]">
              Type{" "}
              <code className="rounded bg-[color:var(--color-surface-2)] px-1 font-mono text-[11px]">
                {pipeline}
              </code>{" "}
              to confirm
            </label>
            <input
              autoFocus
              type="text"
              data-testid="delete-pipeline-confirm"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-3 py-2 font-mono text-sm focus:border-[color:var(--color-rose-deep)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-rose-soft)]"
            />

            {deleteError ? (
              <p className="mt-3 text-sm text-[color:var(--color-rose-deep)]" role="alert">
                {deleteError}
              </p>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
                className="rounded-md px-4 py-2 text-sm text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deleting || sanitizeSlug(deleteConfirm) !== pipeline}
                data-testid="delete-pipeline-submit"
                className="rounded-md bg-[color:var(--color-rose-deep)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete pipeline"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {renameOpen ? (
        <Modal
          open={renameOpen}
          onClose={() => {
            if (!renaming) setRenameOpen(false);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const newSlug = sanitizeSlug(renameValue);
              if (!newSlug) {
                setRenameError("Name is required");
                return;
              }
              if (newSlug === pipeline) {
                setRenameError("New name is the same as the current name");
                return;
              }
              setRenaming(true);
              setRenameError(null);
              try {
                const res = await fetch(`/api/pipelines/${encodeURIComponent(pipeline)}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ newSlug }),
                });
                const data = await res.json().catch(() => ({}));
                if (res.status === 409) {
                  setRenameError(`Pipeline "${newSlug}" already exists`);
                  return;
                }
                if (!res.ok || !data.ok) {
                  setRenameError(data.message ?? data.error ?? `Rename failed (${res.status})`);
                  return;
                }
                const newPath = pathname.replace(
                  new RegExp(`^/p/${pipeline}(?=/|$)`),
                  `/p/${newSlug}`,
                );
                setRenameOpen(false);
                router.push(newPath);
                router.refresh();
              } catch (err) {
                setRenameError((err as Error).message);
              } finally {
                setRenaming(false);
              }
            }}
          >
            <h2 className="text-lg font-semibold">Rename pipeline</h2>
            <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
              The URL and S3 prefix change from{" "}
              <code className="rounded bg-[color:var(--color-surface-2)] px-1 font-mono text-[11px]">
                {pipeline}
              </code>{" "}
              to the new name. Existing links to the old URL will break.
            </p>

            <label className="mt-4 block text-sm font-medium text-[color:var(--color-ink-2)]">
              New name
            </label>
            <input
              autoFocus
              type="text"
              data-testid="rename-pipeline-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="mt-1 w-full rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-3 py-2 text-sm focus:border-[color:var(--color-carrot)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-carrot-soft)]"
            />
            <p className="mt-1 text-xs text-[color:var(--color-ink-4)]">
              Will be saved as{" "}
              <code className="rounded bg-[color:var(--color-surface-2)] px-1 font-mono">
                {sanitizeSlug(renameValue) || "…"}
              </code>
            </p>

            {renameError ? (
              <p className="mt-3 text-sm text-[color:var(--color-rose-deep)]" role="alert">
                {renameError}
              </p>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameOpen(false)}
                disabled={renaming}
                className="rounded-md px-4 py-2 text-sm text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={renaming}
                data-testid="rename-pipeline-submit"
                className="rounded-md bg-[color:var(--color-carrot)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--color-carrot-deep)] disabled:opacity-50"
              >
                {renaming ? "Renaming…" : "Rename"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
